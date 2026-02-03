Original prompt: Treasure Hunt — Execution Checklist & Acceptance Criteria (Phases 1–6 covering contracts, frontend, testnet deployment, audit package, responsiveness, and runbook).

Notes:
- develop-web-game skill invoked; no web game implementation yet.
- Repository currently contains PRD/solvency/spec docs and JSX mockups only.

TODO:
- Clarify requested scope for this run (contracts vs frontend vs checklist conversion).
- If web game iteration is desired, locate/identify actual game source (no src/ found yet).
- Confirm desired next action: implement contracts, generate tests, or build frontend scaffolding.

Update 2026-02-02:
- Added Foundry scaffolding (foundry.toml) and created initial contract skeletons:
  - src/TreasureEngine.sol (constants, storage, events, partial bet flow; routing/treasure/emissions TODO)
  - src/HuntToken.sol (allocations + mint/burn)
  - src/MapToken.sol (bonding curve TODO)
  - src/HuntStaking.sol
  - src/CommunityPool.sol
  - src/AirdropClaim.sol
  - src/CartographerVesting.sol
- Added minimal local deps: ERC20, ReentrancyGuard, MerkleProof, VRFConsumerBaseV2Plus, and interfaces.

Open Questions / TODO:
- Confirm deployment strategy for HuntToken needing TreasureEngine address in constructor (create2 or deployer ordering).
- Implement MapToken bonding curve math (PRBMath or equivalent) and enforce buy/sell caps.
- Implement TreasureEngine routing, discovery, emission, and Aerodrome buy queue logic.
- Add TreasureHuntDeployer if desired (not in Phase 1 list but in contract list doc).
- Add tests (fuzz/invariant) once forge available.
- Install Foundry or confirm preferred toolchain.

Update 2026-02-02 (cont.):
- Implemented TreasureEngine core routing, discovery, cascade, and treasure distribution logic.
- Added Aerodrome buy queue handling and HUNT burn path; added USDC approvals in TreasureEngine constructor.
- Implemented emission decay math in TreasureEngine using MathExp (PRBMath-derived exp/log2/ln).
- Added MathExp library (PRBMath UD60x18 subset) and implemented MapToken bonding curve with ln/exp inversion.
- Added TreasureHuntDeployer for one-shot deployment with address precompute validation and config hash event.
- Added Foundry test scaffolding with mocks and two test suites (TreasureEngineAccounting, MapTokenCurve).

Notes:
- forge binary not found in PATH in this environment ("forge build" failed). CI should run tests.

TODO:
- Verify PRBMath constants and prbExp2 implementation against upstream (sourced via Etherscan copy).
- Consider clamping MapToken exp input or documenting extreme supply behavior.
- Add additional invariant fuzz tests (J <= balance, explore doesn't spend J, treasure doesn't spend freeUSDC).
- Add staking-specific tests for qualification + reward accumulator behavior.

Update 2026-02-02 (tests + fixes):
- Added invariant/queue comments and centralized _freeUSDC helper in TreasureEngine.
- Added MAP buy/sell events and MathExp safety comment.
- Fixed staking reward funding by transferring USDC/MAP to HuntStaking before accumulator updates.
- Refactored TreasureHuntDeployer to avoid stack-too-deep; added configHash hashing in two stages.
- Implemented VRF requestRandomWords mock; adjusted MAP tests for rounding.
- forge test -vvv passes (9/9). Warnings about missing etherscan config/cache are benign.

Open question:
- Confirm emission model preference: 700M genesis + 300M minting (current) vs 1B minted with 300M held by engine.

Update 2026-02-02 (emissions model flip):
- Flipped HUNT to fixed 1B genesis mint and removed runtime minting.
- TreasureEngine now transfers emissions from its pre-funded balance; emission cap is enforced by balance.
- Deployer distributes 300M HUNT to TreasureEngine as emissions pool and validates pool balance.
- Updated tests and reran forge test -vvv (9/9 pass).

Update 2026-02-02 (Phase 1.5 tests):
- Added hasBet gating in HuntStaking and made qualifiedStakeTotal update on stake/withdraw for qualified accounts.
- Added VM cheatcode helper for warp/prank-based tests.
- Added HuntStaking qualification test suite covering all required cases.
- Added emission decay test suite with caps by E_CAP and engine balance + exhaustion.
- forge test -vvv passes (21/21).

Update 2026-02-02 (Phase 2 read-only frontend scaffolding):
- Added frontend config/env handling for contract addresses + WalletConnect project id.
- Added wagmi/RainbowKit config and React App with Base-only gating, read-only contract reads, and event-driven activity feed.
- Added minimal ABIs for TreasureEngine, MapToken, and HuntStaking plus formatted UI for J/M/epoch/freeUSDC, balances, and MAP price.
- Added themed CSS layout with treasure pulse animation and disabled write buttons.

TODO:
- Provide .env template for VITE_* addresses + WalletConnect project id.
- Confirm Base vs Base Sepolia chain target for read-only gating.
- Run the frontend locally to validate layouts and RainbowKit connect flow.

Update 2026-02-03 (Phase 2 env toggle):
- Added `frontend/.env.example` with mainnet/sepolia address slots and WalletConnect project id.
- Added chain environment toggle (`VITE_CHAIN_ENV`) and Base/Base Sepolia gating in `frontend/src/config.js` + `frontend/src/web3.js`.
- Updated UI gating messaging and switch chain button to use selected chain.

Update 2026-02-03 (Phase 2 demo toggle):
- Added `VITE_CHAIN_ENV`-based chain selection (Base vs Base Sepolia).
- Added `VITE_DEMO_MODE` and a deterministic treasure demo trigger (no write txs) to showcase TreasureDiscovered UI/pulse.
- Added .env.example for mainnet/sepolia address slots + demo mode flag.

Update 2026-02-03 (Phase 2 demo UX polish):
- Reworked read-only UI to match mockup information architecture: Treasure, Expedition State, MAP Market, HUNT Crew, Captain's Log.
- Added full-screen, centered Treasure discovery celebration overlay (triggered by on-chain event or demo trigger).
- Updated typography and visual styling to a pirate parchment theme with improved hierarchy and event log presentation.
