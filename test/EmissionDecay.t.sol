// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestUtils} from "./utils/TestUtils.sol";
import {TreasureEngineHarness} from "./harness/TreasureEngineHarness.sol";
import {VmUtils} from "./utils/Vm.sol";
import {HuntToken} from "../src/HuntToken.sol";
import {CommunityPool} from "../src/CommunityPool.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {MockMapToken} from "./mocks/MockMapToken.sol";
import {MockHuntStaking} from "./mocks/MockHuntStaking.sol";
import {MockAerodromeRouter} from "./mocks/MockAerodromeRouter.sol";
import {MockVRFCoordinator} from "./mocks/MockVRFCoordinator.sol";

contract EmissionDecayTest is TestUtils {
    MockUSDC internal usdc;
    MockMapToken internal map;
    MockHuntStaking internal staking;
    MockAerodromeRouter internal router;
    MockVRFCoordinator internal vrf;
    HuntToken internal hunt;
    CommunityPool internal community;
    TreasureEngineHarness internal engine;

    address internal cartographer = address(0xC0FFEE);
    address internal mapMaker = address(0xBEEF);

    function _deploy() internal {
        usdc = new MockUSDC();
        map = new MockMapToken(address(usdc));
        staking = new MockHuntStaking();
        router = new MockAerodromeRouter();
        vrf = new MockVRFCoordinator();

        hunt = new HuntToken(address(this));
        community = new CommunityPool(address(hunt), cartographer);

        engine = new TreasureEngineHarness(
            address(usdc),
            address(hunt),
            address(map),
            address(staking),
            address(community),
            cartographer,
            mapMaker,
            address(router),
            address(vrf),
            bytes32(uint256(1)),
            1
        );

        hunt.setEngine(address(engine));
        hunt.transfer(address(engine), 300_000_000 * 1e18);
    }

    function testBootstrapRate() public {
        _deploy();
        engine.setN0(0);
        uint256 rate = engine.exposeEmissionRate();
        assertEq(rate, engine.R_0(), "Bootstrap rate mismatch");
    }

    function testDecayMonotonic() public {
        _deploy();
        engine.setN0(100_000);
        uint256 r1 = engine.exposeEmissionRate();
        engine.setN0(150_000);
        uint256 r2 = engine.exposeEmissionRate();
        engine.setN0(200_000);
        uint256 r3 = engine.exposeEmissionRate();

        assertTrue(r1 <= engine.R_0(), "Decay rate above r0");
        assertTrue(r2 < r1, "Rate not decreasing");
        assertTrue(r3 < r2, "Rate not decreasing");
        assertTrue(r3 >= engine.R_MIN(), "Rate below r_min");
    }

    function testAsymptoteNotBelowRMin() public {
        _deploy();
        engine.setN0(1_000_000);
        uint256 rate = engine.exposeEmissionRate();
        assertTrue(rate >= engine.R_MIN(), "Rate below r_min");
    }

    function testCapByECap() public {
        _deploy();
        engine.setN0(0);
        engine.setEMinted(engine.E_CAP() - 1e18);
        uint256 emission = engine.exposeCalculateEmission(10e6);
        assertEq(emission, 1e18, "Emission exceeds remaining cap");
    }

    function testCapByBalance() public {
        _deploy();
        engine.setN0(0);
        VmUtils.vm.prank(address(engine));
        hunt.transfer(address(0xDEAD), 300_000_000 * 1e18 - 2e18);
        uint256 emission = engine.exposeCalculateEmission(10e6);
        assertEq(emission, 2e18, "Emission exceeds engine balance");
    }

    function testExhaustionReturnsZero() public {
        _deploy();
        VmUtils.vm.prank(address(engine));
        hunt.transfer(address(0xDEAD), 300_000_000 * 1e18);
        uint256 emission = engine.exposeCalculateEmission(10e6);
        assertEq(emission, 0, "Emission not zero when pool empty");
    }
}
