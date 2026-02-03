// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockHuntStaking {
    uint256 public qualifiedStakeTotal;
    uint256 public lastUsdcDistributed;
    uint256 public lastMapDistributed;
    uint256 public lastEpoch;

    function setQualifiedStakeTotal(uint256 amount) external {
        qualifiedStakeTotal = amount;
    }

    function recordBet(address) external {}

    function distributeUsdcRewards(uint256 amount) external {
        lastUsdcDistributed += amount;
    }

    function distributeMapRewards(uint256 amount) external {
        lastMapDistributed += amount;
    }

    function onEpochAdvanced(uint256 newEpochId) external {
        lastEpoch = newEpochId;
    }
}
