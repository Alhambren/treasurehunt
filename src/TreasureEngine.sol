// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {IHuntToken} from "./interfaces/IHuntToken.sol";
import {IMapToken} from "./interfaces/IMapToken.sol";
import {IHuntStaking} from "./interfaces/IHuntStaking.sol";
import {IAerodromeRouter} from "./interfaces/IAerodromeRouter.sol";
import {IVRFCoordinatorV2Plus} from "./interfaces/IVRFCoordinatorV2Plus.sol";
import {ReentrancyGuard} from "./utils/ReentrancyGuard.sol";
import {VRFConsumerBaseV2Plus} from "./utils/VRFConsumerBaseV2Plus.sol";
import {MathExp} from "./utils/MathExp.sol";

contract TreasureEngine is VRFConsumerBaseV2Plus, ReentrancyGuard {
    // === Global Constants ===
    uint256 public constant CHAIN_ID = 8453;
    uint256 public constant MIN_BET = 100_000; // 0.10 USDC (6 decimals)
    uint256 public constant MAX_BET_BPS = 100; // 1% of M
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant INITIAL_M = 100 * 1e6;
    uint256 public constant INITIAL_J = 0;
    uint256 public constant INITIAL_EPOCH = 0;
    uint256 public constant VRF_TIMEOUT = 1 hours;
    uint256 public constant MAX_CASCADE = 5;
    uint256 public constant HUNT_SLIPPAGE_BPS = 300; // 3%

    // Contribution routing
    uint256 public constant TO_TREASURE_BPS = 5000;
    uint256 public constant TO_STAKERS_MAP_BPS = 1900;
    uint256 public constant TO_CARTOGRAPHER_MAP_BPS = 75;
    uint256 public constant TO_MAPMAKER_MAP_BPS = 25;
    uint256 public constant TO_BURN_MAP_BPS = 2000;
    uint256 public constant TO_COMMUNITY_HUNT_BPS = 1000;

    // Treasure distribution
    uint256 public constant DISCOVERER_BPS = 5000;
    uint256 public constant STAKERS_BPS = 4000;
    uint256 public constant BURN_HUNT_BPS = 500;
    uint256 public constant CARTOGRAPHER_BPS = 375;
    uint256 public constant MAPMAKER_BPS = 125;
    uint256 public constant ZERO_QUAL_BURN_BPS = 2000;
    uint256 public constant ZERO_QUAL_COMMUNITY_BPS = 2000;

    // Emissions (pre-funded via deployer; no minting)
    uint256 public constant E_CAP = 300_000_000 * 1e18;
    uint256 public constant WAD = 1e18;
    uint256 public constant R_0 = 1e18;
    uint256 public constant R_MIN = 2e16; // 0.02 * 1e18
    uint256 public constant LAMBDA_WAD = 4e13; // 4.0e-5 * 1e18
    uint256 public constant EXP_MAX_INPUT = 133_084258667509499441;

    // VRF config
    uint16 public constant REQUEST_CONFIRMATIONS = 3;
    uint32 public constant CALLBACK_GAS_LIMIT = 500_000;
    uint32 public constant NUM_WORDS = 1;

    // === USDC Accounting ===
    // INVARIANT: J represents reserved Treasure USDC and must never be spent
    // on exploration payouts or routing other than Treasure distribution.
    uint256 public J; // Reserved Treasure Chest (USDC, 6 decimals)

    // === Expedition State ===
    uint256 public M; // Maximum Map Size (USDC, 6 decimals)
    uint256 public epochId;
    uint256 public N0;
    uint256 public E_minted;

    // === Immutable Addresses ===
    address public immutable cartographer;
    address public immutable mapMaker;
    address public immutable huntToken;
    address public immutable mapToken;
    address public immutable huntStaking;
    address public immutable communityPool;
    address public immutable usdc;
    address public immutable aerodromeRouter;

    // === VRF config ===
    IVRFCoordinatorV2Plus public immutable vrfCoordinatorContract;
    bytes32 public immutable keyHash;
    uint256 public immutable subscriptionId;

    // === Routing state ===
    // Queued HUNT buys are retried by keepers and never block exploration
    // payouts or treasure distribution.
    uint256 public pendingHuntBuyUsdc;
    address[] public huntPath;

    struct Bet {
        address bettor;
        uint256 amount;
        uint64 timestamp;
        bool fulfilled;
        bool refunded;
    }

    mapping(uint256 => Bet) public pendingBets;

    event BetPlaced(address indexed participant, uint256 amount, uint256 requestId);
    event BetResolved(address indexed participant, uint256 amount, uint8 outcomeIndex, uint256 payout);
    event BetRefunded(uint256 indexed requestId, address bettor, uint256 amount);
    event ContributionRouted(uint256 amount, uint256 toTreasure, uint256 toMap);
    event TreasureDiscovered(address indexed discoverer, uint256 amount, uint256 epochId);
    event ExpeditionStarted(uint256 epochId, uint256 newM);
    event CascadeCapped(uint256 epochId, uint256 remainingJ, uint256 newM);
    event HuntBuyQueued(uint256 amount, uint256 totalQueued);
    event QueuedHuntBuyExecuted(uint256 usdcUsed, uint256 huntBought);

    error InvalidBetAmount();
    error InsufficientLiquidity();
    error UnknownRequest();
    error AlreadySettled();
    error TimeoutNotReached();


    constructor(
        address usdc_,
        address huntToken_,
        address mapToken_,
        address huntStaking_,
        address communityPool_,
        address cartographer_,
        address mapMaker_,
        address aerodromeRouter_,
        address vrfCoordinator_,
        bytes32 keyHash_,
        uint256 subscriptionId_
    ) VRFConsumerBaseV2Plus(vrfCoordinator_) {
        require(usdc_ != address(0), "USDC required");
        require(huntToken_ != address(0), "HUNT required");
        require(mapToken_ != address(0), "MAP required");
        require(huntStaking_ != address(0), "Staking required");
        require(communityPool_ != address(0), "Community required");
        require(cartographer_ != address(0), "Cartographer required");
        require(mapMaker_ != address(0), "MapMaker required");
        require(aerodromeRouter_ != address(0), "Router required");
        require(vrfCoordinator_ != address(0), "VRF required");

        usdc = usdc_;
        huntToken = huntToken_;
        mapToken = mapToken_;
        huntStaking = huntStaking_;
        communityPool = communityPool_;
        cartographer = cartographer_;
        mapMaker = mapMaker_;
        aerodromeRouter = aerodromeRouter_;
        vrfCoordinatorContract = IVRFCoordinatorV2Plus(vrfCoordinator_);
        keyHash = keyHash_;
        subscriptionId = subscriptionId_;

        M = INITIAL_M;
        J = INITIAL_J;
        epochId = INITIAL_EPOCH;

        huntPath.push(usdc_);
        huntPath.push(huntToken_);

        IERC20(usdc).approve(mapToken_, type(uint256).max);
        IERC20(usdc).approve(aerodromeRouter_, type(uint256).max);

        emit ExpeditionStarted(epochId, M);
    }

    function placeBet(uint256 amount) external nonReentrant returns (uint256 requestId) {
        if (amount < MIN_BET) revert InvalidBetAmount();
        uint256 maxBet = (M * MAX_BET_BPS) / BPS_DENOMINATOR;
        if (amount > maxBet) revert InvalidBetAmount();

        require(IERC20(usdc).transferFrom(msg.sender, address(this), amount), "Transfer failed");

        requestId = vrfCoordinatorContract.requestRandomWords(
            keyHash,
            subscriptionId,
            REQUEST_CONFIRMATIONS,
            CALLBACK_GAS_LIMIT,
            NUM_WORDS
        );

        pendingBets[requestId] = Bet({
            bettor: msg.sender,
            amount: amount,
            timestamp: uint64(block.timestamp),
            fulfilled: false,
            refunded: false
        });

        IHuntStaking(huntStaking).recordBet(msg.sender);
        emit BetPlaced(msg.sender, amount, requestId);
    }

    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal override {
        Bet storage bet = pendingBets[requestId];
        if (bet.bettor == address(0)) revert UnknownRequest();
        if (bet.fulfilled || bet.refunded) revert AlreadySettled();

        uint256 outcomeIndex = randomWords[0] % 10_000;
        uint256 multiplierBps = _getOutcome(outcomeIndex);
        uint256 payout = 0;

        if (multiplierBps > 0) {
            payout = (bet.amount * multiplierBps) / BPS_DENOMINATOR;
            _payMultiplier(bet.bettor, payout);
        } else {
            uint256 roll = (randomWords[0] / 10_000) % M;
            _routeContribution(bet.amount, bet.bettor, roll);
        }

        bet.fulfilled = true;
        emit BetResolved(bet.bettor, bet.amount, uint8(outcomeIndex), payout);
    }

    function refundExpiredBet(uint256 requestId) external nonReentrant {
        Bet storage bet = pendingBets[requestId];
        if (bet.bettor == address(0)) revert UnknownRequest();
        if (bet.fulfilled || bet.refunded) revert AlreadySettled();
        if (block.timestamp < bet.timestamp + VRF_TIMEOUT) revert TimeoutNotReached();

        bet.refunded = true;
        require(IERC20(usdc).transfer(bet.bettor, bet.amount), "Transfer failed");

        emit BetRefunded(requestId, bet.bettor, bet.amount);
    }

    function executeQueuedHuntBuy(uint256 maxUsdc) external nonReentrant {
        require(pendingHuntBuyUsdc > 0, "Nothing queued");
        uint256 toExecute = maxUsdc > pendingHuntBuyUsdc ? pendingHuntBuyUsdc : maxUsdc;
        require(toExecute > 0, "Zero amount");

        uint256 huntBought = IAerodromeRouter(aerodromeRouter).swapExactTokensForTokens(
            toExecute,
            _minHuntOut(toExecute),
            huntPath,
            communityPool,
            block.timestamp
        );

        pendingHuntBuyUsdc -= toExecute;
        emit QueuedHuntBuyExecuted(toExecute, huntBought);
    }

    function freeUSDC() public view returns (uint256) {
        return _freeUSDC();
    }

    function _payMultiplier(address to, uint256 payout) internal {
        uint256 free = _freeUSDC();
        if (free < payout) revert InsufficientLiquidity();
        require(IERC20(usdc).transfer(to, payout), "Transfer failed");
    }

    function _freeUSDC() internal view returns (uint256) {
        uint256 total = IERC20(usdc).balanceOf(address(this));
        return total - J;
    }

    function _getOutcome(uint256 index) internal pure returns (uint256 multiplierBps) {
        if (index < 4000) return 0;
        if (index < 6200) return 5000;
        if (index < 8000) return 10_000;
        if (index < 9000) return 15_000;
        if (index < 9600) return 20_000;
        if (index < 9900) return 40_000;
        if (index < 10_000) return 100_000;
        revert("Invalid index");
    }

    function _routeContribution(uint256 amount, address contributor, uint256 roll) internal {
        uint256 jPrev = J;
        uint256 toTreasure = (amount * TO_TREASURE_BPS) / BPS_DENOMINATOR;
        J = jPrev + toTreasure;
        uint256 toMap = _routeMap(amount);
        emit ContributionRouted(amount, toTreasure, toMap);

        uint256 communityHuntUsdc = (amount * TO_COMMUNITY_HUNT_BPS) / BPS_DENOMINATOR;
        _attemptHuntBuy(communityHuntUsdc, communityPool);

        uint256 huntToEmit = _calculateEmission(amount);
        if (huntToEmit > 0) {
            require(IHuntToken(huntToken).transfer(contributor, huntToEmit), "Transfer failed");
            E_minted += huntToEmit;
        }

        N0++;

        _checkDiscovery(jPrev, toTreasure, contributor, roll);
    }

    function _routeMap(uint256 amount) internal returns (uint256 toMap) {
        uint256 stakerMapUsdc = (amount * TO_STAKERS_MAP_BPS) / BPS_DENOMINATOR;
        uint256 cartographerMapUsdc = (amount * TO_CARTOGRAPHER_MAP_BPS) / BPS_DENOMINATOR;
        uint256 mapMakerMapUsdc = (amount * TO_MAPMAKER_MAP_BPS) / BPS_DENOMINATOR;
        uint256 burnMapUsdc = (amount * TO_BURN_MAP_BPS) / BPS_DENOMINATOR;

        uint256 stakerMap = IMapToken(mapToken).buy(stakerMapUsdc);
        uint256 cartographerMap = IMapToken(mapToken).buy(cartographerMapUsdc);
        uint256 mapMakerMap = IMapToken(mapToken).buy(mapMakerMapUsdc);
        uint256 burnMap = IMapToken(mapToken).buy(burnMapUsdc);

        IERC20(mapToken).transfer(huntStaking, stakerMap);
        IHuntStaking(huntStaking).distributeMapRewards(stakerMap);
        IERC20(mapToken).transfer(cartographer, cartographerMap);
        IERC20(mapToken).transfer(mapMaker, mapMakerMap);
        IMapToken(mapToken).burn(burnMap);

        toMap = stakerMapUsdc + cartographerMapUsdc + mapMakerMapUsdc + burnMapUsdc;
    }

    function _checkDiscovery(uint256 jPrev, uint256 delta, address discoverer, uint256 roll) internal {
        uint256 currentJ = jPrev + delta;
        uint256 currentM = M;
        uint256 currentEpoch = epochId;

        bool discovered = false;
        if (currentJ >= currentM) {
            discovered = true;
        } else if (roll >= jPrev && roll < currentJ) {
            discovered = true;
        }

        if (!discovered) {
            return;
        }

        uint256 cascadeCount = 0;
        while (true) {
            if (cascadeCount >= MAX_CASCADE) {
                J = currentJ;
                M = currentM;
                emit CascadeCapped(currentEpoch, currentJ, currentM);
                break;
            }

            cascadeCount++;

            uint256 payout = currentJ >= currentM ? currentM : currentJ;
            currentJ = currentJ - payout;
            J = currentJ;

            _distributeTreasure(payout, discoverer);

            currentEpoch += 1;
            epochId = currentEpoch;
            currentM = currentM * 2;
            M = currentM;
            IHuntStaking(huntStaking).onEpochAdvanced(currentEpoch);
            emit ExpeditionStarted(currentEpoch, currentM);

            if (currentJ < currentM) {
                break;
            }
        }
    }

    function _distributeTreasure(uint256 payout, address discoverer) internal {
        uint256 discovererShare = (payout * DISCOVERER_BPS) / BPS_DENOMINATOR;
        require(IERC20(usdc).transfer(discoverer, discovererShare), "Transfer failed");

        uint256 qualifiedStake = IHuntStaking(huntStaking).qualifiedStakeTotal();
        if (qualifiedStake > 0) {
            uint256 stakerShare = (payout * STAKERS_BPS) / BPS_DENOMINATOR;
            require(IERC20(usdc).transfer(huntStaking, stakerShare), "Transfer failed");
            IHuntStaking(huntStaking).distributeUsdcRewards(stakerShare);

            uint256 burnShare = (payout * BURN_HUNT_BPS) / BPS_DENOMINATOR;
            _buyAndBurnHunt(burnShare);
        } else {
            uint256 burnShare = (payout * ZERO_QUAL_BURN_BPS) / BPS_DENOMINATOR;
            uint256 communityShare = (payout * ZERO_QUAL_COMMUNITY_BPS) / BPS_DENOMINATOR;
            _buyAndBurnHunt(burnShare);
            require(IERC20(usdc).transfer(communityPool, communityShare), "Transfer failed");
        }

        uint256 cartographerShare = (payout * CARTOGRAPHER_BPS) / BPS_DENOMINATOR;
        uint256 mapMakerShare = (payout * MAPMAKER_BPS) / BPS_DENOMINATOR;
        require(IERC20(usdc).transfer(cartographer, cartographerShare), "Transfer failed");
        require(IERC20(usdc).transfer(mapMaker, mapMakerShare), "Transfer failed");

        emit TreasureDiscovered(discoverer, payout, epochId);
    }

    function _attemptHuntBuy(uint256 usdcAmount, address recipient) internal {
        if (usdcAmount == 0) return;
        try IAerodromeRouter(aerodromeRouter).swapExactTokensForTokens(
            usdcAmount,
            _minHuntOut(usdcAmount),
            huntPath,
            recipient,
            block.timestamp
        ) {
            // no-op
        } catch {
            pendingHuntBuyUsdc += usdcAmount;
            emit HuntBuyQueued(usdcAmount, pendingHuntBuyUsdc);
        }
    }

    function _buyAndBurnHunt(uint256 usdcAmount) internal {
        if (usdcAmount == 0) return;
        uint256 huntBought = IAerodromeRouter(aerodromeRouter).swapExactTokensForTokens(
            usdcAmount,
            _minHuntOut(usdcAmount),
            huntPath,
            address(this),
            block.timestamp
        );
        IHuntToken(huntToken).burn(huntBought);
    }

    function _minHuntOut(uint256 usdcAmount) internal view returns (uint256) {
        try IAerodromeRouter(aerodromeRouter).getAmountsOut(usdcAmount, huntPath) returns (uint256[] memory amounts) {
            uint256 amountOut = amounts[amounts.length - 1];
            return (amountOut * (BPS_DENOMINATOR - HUNT_SLIPPAGE_BPS)) / BPS_DENOMINATOR;
        } catch {
            return 0;
        }
    }

    function _calculateEmission(uint256 contribution) internal view returns (uint256) {
        if (E_minted >= E_CAP) return 0;
        uint256 rate = _getEmissionRate();
        uint256 contributionWad = contribution * 1e12;
        uint256 rawMint = (contributionWad * rate) / WAD;
        uint256 remainingCap = E_CAP - E_minted;
        uint256 balance = IHuntToken(huntToken).balanceOf(address(this));
        uint256 remaining = remainingCap < balance ? remainingCap : balance;
        return rawMint > remaining ? remaining : rawMint;
    }

    function _getEmissionRate() internal view returns (uint256) {
        if (N0 < 100_000) {
            return R_0;
        }

        uint256 decay = N0 - 100_000;
        uint256 exponent = LAMBDA_WAD * decay;
        if (exponent >= EXP_MAX_INPUT) {
            return R_MIN;
        }
        uint256 expPos = MathExp.expWad(exponent);
        uint256 expNeg = (WAD * WAD) / expPos;
        return R_MIN + ((R_0 - R_MIN) * expNeg) / WAD;
    }
}
