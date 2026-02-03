// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {HuntToken} from "./HuntToken.sol";
import {MapToken} from "./MapToken.sol";
import {HuntStaking} from "./HuntStaking.sol";
import {CommunityPool} from "./CommunityPool.sol";
import {AirdropClaim} from "./AirdropClaim.sol";
import {CartographerVesting} from "./CartographerVesting.sol";
import {TreasureEngine} from "./TreasureEngine.sol";

contract TreasureHuntDeployer {
    uint256 public constant AIRDROP_WINDOW = 90 days;

    uint256 public constant COMMUNITY_ALLOCATION = 250_000_000 * 1e18;
    uint256 public constant AIRDROP_ALLOCATION = 200_000_000 * 1e18;
    uint256 public constant CARTOGRAPHER_ALLOCATION = 100_000_000 * 1e18;
    uint256 public constant VESTING_ALLOCATION = 100_000_000 * 1e18;
    uint256 public constant LIQUIDITY_ALLOCATION = 50_000_000 * 1e18;
    uint256 public constant EMISSIONS_ALLOCATION = 300_000_000 * 1e18;

    address public immutable usdc;
    address public immutable cartographer;
    address public immutable mapMaker;
    address public immutable liquidityProvisioning;
    address public immutable aerodromeRouter;
    address public immutable vrfCoordinator;
    bytes32 public immutable keyHash;
    uint64 public immutable subscriptionId;
    bytes32 public immutable merkleRoot;

    bool public deployed;

    event Deployed(bytes32 configHash);

    struct Deployment {
        address hunt;
        address map;
        address staking;
        address community;
        address airdrop;
        address vesting;
        address engine;
    }

    constructor(
        address usdc_,
        address cartographer_,
        address mapMaker_,
        address liquidityProvisioning_,
        address aerodromeRouter_,
        address vrfCoordinator_,
        bytes32 keyHash_,
        uint64 subscriptionId_,
        bytes32 merkleRoot_
    ) {
        require(usdc_ != address(0), "USDC required");
        require(cartographer_ != address(0), "Cartographer required");
        require(mapMaker_ != address(0), "MapMaker required");
        require(liquidityProvisioning_ != address(0), "Liquidity required");
        require(aerodromeRouter_ != address(0), "Router required");
        require(vrfCoordinator_ != address(0), "VRF required");

        usdc = usdc_;
        cartographer = cartographer_;
        mapMaker = mapMaker_;
        liquidityProvisioning = liquidityProvisioning_;
        aerodromeRouter = aerodromeRouter_;
        vrfCoordinator = vrfCoordinator_;
        keyHash = keyHash_;
        subscriptionId = subscriptionId_;
        merkleRoot = merkleRoot_;
    }

    function deploy() external returns (
        address engine,
        address huntToken,
        address mapToken,
        address huntStaking,
        address communityPool,
        address airdropClaim,
        address cartographerVesting
    ) {
        require(!deployed, "Already deployed");
        deployed = true;
        Deployment memory predicted = _predictAddresses();

        address hunt = address(new HuntToken(address(this)));
        require(hunt == predicted.hunt, "HUNT address mismatch");

        address map = address(new MapToken(usdc));
        require(map == predicted.map, "MAP address mismatch");

        address staking = address(new HuntStaking(hunt, usdc, map, predicted.engine));
        require(staking == predicted.staking, "Staking address mismatch");

        address community = address(new CommunityPool(hunt, cartographer));
        require(community == predicted.community, "Community address mismatch");

        address airdrop = address(new AirdropClaim(hunt, merkleRoot, block.timestamp + AIRDROP_WINDOW));
        require(airdrop == predicted.airdrop, "Airdrop address mismatch");

        address vesting = address(new CartographerVesting(hunt, cartographer, VESTING_ALLOCATION));
        require(vesting == predicted.vesting, "Vesting address mismatch");

        address engineContract = address(new TreasureEngine(
            usdc,
            hunt,
            map,
            staking,
            community,
            cartographer,
            mapMaker,
            aerodromeRouter,
            vrfCoordinator,
            keyHash,
            subscriptionId
        ));
        require(engineContract == predicted.engine, "Engine address mismatch");

        HuntToken(hunt).setEngine(engineContract);

        _distributeGenesis(hunt, community, airdrop, vesting, engineContract);

        _validateConfig(hunt, engineContract, airdrop, vesting);

        bytes32 configHash = _configHash(hunt, map, staking, community, airdrop, vesting, engineContract);

        emit Deployed(configHash);

        engine = engineContract;
        huntToken = hunt;
        mapToken = map;
        huntStaking = staking;
        communityPool = community;
        airdropClaim = airdrop;
        cartographerVesting = vesting;
    }

    function _distributeGenesis(
        address hunt,
        address community,
        address airdrop,
        address vesting,
        address engineContract
    ) internal {
        require(HuntToken(hunt).transfer(community, COMMUNITY_ALLOCATION), "Community transfer failed");
        require(HuntToken(hunt).transfer(airdrop, AIRDROP_ALLOCATION), "Airdrop transfer failed");
        require(HuntToken(hunt).transfer(cartographer, CARTOGRAPHER_ALLOCATION), "Cartographer transfer failed");
        require(HuntToken(hunt).transfer(vesting, VESTING_ALLOCATION), "Vesting transfer failed");
        require(HuntToken(hunt).transfer(liquidityProvisioning, LIQUIDITY_ALLOCATION), "Liquidity transfer failed");
        require(HuntToken(hunt).transfer(engineContract, EMISSIONS_ALLOCATION), "Emissions transfer failed");
    }

    function _validateConfig(
        address hunt,
        address engineContract,
        address airdrop,
        address vesting
    ) internal view {
        require(HuntToken(hunt).treasureEngine() == engineContract, "Engine not set");
        require(HuntToken(hunt).totalSupply() == HuntToken(hunt).TOTAL_SUPPLY(), "Total supply mismatch");
        require(HuntToken(hunt).balanceOf(engineContract) == EMISSIONS_ALLOCATION, "Emissions pool mismatch");
        require(AirdropClaim(airdrop).claimDeadline() > block.timestamp, "Invalid airdrop deadline");
        require(CartographerVesting(vesting).totalVested() == VESTING_ALLOCATION, "Vesting amount mismatch");
        require(TreasureEngine(engineContract).M() == TreasureEngine(engineContract).INITIAL_M(), "M mismatch");
        require(TreasureEngine(engineContract).J() == TreasureEngine(engineContract).INITIAL_J(), "J mismatch");
    }

    function _configHash(
        address hunt,
        address map,
        address staking,
        address community,
        address airdrop,
        address vesting,
        address engineContract
    ) internal view returns (bytes32) {
        bytes32 base = keccak256(
            abi.encode(
                usdc,
                cartographer,
                mapMaker,
                liquidityProvisioning,
                aerodromeRouter,
                vrfCoordinator,
                keyHash,
                subscriptionId,
                merkleRoot
            )
        );
        bytes32 deployedHash = keccak256(
            abi.encode(
                hunt,
                map,
                staking,
                community,
                airdrop,
                vesting,
                engineContract
            )
        );
        return keccak256(abi.encode(base, deployedHash));
    }

    function _predictAddresses() internal view returns (Deployment memory predicted) {
        uint256 nonce = 1;
        predicted.hunt = _computeCreateAddress(address(this), nonce++);
        predicted.map = _computeCreateAddress(address(this), nonce++);
        predicted.staking = _computeCreateAddress(address(this), nonce++);
        predicted.community = _computeCreateAddress(address(this), nonce++);
        predicted.airdrop = _computeCreateAddress(address(this), nonce++);
        predicted.vesting = _computeCreateAddress(address(this), nonce++);
        predicted.engine = _computeCreateAddress(address(this), nonce++);
    }

    function _computeCreateAddress(address deployer, uint256 nonce) internal pure returns (address) {
        require(nonce > 0 && nonce < 128, "Nonce out of range");
        bytes memory data = abi.encodePacked(bytes1(0xd6), bytes1(0x94), deployer, bytes1(uint8(nonce)));
        return address(uint160(uint256(keccak256(data))));
    }
}
