// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TreasureEngine} from "../../src/TreasureEngine.sol";

contract MockVRFCoordinator {
    uint256 public nextRequestId = 1;

    function requestRandomWords(
        bytes32,
        uint64,
        uint16,
        uint32,
        uint32
    ) external returns (uint256 requestId) {
        requestId = nextRequestId++;
    }

    function fulfill(address engine, uint256 requestId, uint256 randomWord) external {
        uint256[] memory words = new uint256[](1);
        words[0] = randomWord;
        TreasureEngine(engine).rawFulfillRandomWords(requestId, words);
    }
}
