# Treasure Hunt QA Suite (Frontend)

## Preflight
1. Set env vars in `frontend/.env` (or Vercel) for the target chain:
   - `VITE_CHAIN_ENV=sepolia` (or `mainnet`)
   - `VITE_TREASURE_ENGINE_ADDRESS_<ENV>`
   - `VITE_HUNT_TOKEN_ADDRESS_<ENV>`
   - `VITE_MAP_TOKEN_ADDRESS_<ENV>`
   - `VITE_HUNT_STAKING_ADDRESS_<ENV>`
   - `VITE_USDC_ADDRESS_<ENV>`
   - `VITE_WALLETCONNECT_PROJECT_ID`
2. Ensure wallet has USDC + HUNT on the target chain.
3. Start dev server: `npm run dev` in `frontend/`.

## Wallet + Network Gating
1. Load app with no wallet connected.
   - Expect: Connect prompt + overlay blocks interactions.
2. Connect wallet on wrong chain.
   - Expect: “Wrong network” overlay and switch prompt; app remains blocked.
3. Switch to correct chain (Base or Base Sepolia depending on env).
   - Expect: overlay disappears, data populates.

## Read-Only State (Global)
1. Verify Treasure (`J`), Map Size (`M`), and `epochId` match on-chain.
2. Verify `freeUSDC = usdc.balanceOf(engine) - J`.
3. Verify MAP spot price and MAP supply update on new blocks.

## Read-Only State (User)
1. Verify wallet balances: USDC, HUNT, MAP.
2. Verify staked HUNT and cooldown start.
3. Verify qualification status (`isQualified`).
4. Verify pending rewards (USDC + MAP).

## Approvals
1. Enter an exploration amount. If allowance < amount:
   - Click “Approve USDC”.
   - Expect: approval transaction succeeds and button disables.
2. Enter a MAP buy amount. If allowance < amount:
   - Click “Approve USDC”.
   - Expect: approval transaction succeeds.
3. Enter a stake amount. If allowance < amount:
   - Click “Approve HUNT”.
   - Expect: approval transaction succeeds.

## Exploration (Begin Exploration)
1. Enter an amount >= MIN_BET and <= MAX_BET_BPS limit.
2. Click “Begin Exploration”.
   - Expect: tx submitted; button disabled while pending.
   - On confirm: BetResolved event appears in Captain’s Log.
   - If TreasureDiscovered, global celebration appears.

## MAP Buy
1. Enter USDC amount, click “Acquire MAP”.
   - Expect: tx submitted and confirmed.
   - MapBought event appears in Captain’s Log.
   - MAP balance and supply update.

## MAP Sell
1. Enter MAP amount, click “Return MAP to the Sea”.
   - Expect: tx submitted and confirmed.
   - MapSold event appears in Captain’s Log.
   - MAP balance and supply update.

## Staking
1. Stake HUNT:
   - Enter amount, click “Stow HUNT Below Deck”.
   - Expect: staked balance increases; available HUNT decreases.
2. Initiate withdraw:
   - Click “Prepare to Disembark”.
   - Expect: cooldown timer starts.
3. Cancel withdraw:
   - Click “Cancel Disembarkation”.
   - Expect: cooldown clears.
4. Complete withdraw after cooldown:
   - Click “Complete Withdrawal”.
   - Expect: staked balance decreases; HUNT returns.

## Claim Rewards
1. If pending rewards exist, click “Claim Yer Rewards”.
   - Expect: claim transaction succeeds; pending rewards reset.

## Events + Global Updates
1. Trigger TreasureDiscovered from any wallet.
   - Expect: all open sessions show celebration + log update instantly.
2. Trigger ExpeditionStarted.
   - Expect: M and epoch update without refresh.

## Error Handling
1. Attempt exploration with insufficient USDC.
   - Expect: error and no tx.
2. Attempt MAP buy/sell with zero amount.
   - Expect: inline error.
3. Attempt stake with zero amount.
   - Expect: action prevented.

