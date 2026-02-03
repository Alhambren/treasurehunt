// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "../../src/utils/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC", 6) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
