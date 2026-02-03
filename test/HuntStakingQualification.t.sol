// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestUtils} from "./utils/TestUtils.sol";
import {VmUtils} from "./utils/Vm.sol";
import {TreasureHuntDeployer} from "../src/TreasureHuntDeployer.sol";
import {TreasureEngine} from "../src/TreasureEngine.sol";
import {HuntStaking} from "../src/HuntStaking.sol";
import {HuntToken} from "../src/HuntToken.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {MockAerodromeRouter} from "./mocks/MockAerodromeRouter.sol";
import {MockVRFCoordinator} from "./mocks/MockVRFCoordinator.sol";

contract HuntStakingQualificationTest is TestUtils {
    MockUSDC internal usdc;
    MockAerodromeRouter internal router;
    MockVRFCoordinator internal vrf;

    TreasureEngine internal engine;
    HuntStaking internal staking;
    HuntToken internal hunt;

    address internal cartographer;
    address internal mapMaker;
    address internal liquidity;

    bytes32 internal keyHash = bytes32(uint256(1));
    bytes32 internal merkleRoot = bytes32(uint256(2));
    uint64 internal subscriptionId = 1;

    function _deploySystem() internal {
        cartographer = address(this);
        liquidity = address(this);
        mapMaker = address(0xBEEF);

        usdc = new MockUSDC();
        router = new MockAerodromeRouter();
        vrf = new MockVRFCoordinator();

        TreasureHuntDeployer deployer = new TreasureHuntDeployer(
            address(usdc),
            cartographer,
            mapMaker,
            liquidity,
            address(router),
            address(vrf),
            keyHash,
            subscriptionId,
            merkleRoot
        );

        (address engineAddr, address huntAddr, , address stakingAddr, , , ) = deployer.deploy();
        engine = TreasureEngine(engineAddr);
        hunt = HuntToken(huntAddr);
        staking = HuntStaking(stakingAddr);
    }

    function _stake(address user, uint256 amount) internal {
        hunt.transfer(user, amount);
        VmUtils.vm.startPrank(user);
        hunt.approve(address(staking), type(uint256).max);
        staking.stake(amount);
        VmUtils.vm.stopPrank();
    }

    function _placeBet(address user, uint256 amount) internal returns (bool success) {
        usdc.mint(user, amount);
        VmUtils.vm.startPrank(user);
        usdc.approve(address(engine), type(uint256).max);
        try engine.placeBet(amount) {
            success = true;
        } catch {
            success = false;
        }
        VmUtils.vm.stopPrank();
    }

    function testQualified_staked_bet_stakedAtDiscovery() public {
        _deploySystem();
        address user = address(0x1);
        uint256 stakeAmount = 100e18;
        _stake(user, stakeAmount);

        uint256 minBet = engine.MIN_BET();
        bool success = _placeBet(user, minBet);
        assertTrue(success, "Bet failed");

        assertTrue(staking.isQualified(user), "User not qualified");
        assertEq(staking.qualifiedStakeTotal(), stakeAmount, "Qualified total mismatch");
    }

    function testDisqualified_staked_noExplore() public {
        _deploySystem();
        address user = address(0x2);
        uint256 stakeAmount = 50e18;
        _stake(user, stakeAmount);

        assertTrue(!staking.isQualified(user), "User qualified without explore");
        assertEq(staking.qualifiedStakeTotal(), 0, "Qualified total should be zero");
    }

    function testDisqualified_explored_notStakedAtTrigger() public {
        _deploySystem();
        address user = address(0x3);
        uint256 stakeAmount = 80e18;
        _stake(user, stakeAmount);

        uint256 minBet = engine.MIN_BET();
        bool success = _placeBet(user, minBet);
        assertTrue(success, "Bet failed");

        VmUtils.vm.startPrank(user);
        staking.initiateWithdraw();
        VmUtils.vm.warp(block.timestamp + staking.COOLDOWN_PERIOD() + 1);
        staking.withdraw(stakeAmount);
        VmUtils.vm.stopPrank();

        assertTrue(!staking.isQualified(user), "User qualified after withdraw");
        assertEq(staking.qualifiedStakeTotal(), 0, "Qualified total should be zero after withdraw");
    }

    function testCooldownStillQualifies() public {
        _deploySystem();
        address user = address(0x4);
        uint256 stakeAmount = 120e18;
        _stake(user, stakeAmount);

        uint256 minBet = engine.MIN_BET();
        bool success = _placeBet(user, minBet);
        assertTrue(success, "Bet failed");

        VmUtils.vm.startPrank(user);
        staking.initiateWithdraw();
        VmUtils.vm.stopPrank();

        assertTrue(staking.isQualified(user), "User not qualified during cooldown");
        assertEq(staking.qualifiedStakeTotal(), stakeAmount, "Qualified total mismatch during cooldown");
    }

    function testThreshold_minBetCounts() public {
        _deploySystem();
        address user = address(0x5);
        uint256 stakeAmount = 60e18;
        _stake(user, stakeAmount);

        uint256 minBet = engine.MIN_BET();
        bool success = _placeBet(user, minBet);
        assertTrue(success, "Bet failed at min threshold");

        assertTrue(staking.isQualified(user), "User not qualified at min bet");
    }

    function testThreshold_belowMinDoesNotQualify() public {
        _deploySystem();
        address user = address(0x6);
        uint256 stakeAmount = 60e18;
        _stake(user, stakeAmount);

        uint256 minBet = engine.MIN_BET();
        bool success = _placeBet(user, minBet - 1);
        assertTrue(!success, "Bet below min should fail");

        assertTrue(!staking.isQualified(user), "User qualified below min bet");
        assertEq(staking.qualifiedStakeTotal(), 0, "Qualified total should be zero");
    }
}
