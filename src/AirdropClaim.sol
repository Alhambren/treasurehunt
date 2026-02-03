// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IHuntToken} from "./interfaces/IHuntToken.sol";
import {MerkleProof} from "./utils/MerkleProof.sol";

contract AirdropClaim {
    IHuntToken public immutable huntToken;
    bytes32 public immutable merkleRoot;
    uint256 public immutable claimDeadline;

    mapping(address => bool) public hasClaimed;
    bool public burned;

    event Claimed(address indexed account, uint256 amount);
    event UnclaimedBurned(uint256 amount);

    constructor(address huntToken_, bytes32 merkleRoot_, uint256 claimDeadline_) {
        require(huntToken_ != address(0), "HUNT required");
        require(claimDeadline_ > block.timestamp, "Deadline in past");
        huntToken = IHuntToken(huntToken_);
        merkleRoot = merkleRoot_;
        claimDeadline = claimDeadline_;
    }

    function claim(uint256 amount, bytes32[] calldata proof) external {
        require(!hasClaimed[msg.sender], "Already claimed");
        require(block.timestamp <= claimDeadline, "Claim window closed");

        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, amount));
        require(MerkleProof.verify(proof, merkleRoot, leaf), "Invalid proof");

        hasClaimed[msg.sender] = true;
        require(huntToken.transfer(msg.sender, amount), "Transfer failed");

        emit Claimed(msg.sender, amount);
    }

    function burnUnclaimed() external {
        require(block.timestamp > claimDeadline, "Window not closed");
        require(!burned, "Already burned");

        burned = true;
        uint256 remaining = huntToken.balanceOf(address(this));
        huntToken.burn(remaining);

        emit UnclaimedBurned(remaining);
    }
}
