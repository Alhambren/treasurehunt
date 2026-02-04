// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {TreasureHuntDeployer} from "../src/TreasureHuntDeployer.sol";

contract DeployTreasureHunt is Script {
    function run() external {
        address usdc = vm.envAddress("USDC");
        address cartographer = vm.envAddress("CARTOGRAPHER");
        address mapMaker = vm.envAddress("MAP_MAKER");
        address liquidity = vm.envAddress("LIQUIDITY_PROVISIONING");
        address aerodromeRouter = vm.envAddress("AERODROME_ROUTER");
        address vrfCoordinator = vm.envAddress("VRF_COORDINATOR");
        bytes32 keyHash = vm.envBytes32("VRF_KEY_HASH");
        uint256 subscriptionId = vm.envUint("VRF_SUBSCRIPTION_ID");
        bytes32 merkleRoot = vm.envBytes32("AIRDROP_MERKLE_ROOT");

        vm.startBroadcast();

        TreasureHuntDeployer deployer = new TreasureHuntDeployer(
            usdc,
            cartographer,
            mapMaker,
            liquidity,
            aerodromeRouter,
            vrfCoordinator,
            keyHash,
            subscriptionId,
            merkleRoot
        );

        (address engine,
         address hunt,
         address map,
         address staking,
         address community,
         address airdrop,
         address vesting) = deployer.deploy();

        console2.log("Deployer:", address(deployer));
        console2.log("Engine:", engine);
        console2.log("HUNT:", hunt);
        console2.log("MAP:", map);
        console2.log("Staking:", staking);
        console2.log("CommunityPool:", community);
        console2.log("AirdropClaim:", airdrop);
        console2.log("CartographerVesting:", vesting);

        vm.stopBroadcast();
    }
}
