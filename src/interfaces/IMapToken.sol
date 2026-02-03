// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./IERC20.sol";

interface IMapToken is IERC20 {
    function buy(uint256 usdcAmount) external returns (uint256 mapOut);
    function sell(uint256 mapAmount) external returns (uint256 usdcOut);
    function burn(uint256 amount) external;
    function currentPrice() external view returns (uint256);
    function getBuyPrice(uint256 usdcAmount) external view returns (uint256);
    function getSellProceeds(uint256 mapAmount) external view returns (uint256);
}
