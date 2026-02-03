// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "../../src/utils/ERC20.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";

contract MockMapToken is ERC20 {
    IERC20 public immutable usdc;

    constructor(address usdc_) ERC20("Mock MAP", "mMAP", 18) {
        usdc = IERC20(usdc_);
    }

    function buy(uint256 usdcAmount) external returns (uint256 mapOut) {
        require(usdc.transferFrom(msg.sender, address(this), usdcAmount), "Transfer failed");
        mapOut = usdcAmount * 1e12;
        _mint(msg.sender, mapOut);
    }

    function sell(uint256 mapAmount) external returns (uint256 usdcOut) {
        _burn(msg.sender, mapAmount);
        usdcOut = mapAmount / 1e12;
        require(usdc.transfer(msg.sender, usdcOut), "Transfer failed");
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    function currentPrice() external pure returns (uint256) {
        return 1e6;
    }

    function getBuyPrice(uint256 usdcAmount) external pure returns (uint256) {
        return usdcAmount * 1e12;
    }

    function getSellProceeds(uint256 mapAmount) external pure returns (uint256) {
        return mapAmount / 1e12;
    }
}
