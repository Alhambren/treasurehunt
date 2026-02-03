// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";

contract CommunityPool {
    IERC20 public immutable huntToken;
    address public immutable cartographer;

    event Distributed(address indexed to, uint256 amount);

    constructor(address huntToken_, address cartographer_) {
        require(huntToken_ != address(0), "HUNT required");
        require(cartographer_ != address(0), "Cartographer required");
        huntToken = IERC20(huntToken_);
        cartographer = cartographer_;
    }

    function distribute(address to, uint256 amount) external {
        require(msg.sender == cartographer, "Only Cartographer");
        require(huntToken.transfer(to, amount), "Transfer failed");
        emit Distributed(to, amount);
    }

    function balance() external view returns (uint256) {
        return huntToken.balanceOf(address(this));
    }
}
