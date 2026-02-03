// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IHuntStaking {
    function recordBet(address participant) external;
    function distributeUsdcRewards(uint256 amount) external;
    function distributeMapRewards(uint256 amount) external;
    function onEpochAdvanced(uint256 newEpochId) external;
    function qualifiedStakeTotal() external view returns (uint256);
}
