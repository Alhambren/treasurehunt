// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";

contract CartographerVesting {
    IERC20 public immutable huntToken;
    address public immutable beneficiary;
    uint256 public immutable startTime;
    uint256 public immutable vestingDuration;
    uint256 public immutable totalVested;
    uint256 public released;

    event Released(uint256 amount);

    constructor(address huntToken_, address beneficiary_, uint256 totalVested_) {
        require(huntToken_ != address(0), "HUNT required");
        require(beneficiary_ != address(0), "Beneficiary required");
        huntToken = IERC20(huntToken_);
        beneficiary = beneficiary_;
        startTime = block.timestamp;
        vestingDuration = 4 * 365 days;
        totalVested = totalVested_;
    }

    function vestedAmount() public view returns (uint256) {
        if (block.timestamp < startTime) return 0;
        if (block.timestamp >= startTime + vestingDuration) return totalVested;
        return (totalVested * (block.timestamp - startTime)) / vestingDuration;
    }

    function releasable() public view returns (uint256) {
        return vestedAmount() - released;
    }

    function release() external {
        uint256 amount = releasable();
        require(amount > 0, "Nothing to release");

        released += amount;
        require(huntToken.transfer(beneficiary, amount), "Transfer failed");

        emit Released(amount);
    }
}
