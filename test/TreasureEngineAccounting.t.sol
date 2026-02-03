// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestUtils} from "./utils/TestUtils.sol";
import {TreasureEngineHarness} from "./harness/TreasureEngineHarness.sol";
import {HuntToken} from "../src/HuntToken.sol";
import {CommunityPool} from "../src/CommunityPool.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {MockMapToken} from "./mocks/MockMapToken.sol";
import {MockHuntStaking} from "./mocks/MockHuntStaking.sol";
import {MockAerodromeRouter} from "./mocks/MockAerodromeRouter.sol";
import {MockVRFCoordinator} from "./mocks/MockVRFCoordinator.sol";

contract TreasureEngineAccountingTest is TestUtils {
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
        hunt.transfer(address(router), 10_000_000 * 1e18);

        usdc.mint(address(this), 1_000_000_000);
        usdc.approve(address(engine), type(uint256).max);
    }

    function testPayoutRevertsWhenInsufficientFreeUSDC() public {
        _deploy();
        uint256 bet = 1e6;
        uint256 requestId = engine.placeBet(bet);

        bool reverted = false;
        try vrf.fulfill(address(engine), requestId, 9900) {
            // should not succeed
        } catch {
            reverted = true;
        }

        assertTrue(reverted, "Expected revert on insufficient freeUSDC");
    }

    function testTreasurePayoutDoesNotSpendFreeUSDC() public {
        _deploy();
        staking.setQualifiedStakeTotal(1);

        engine.setM(10e6);
        engine.setJ(12e6);
        usdc.mint(address(engine), 20e6);

        uint256 freeBefore = engine.freeUSDC();
        engine.exposeCheckDiscovery(2e6, 10e6, address(this), 0);
        uint256 freeAfter = engine.freeUSDC();

        assertEq(freeBefore, freeAfter, "freeUSDC changed by treasure payout");
        assertTrue(engine.J() <= usdc.balanceOf(address(engine)), "J exceeds balance");
    }

    function testDiscoveryIntervalHitAdvancesEpoch() public {
        _deploy();
        staking.setQualifiedStakeTotal(1);

        engine.setM(100);
        engine.setJ(30);
        usdc.mint(address(engine), 1000);

        engine.exposeCheckDiscovery(20, 10, address(this), 25);
        assertEq(engine.epochId(), 1, "Epoch not advanced on hit");
    }

    function testDiscoveryIntervalMissKeepsEpoch() public {
        _deploy();
        staking.setQualifiedStakeTotal(1);

        engine.setM(100);
        engine.setJ(30);
        usdc.mint(address(engine), 1000);

        engine.exposeCheckDiscovery(20, 10, address(this), 5);
        assertEq(engine.epochId(), 0, "Epoch advanced on miss");
    }

    function testInvariant_JLeqBalance(uint96 jValue, uint96 extra) public {
        _deploy();
        engine.setJ(jValue);
        usdc.mint(address(engine), uint256(jValue) + uint256(extra));
        assertTrue(engine.J() <= usdc.balanceOf(address(engine)), "J exceeds balance");
    }
}
