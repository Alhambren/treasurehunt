// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "../../src/interfaces/IERC20.sol";

contract MockAerodromeRouter {
    function getAmountsOut(uint256 amountIn, address[] calldata path) external pure returns (uint256[] memory amounts) {
        require(path.length >= 2, "Invalid path");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountIn * 1e12;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external returns (uint256 amountOut) {
        require(path.length >= 2, "Invalid path");
        IERC20 tokenIn = IERC20(path[0]);
        IERC20 tokenOut = IERC20(path[path.length - 1]);

        require(tokenIn.transferFrom(msg.sender, address(this), amountIn), "Transfer failed");
        amountOut = amountIn * 1e12;
        require(amountOut >= amountOutMin, "Slippage exceeded");
        require(tokenOut.transfer(to, amountOut), "Transfer failed");
    }
}
