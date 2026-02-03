// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract TestUtils {
    function assertEq(uint256 a, uint256 b, string memory message) internal pure {
        if (a != b) {
            revert(message);
        }
    }

    function assertTrue(bool condition, string memory message) internal pure {
        if (!condition) {
            revert(message);
        }
    }
}
