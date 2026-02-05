// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {HuntToken} from "../src/HuntToken.sol";
import {MapToken} from "../src/MapToken.sol";
import {HuntStaking} from "../src/HuntStaking.sol";
import {CommunityPool} from "../src/CommunityPool.sol";
import {AirdropClaim} from "../src/AirdropClaim.sol";
import {CartographerVesting} from "../src/CartographerVesting.sol";
import {TreasureEngine} from "../src/TreasureEngine.sol";
import {MockAerodromeRouter} from "../src/utils/MockAerodromeRouter.sol";

contract DeployTreasureHuntDirect is Script {
    uint256 public constant AIRDROP_WINDOW = 90 days;

    uint256 public constant COMMUNITY_ALLOCATION = 250_000_000 * 1e18;
    uint256 public constant AIRDROP_ALLOCATION = 200_000_000 * 1e18;
    uint256 public constant CARTOGRAPHER_ALLOCATION = 100_000_000 * 1e18;
    uint256 public constant VESTING_ALLOCATION = 100_000_000 * 1e18;
    uint256 public constant LIQUIDITY_ALLOCATION = 50_000_000 * 1e18;
    uint256 public constant EMISSIONS_ALLOCATION = 300_000_000 * 1e18;

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
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        uint256 nonce = vm.getNonce(deployer);
        bool deployMock = aerodromeRouter == address(0);
        if (deployMock) {
            aerodromeRouter = vm.computeCreateAddress(deployer, nonce++);
        }

        address predictedHunt = vm.computeCreateAddress(deployer, nonce++);
        address predictedMap = vm.computeCreateAddress(deployer, nonce++);
        address predictedStaking = vm.computeCreateAddress(deployer, nonce++);
        address predictedCommunity = vm.computeCreateAddress(deployer, nonce++);
        address predictedAirdrop = vm.computeCreateAddress(deployer, nonce++);
        address predictedVesting = vm.computeCreateAddress(deployer, nonce++);
        address predictedEngine = vm.computeCreateAddress(deployer, nonce++);

        vm.startBroadcast(deployerKey);

        if (deployMock) {
            MockAerodromeRouter mock = new MockAerodromeRouter();
            aerodromeRouter = address(mock);
            console2.log("MockAerodromeRouter:", aerodromeRouter);
        }

        HuntToken hunt = new HuntToken(deployer);
        require(address(hunt) == predictedHunt, "HUNT address mismatch");

        MapToken map = new MapToken(usdc);
        require(address(map) == predictedMap, "MAP address mismatch");

        HuntStaking staking = new HuntStaking(address(hunt), usdc, address(map), predictedEngine);
        require(address(staking) == predictedStaking, "Staking address mismatch");

        CommunityPool community = new CommunityPool(address(hunt), cartographer);
        require(address(community) == predictedCommunity, "Community address mismatch");

        AirdropClaim airdrop = new AirdropClaim(address(hunt), merkleRoot, block.timestamp + AIRDROP_WINDOW);
        require(address(airdrop) == predictedAirdrop, "Airdrop address mismatch");

        CartographerVesting vesting = new CartographerVesting(address(hunt), cartographer, VESTING_ALLOCATION);
        require(address(vesting) == predictedVesting, "Vesting address mismatch");

        TreasureEngine engine = new TreasureEngine(
            usdc,
            address(hunt),
            address(map),
            address(staking),
            address(community),
            cartographer,
            mapMaker,
            aerodromeRouter,
            vrfCoordinator,
            keyHash,
            subscriptionId
        );
        require(address(engine) == predictedEngine, "Engine address mismatch");

        hunt.setEngine(address(engine));

        require(hunt.transfer(address(community), COMMUNITY_ALLOCATION), "Community transfer failed");
        require(hunt.transfer(address(airdrop), AIRDROP_ALLOCATION), "Airdrop transfer failed");
        require(hunt.transfer(cartographer, CARTOGRAPHER_ALLOCATION), "Cartographer transfer failed");
        require(hunt.transfer(address(vesting), VESTING_ALLOCATION), "Vesting transfer failed");
        require(hunt.transfer(liquidity, LIQUIDITY_ALLOCATION), "Liquidity transfer failed");
        require(hunt.transfer(address(engine), EMISSIONS_ALLOCATION), "Emissions transfer failed");

        require(hunt.treasureEngine() == address(engine), "Engine not set");
        require(hunt.totalSupply() == hunt.TOTAL_SUPPLY(), "Total supply mismatch");
        require(hunt.balanceOf(address(engine)) == EMISSIONS_ALLOCATION, "Emissions pool mismatch");
        require(airdrop.claimDeadline() > block.timestamp, "Invalid airdrop deadline");
        require(vesting.totalVested() == VESTING_ALLOCATION, "Vesting amount mismatch");
        require(engine.M() == engine.INITIAL_M(), "M mismatch");
        require(engine.J() == engine.INITIAL_J(), "J mismatch");

        console2.log("Engine:", address(engine));
        console2.log("HUNT:", address(hunt));
        console2.log("MAP:", address(map));
        console2.log("Staking:", address(staking));
        console2.log("CommunityPool:", address(community));
        console2.log("AirdropClaim:", address(airdrop));
        console2.log("CartographerVesting:", address(vesting));

        vm.stopBroadcast();
    }
}
