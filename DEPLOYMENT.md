# Treasure Hunt Deployment (Base Sepolia)

## 1) Prepare env file
Copy `.env.deploy.example` to `.env.deploy` and fill in:
- `RPC_URL`
- `PRIVATE_KEY` (deployer wallet)
- all address params (cartographer, mapMaker, liquidity, aerodrome router)
- `VRF_SUBSCRIPTION_ID` (full integer from Chainlink UI)
- `AIRDROP_MERKLE_ROOT` (use `0x00..00` if not ready)

## 2) Deploy
From repo root:
```bash
source .env.deploy
forge script script/DeployTreasureHunt.s.sol:DeployTreasureHunt \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast
```

## 3) Add consumer
In Chainlink VRF subscription, add the new TreasureEngine address as a consumer.

## 4) Update frontend env
Update Vercel env values:
- `VITE_TREASURE_ENGINE_ADDRESS_SEPOLIA`
- `VITE_HUNT_TOKEN_ADDRESS_SEPOLIA`
- `VITE_MAP_TOKEN_ADDRESS_SEPOLIA`
- `VITE_HUNT_STAKING_ADDRESS_SEPOLIA`
- `VITE_USDC_ADDRESS_SEPOLIA`

Use `deployments/base-sepolia.json` produced by the script for addresses.

## 5) Redeploy frontend
Trigger a Vercel redeploy.
