// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

abstract contract VRFConsumerBaseV2Plus {
    error OnlyCoordinatorCanFulfill(address caller, address coordinator);

    address private immutable _vrfCoordinator;

    constructor(address vrfCoordinator_) {
        _vrfCoordinator = vrfCoordinator_;
    }

    function vrfCoordinator() public view returns (address) {
        return _vrfCoordinator;
    }

    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal virtual;

    function rawFulfillRandomWords(uint256 requestId, uint256[] memory randomWords) external {
        if (msg.sender != _vrfCoordinator) {
            revert OnlyCoordinatorCanFulfill(msg.sender, _vrfCoordinator);
        }
        fulfillRandomWords(requestId, randomWords);
    }
}
