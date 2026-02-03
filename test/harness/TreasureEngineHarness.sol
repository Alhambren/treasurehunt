// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TreasureEngine} from "../../src/TreasureEngine.sol";

contract TreasureEngineHarness is TreasureEngine {
    constructor(
        address usdc_,
        address huntToken_,
        address mapToken_,
        address huntStaking_,
        address communityPool_,
        address cartographer_,
        address mapMaker_,
        address aerodromeRouter_,
        address vrfCoordinator_,
        bytes32 keyHash_,
        uint64 subscriptionId_
    ) TreasureEngine(
        usdc_,
        huntToken_,
        mapToken_,
        huntStaking_,
        communityPool_,
        cartographer_,
        mapMaker_,
        aerodromeRouter_,
        vrfCoordinator_,
        keyHash_,
        subscriptionId_
    ) {}

    function setJ(uint256 newJ) external {
        J = newJ;
    }

    function setM(uint256 newM) external {
        M = newM;
    }

    function setN0(uint256 newN0) external {
        N0 = newN0;
    }

    function setEMinted(uint256 newEMinted) external {
        E_minted = newEMinted;
    }

    function exposeCheckDiscovery(uint256 jPrev, uint256 delta, address discoverer, uint256 roll) external {
        _checkDiscovery(jPrev, delta, discoverer, roll);
    }

    function exposeEmissionRate() external view returns (uint256) {
        return _getEmissionRate();
    }

    function exposeCalculateEmission(uint256 contribution) external view returns (uint256) {
        return _calculateEmission(contribution);
    }
}
