// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestUtils} from "./utils/TestUtils.sol";
import {MapToken} from "../src/MapToken.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract MapTokenCurveTest is TestUtils {
    MockUSDC internal usdc;
    MapToken internal map;

    function _deploy() internal {
        usdc = new MockUSDC();
        map = new MapToken(address(usdc));
        usdc.mint(address(this), 100_000e6);
        usdc.approve(address(map), type(uint256).max);
    }

    function testMonotonicPrice() public {
        _deploy();
        uint256 price0 = map.currentPrice();
        map.buy(50_000e6);
        uint256 price1 = map.currentPrice();
        assertTrue(price1 > price0, "Price did not increase");
    }

    function testRoundTripProceedsLessThanInput() public {
        _deploy();
        uint256 input = 1e6;
        uint256 mapOut = map.buy(input);
        uint256 proceeds = map.getSellProceeds(mapOut);
        assertTrue(proceeds <= input, "Round-trip produced profit");
    }

    function testBuyCapReverts() public {
        _deploy();
        bool reverted = false;
        try map.buy(50_000e6 + 1) {
            // should not succeed
        } catch {
            reverted = true;
        }
        assertTrue(reverted, "Buy cap did not revert");
    }

    function testSellCapReverts() public {
        _deploy();
        map.buy(1e6);
        uint256 total = map.totalSupply();
        uint256 overCap = (total * 101) / 100; // >1% of supply
        bool reverted = false;
        try map.sell(overCap) {
            // should not succeed
        } catch {
            reverted = true;
        }
        assertTrue(reverted, "Sell cap did not revert");
    }
}
