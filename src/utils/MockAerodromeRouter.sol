// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "../interfaces/IERC20.sol";
import {IAerodromeRouter} from "../interfaces/IAerodromeRouter.sol";

/// @notice Minimal mock router for testnets without Aerodrome.
/// Transfers input token to recipient and returns 0 output.
contract MockAerodromeRouter is IAerodromeRouter {
    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        pure
        override
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](path.length);
        if (path.length > 0) {
            amounts[0] = amountIn;
            amounts[path.length - 1] = 0;
        }
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256,
        address[] calldata path,
        address to,
        uint256
    ) external override returns (uint256 amountOut) {
        require(path.length >= 2, "Bad path");
        address tokenIn = path[0];
        require(IERC20(tokenIn).transferFrom(msg.sender, to, amountIn), "Transfer failed");
        return 0;
    }
}
