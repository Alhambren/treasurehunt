// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {ReentrancyGuard} from "./utils/ReentrancyGuard.sol";

contract HuntStaking is ReentrancyGuard {
    uint256 public constant COOLDOWN_PERIOD = 7 days;
    uint256 public constant WAD = 1e18;

    IERC20 public immutable huntToken;
    IERC20 public immutable usdc;
    IERC20 public immutable mapToken;
    address public immutable treasureEngine;

    mapping(address => uint256) public stakedBalance;
    mapping(address => uint256) public cooldownStart;
    uint256 public totalStaked;

    mapping(address => uint256) public lastBetEpoch;
    mapping(address => bool) public hasBet;
    uint256 public qualifiedStakeTotal;
    uint256 public epochId;

    uint256 public rewardPerTokenStored;
    uint256 public mapRewardPerTokenStored;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public userMapRewardPerTokenPaid;
    mapping(address => uint256) public rewardsOwed;
    mapping(address => uint256) public mapRewardsOwed;

    event Staked(address indexed account, uint256 amount);
    event WithdrawInitiated(address indexed account, uint256 availableAt);
    event Withdrawn(address indexed account, uint256 amount);
    event WithdrawCancelled(address indexed account);
    event RewardsDistributed(uint256 amount, uint256 epochId);
    event MapRewardsDistributed(uint256 amount, uint256 epochId);
    event RewardsClaimed(address indexed account, uint256 usdcAmount, uint256 mapAmount);

    error OnlyTreasureEngine();

    constructor(address huntToken_, address usdc_, address mapToken_, address treasureEngine_) {
        require(huntToken_ != address(0), "HUNT required");
        require(usdc_ != address(0), "USDC required");
        require(mapToken_ != address(0), "MAP required");
        require(treasureEngine_ != address(0), "Engine required");
        huntToken = IERC20(huntToken_);
        usdc = IERC20(usdc_);
        mapToken = IERC20(mapToken_);
        treasureEngine = treasureEngine_;
    }

    modifier onlyTreasureEngine() {
        if (msg.sender != treasureEngine) revert OnlyTreasureEngine();
        _;
    }

    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be positive");
        require(huntToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        stakedBalance[msg.sender] += amount;
        totalStaked += amount;
        if (hasBet[msg.sender] && lastBetEpoch[msg.sender] == epochId) {
            qualifiedStakeTotal += amount;
        }

        emit Staked(msg.sender, amount);
    }

    function initiateWithdraw() external {
        require(stakedBalance[msg.sender] > 0, "No stake");
        require(cooldownStart[msg.sender] == 0, "Cooldown active");

        cooldownStart[msg.sender] = block.timestamp;

        emit WithdrawInitiated(msg.sender, block.timestamp + COOLDOWN_PERIOD);
    }

    function withdraw(uint256 amount) external nonReentrant {
        require(cooldownStart[msg.sender] != 0, "Cooldown not started");
        require(block.timestamp >= cooldownStart[msg.sender] + COOLDOWN_PERIOD, "Cooldown active");
        require(amount <= stakedBalance[msg.sender], "Insufficient balance");

        stakedBalance[msg.sender] -= amount;
        totalStaked -= amount;
        if (hasBet[msg.sender] && lastBetEpoch[msg.sender] == epochId) {
            qualifiedStakeTotal -= amount;
        }

        if (stakedBalance[msg.sender] == 0) {
            cooldownStart[msg.sender] = 0;
        }

        require(huntToken.transfer(msg.sender, amount), "Transfer failed");

        emit Withdrawn(msg.sender, amount);
    }

    function cancelWithdraw() external {
        require(cooldownStart[msg.sender] != 0, "No cooldown");
        cooldownStart[msg.sender] = 0;

        emit WithdrawCancelled(msg.sender);
    }

    function recordBet(address participant) external onlyTreasureEngine {
        bool firstThisEpoch = !hasBet[participant] || lastBetEpoch[participant] != epochId;
        if (firstThisEpoch && stakedBalance[participant] > 0) {
            qualifiedStakeTotal += stakedBalance[participant];
        }
        hasBet[participant] = true;
        lastBetEpoch[participant] = epochId;
    }

    function isQualified(address participant) public view returns (bool) {
        return hasBet[participant] && stakedBalance[participant] > 0 && lastBetEpoch[participant] == epochId;
    }

    function onEpochAdvanced(uint256 newEpochId) external onlyTreasureEngine {
        epochId = newEpochId;
        qualifiedStakeTotal = 0;
    }

    function distributeUsdcRewards(uint256 totalReward) external onlyTreasureEngine {
        require(qualifiedStakeTotal > 0, "No qualified stakers");
        rewardPerTokenStored += (totalReward * WAD) / qualifiedStakeTotal;
        emit RewardsDistributed(totalReward, epochId);
    }

    function distributeMapRewards(uint256 totalMapReward) external onlyTreasureEngine {
        require(qualifiedStakeTotal > 0, "No qualified stakers");
        mapRewardPerTokenStored += (totalMapReward * WAD) / qualifiedStakeTotal;
        emit MapRewardsDistributed(totalMapReward, epochId);
    }

    function claimRewards() external nonReentrant {
        _updateRewards(msg.sender);

        uint256 usdcReward = rewardsOwed[msg.sender];
        uint256 mapReward = mapRewardsOwed[msg.sender];

        if (usdcReward > 0) {
            rewardsOwed[msg.sender] = 0;
            require(usdc.transfer(msg.sender, usdcReward), "USDC transfer failed");
        }

        if (mapReward > 0) {
            mapRewardsOwed[msg.sender] = 0;
            require(mapToken.transfer(msg.sender, mapReward), "MAP transfer failed");
        }

        emit RewardsClaimed(msg.sender, usdcReward, mapReward);
    }

    function _updateRewards(address account) internal {
        if (isQualified(account)) {
            uint256 usdcEarned = (stakedBalance[account] *
                (rewardPerTokenStored - userRewardPerTokenPaid[account])) / WAD;
            uint256 mapEarned = (stakedBalance[account] *
                (mapRewardPerTokenStored - userMapRewardPerTokenPaid[account])) / WAD;

            rewardsOwed[account] += usdcEarned;
            mapRewardsOwed[account] += mapEarned;
        }

        userRewardPerTokenPaid[account] = rewardPerTokenStored;
        userMapRewardPerTokenPaid[account] = mapRewardPerTokenStored;
    }
}
