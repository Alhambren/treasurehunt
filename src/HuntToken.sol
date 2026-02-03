// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "./utils/ERC20.sol";

contract HuntToken is ERC20 {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 1e18;

    address public immutable deployer;
    address public treasureEngine;
    bool public engineSet;

    error NotDeployer();
    error EngineAlreadySet();

    constructor(address deployer_) ERC20("Treasure Hunt Token", "HUNT", 18) {
        require(deployer_ != address(0), "Deployer required");
        deployer = deployer_;
        _mint(deployer_, TOTAL_SUPPLY);
    }

    function setEngine(address engine_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (engineSet) revert EngineAlreadySet();
        require(engine_ != address(0), "Engine required");
        treasureEngine = engine_;
        engineSet = true;
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    function burnFrom(address account, uint256 amount) external {
        uint256 currentAllowance = allowance[account][msg.sender];
        require(currentAllowance >= amount, "ERC20: insufficient allowance");
        if (currentAllowance != type(uint256).max) {
            allowance[account][msg.sender] = currentAllowance - amount;
            emit Approval(account, msg.sender, allowance[account][msg.sender]);
        }
        _burn(account, amount);
    }
}
