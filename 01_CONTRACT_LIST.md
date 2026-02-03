# Treasure Hunt: Contract List
## Version 1.2 — All Parameters Locked

---

## Network Configuration
- **Chain**: Base (Chain ID: 8453)
- **USDC**: Native Circle USDC on Base
- **VRF**: Chainlink VRF v2.5
- **Upgradability**: None (all contracts immutable)
- **Emergency Controls**: None (fully autonomous)

---

## Contract Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL DEPENDENCIES                          │
├─────────────────────────────────────────────────────────────────────────┤
│  USDC (Circle)           │  Chainlink VRF v2.5    │  Aerodrome DEX      │
│  0x833589fCD6eDb6E08f4c7│  Coordinator + LINK     │  Liquidity Pool     │
│  C6B94e0A9a27b4Ce4b0Ce  │  Subscription           │                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           CORE CONTRACTS (6)                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     TreasureEngine.sol                          │   │
│  │  • Bet placement & validation                                   │   │
│  │  • VRF request/callback                                         │   │
│  │  • Outcome resolution (Table C)                                 │   │
│  │  • Contribution routing                                         │   │
│  │  • Treasure discovery mechanism                                 │   │
│  │  • Treasure distribution                                        │   │
│  │  • Expedition state management                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                           │                │                            │
│              ┌────────────┴────┐    ┌──────┴───────┐                   │
│              ▼                 ▼    ▼              ▼                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│  │  HuntToken.sol  │  │  MapToken.sol   │  │ CommunityPool   │        │
│  │                 │  │                 │  │     .sol        │        │
│  │  • ERC20        │  │  • Bonding Curve│  │                 │        │
│  │  • Gameplay mint│  │  • Buy (mint)   │  │  • HUNT holder  │        │
│  │  • Burn         │  │  • Sell (burn)  │  │  • Cartographer │        │
│  │  • Emission rate│  │  • Price calc   │  │    controlled   │        │
│  └────────┬────────┘  └─────────────────┘  └─────────────────┘        │
│           │                                                            │
│           ▼                                                            │
│  ┌─────────────────┐  ┌─────────────────┐                             │
│  │ HuntStaking.sol │  │ AirdropClaim.sol│                             │
│  │                 │  │                 │                             │
│  │  • Stake/unstake│  │  • Merkle proof │                             │
│  │  • 7-day cooldown│ │  • 90-day window│                             │
│  │  • Qualification│  │  • Burn unclaimed│                            │
│  │  • Pro-rata calc│  │                 │                             │
│  └─────────────────┘  └─────────────────┘                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        SUPPORT CONTRACTS (2)                            │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │  CartographerVesting.sol│  │  TreasureHuntDeployer.sol           │  │
│  │                         │  │                                     │  │
│  │  • 10% linear vest      │  │  • Atomic deployment                │  │
│  │  • 4 year duration      │  │  • Initialize all contracts        │  │
│  │  • Cliff: none          │  │  • Set cross-references            │  │
│  │  • Beneficiary: fixed   │  │  • Verify configuration            │  │
│  └─────────────────────────┘  └─────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Contract Specifications

### 1. TreasureEngine.sol
**Purpose**: Core game logic — wagering, outcomes, contributions, and Treasure discovery

| Property | Value |
|----------|-------|
| Inheritance | VRFConsumerBaseV2Plus, ReentrancyGuard |
| Upgradeable | No |
| Admin Functions | None |
| External Calls | USDC, HuntToken, MapToken, HuntStaking, VRF Coordinator |

**State Variables:**
```solidity
// === USDC Accounting (Solvency Model) ===
uint256 public J;                    // Reserved Treasure Chest (USDC, 6 decimals)
                                     // Sacrosanct — ONLY used for Treasure payouts

// Derived values (NOT stored, computed at runtime):
// uint256 totalUSDC = usdc.balanceOf(address(this));  // Total USDC in contract
// uint256 freeUSDC = totalUSDC - J;                   // Unreserved liquidity

// === Expedition State ===
uint256 public M;                    // Maximum Map Size (USDC, 6 decimals)
uint256 public epochId;              // Current expedition identifier
uint256 public N0;                   // Cumulative 0x outcome count
uint256 public E_minted;             // Cumulative HUNT minted from gameplay

// === Immutable Addresses ===
address public immutable cartographer;
address public immutable mapMaker;
address public immutable huntToken;
address public immutable mapToken;
address public immutable huntStaking;
address public immutable communityPool;
address public immutable usdc;
```

**Solvency Invariants (Enforced at Runtime):**
```solidity
// 1. J never exceeds total balance
assert(J <= usdc.balanceOf(address(this)));

// 2. Exploration payouts MUST NOT reduce J
// (all multipliers paid from freeUSDC only)

// 3. Treasure payouts MUST NOT use freeUSDC
// (all discoveries paid from J only)

// 4. Insufficient freeUSDC reverts the transaction
require(freeUSDC >= payout, "Insufficient liquidity");
```

**Key Functions:**
- `placeBet(uint256 amount)` — Place a bet, request VRF
- `fulfillRandomWords(...)` — VRF callback, resolve outcome
- `refundExpiredBet(uint256 requestId)` — Refund if VRF timeout (1 hour)
- `executeQueuedHuntBuy(uint256 maxUsdc)` — Execute queued HUNT buys (keeper)
- `_routeContribution(uint256 L)` — Internal: split 0x contribution
- `_checkDiscovery(uint256 J_prev, uint256 delta)` — Internal: discovery check
- `_distributeTreasure(uint256 P, address discoverer)` — Internal: payout

**Events:**
- `BetPlaced(address indexed participant, uint256 amount, uint256 requestId)`
- `BetResolved(address indexed participant, uint256 amount, uint8 outcomeIndex, uint256 payout)`
- `BetRefunded(uint256 indexed requestId, address bettor, uint256 amount)`
- `ContributionRouted(uint256 amount, uint256 toTreasure, uint256 toMap)`
- `TreasureDiscovered(address indexed discoverer, uint256 amount, uint256 epochId)`
- `ExpeditionStarted(uint256 epochId, uint256 newM)`
- `CascadeCapped(uint256 epochId, uint256 remainingJ, uint256 newM)`
- `HuntBuyQueued(uint256 amount, uint256 totalQueued)`
- `QueuedHuntBuyExecuted(uint256 usdcUsed, uint256 huntBought)`

---

### 2. HuntToken.sol
**Purpose**: $HUNT ERC20 token with gameplay emission logic

| Property | Value |
|----------|-------|
| Inheritance | ERC20, ERC20Burnable |
| Upgradeable | No |
| Total Supply | 1,000,000,000 (1B) with 18 decimals |
| Mintable | Only by TreasureEngine (capped at E_cap) |

**Supply Allocation (minted at genesis):**
```
30% (300M) — Gameplay Emissions Pool (held by TreasureEngine)
25% (250M) — Community Pool (transferred to CommunityPool.sol)
20% (200M) — Airdrop Pool (held by AirdropClaim.sol)
10% (100M) — Cartographer Genesis (transferred to cartographer)
10% (100M) — Cartographer Vesting (transferred to CartographerVesting.sol)
 5% ( 50M) — Liquidity Provisioning (transferred to designated address)
```

**Key Functions:**
- `mint(address to, uint256 amount)` — Only TreasureEngine, only from emissions pool
- `burn(uint256 amount)` — Standard burn
- `burnFrom(address account, uint256 amount)` — Standard burnFrom

---

### 3. HuntStaking.sol
**Purpose**: Staking, cooldown, qualification tracking, and reward distribution (pull pattern)

| Property | Value |
|----------|-------|
| Inheritance | ReentrancyGuard |
| Upgradeable | No |
| Cooldown Period | 7 days (604800 seconds) |
| Distribution | Pull pattern (O(1) claims, no iteration) |

**State Variables:**
```
// Staking
mapping(address => uint256) public stakedBalance;
mapping(address => uint256) public cooldownStart;
uint256 public totalStaked;

// Qualification
mapping(address => uint256) public lastBetEpoch;
uint256 public qualifiedStakeTotal;

// Reward Accumulators (Synthetix-style)
uint256 public rewardPerTokenStored;        // USDC
uint256 public mapRewardPerTokenStored;     // MAP
mapping(address => uint256) public userRewardPerTokenPaid;
mapping(address => uint256) public userMapRewardPerTokenPaid;
mapping(address => uint256) public rewardsOwed;
mapping(address => uint256) public mapRewardsOwed;
```

**Key Functions:**
- `stake(uint256 amount)` — Stake HUNT tokens
- `initiateWithdraw()` — Start 7-day cooldown
- `withdraw(uint256 amount)` — Complete withdrawal after cooldown
- `cancelWithdraw()` — Cancel cooldown, return to staked state
- `recordBet(address participant)` — Called by TreasureEngine on bet
- `isQualified(address participant)` — Check if qualified for current epoch
- `distributeUsdcRewards(uint256 amount)` — Increment global accumulator (TreasureEngine only)
- `distributeMapRewards(uint256 amount)` — Increment MAP accumulator (TreasureEngine only)
- `claimRewards()` — Staker claims pending USDC + MAP rewards (O(1))

---

### 4. MapToken.sol
**Purpose**: $MAP bonding curve token

| Property | Value |
|----------|-------|
| Inheritance | ERC20, ERC20Burnable, ReentrancyGuard |
| Upgradeable | No |
| Initial Supply | 0 (all supply minted via curve) |
| Decimals | 18 |

**Bonding Curve Parameters (immutable):**
```
uint256 public constant P0 = 10_000_000_000_000_000;   // 0.01 USDC (scaled to 18 decimals)
uint256 public constant K = 92_103_403_719;            // k * 1e18 ≈ 9.21e-8 * 1e18
```

**Key Functions:**
- `buy(uint256 usdcAmount)` — Buy MAP with USDC (mint new tokens)
- `sell(uint256 mapAmount)` — Sell MAP for USDC (burn tokens)
- `getBuyPrice(uint256 usdcAmount)` — View: MAP received for USDC
- `getSellProceeds(uint256 mapAmount)` — View: USDC received for MAP
- `currentPrice()` — View: current spot price

**Math Functions (internal):**
- `_cost(uint256 S, uint256 deltaS)` — Cost to mint deltaS from supply S
- `_proceeds(uint256 S, uint256 deltaS)` — Proceeds to burn deltaS from supply S
- `_exp(int256 x)` — Fixed-point exponential (PRBMath or similar)

---

### 5. CommunityPool.sol
**Purpose**: Hold and distribute Community Pool HUNT (no selling)

| Property | Value |
|----------|-------|
| Inheritance | None |
| Upgradeable | No |
| Controller | Cartographer (fixed at deploy) |

**Restrictions:**
- Can ONLY transfer HUNT tokens
- Cannot interact with USDC or any other token
- Cannot sell or swap HUNT

**Key Functions:**
- `distribute(address to, uint256 amount)` — Cartographer only
- `balance()` — View current HUNT balance

---

### 6. AirdropClaim.sol
**Purpose**: Merkle-based airdrop claims with expiry

| Property | Value |
|----------|-------|
| Inheritance | MerkleProof |
| Upgradeable | No |
| Claim Window | 90 days from genesis |

**State Variables:**
```
bytes32 public immutable merkleRoot;      // Set at deploy (by Cartographer)
uint256 public immutable claimDeadline;   // genesis + 90 days
mapping(address => bool) public hasClaimed;
```

**Key Functions:**
- `claim(uint256 amount, bytes32[] calldata proof)` — Claim airdrop
- `burnUnclaimed()` — Anyone can call after deadline, burns remaining

---

### 7. CartographerVesting.sol
**Purpose**: Linear vesting for Cartographer's 10% allocation

| Property | Value |
|----------|-------|
| Inheritance | None |
| Upgradeable | No |
| Vesting Duration | 4 years (126,144,000 seconds) |
| Cliff | None |

**State Variables:**
```
address public immutable beneficiary;     // Cartographer address
uint256 public immutable startTime;       // Genesis timestamp
uint256 public immutable vestingDuration; // 4 years
uint256 public immutable totalVested;     // 100M HUNT
uint256 public released;                  // Amount already claimed
```

**Key Functions:**
- `release()` — Claim vested tokens (anyone can call, sends to beneficiary)
- `vestedAmount()` — View: total vested so far
- `releasable()` — View: available to claim

---

### 8. TreasureHuntDeployer.sol
**Purpose**: Atomic deployment and initialization

| Property | Value |
|----------|-------|
| Inheritance | None |
| Upgradeable | No (single-use) |

**Deployment Sequence:**
1. Deploy HuntToken with all allocations
2. Deploy MapToken
3. Deploy HuntStaking
4. Deploy CommunityPool
5. Deploy AirdropClaim with merkle root
6. Deploy CartographerVesting
7. Deploy TreasureEngine with all references
8. Transfer emissions pool to TreasureEngine
9. Transfer airdrop pool to AirdropClaim
10. Verify all cross-references

---

## External Dependencies

### USDC on Base
- **Address**: `0x833589fCD6eDb6E08f4c7C6B94e0A9a27b4Ce4b0Ce`
- **Decimals**: 6
- **Approval Required**: Participants must approve TreasureEngine

### Chainlink VRF v2.5 on Base
- **Coordinator**: Base VRF Coordinator address (TBD at deploy)
- **Gas Lane**: Standard/Fast (NOT cheapest — callback is heavy)
- **Key Hash**: Finalized at deploy (must support 500k gas callbacks)
- **Subscription**: Requires LINK funding
- **Callback Gas Limit**: 500,000 (locked — supports resolution + routing + cascade)
- **Request Confirmations**: 3 (minimum)

> **Why 500k callback gas**: VRF callback handles outcome resolution, contribution routing, multiple external calls (MAP curve, DEX, staking, burns), and possible treasure discovery with cascading. Cheap lanes risk callback failure.

**VRF Usage (Canonical):**

VRF is used for:
1. Exploration outcome resolution (flip → multiplier)
2. Treasure discovery probability (hit-the-interval)

A **single VRF request** is made per exploration. The random value is deterministically partitioned:
- `outcomeIndex = R % 10_000` → Outcome Table lookup
- `discoveryRoll = (R / 10_000) % M` → Discovery check (0x only)

No pseudo-randomness, no separate VRF for discovery, no off-chain randomness, no rerolls.

### Aerodrome (Liquidity)
- **Router**: Aerodrome Router on Base
- **Pool**: HUNT/USDC pair
- **Provisioning**: 5% HUNT + matching USDC

---

## ERC-4337 Session Key Compatibility

Treasure Hunt supports ERC-4337 smart accounts with session keys for frictionless exploration.

### Architecture

- **Session keys are a UX layer** — they do NOT modify contract logic
- **Contracts receive valid signatures** — unaware of session key mechanism
- **No contract changes required** — TreasureEngine.placeBet() accepts any valid caller

### Session Key Constraints (enforced by smart account module)

| Constraint | Value |
|------------|-------|
| Allowed Contract | TreasureEngine only |
| Allowed Function | `placeBet(uint256 amount)` only |
| Max Spend | Configurable (e.g., 20 USDC) |
| Expiry | Time-based or epoch-based |
| Max Calls | Optional limit |

### What Session Keys CAN Do

- Call `placeBet(uint256 amount)` on TreasureEngine
- Spend USDC up to the session limit
- Execute multiple explorations without wallet popups

### What Session Keys CANNOT Do

- Transfer tokens to arbitrary addresses
- Call any other contract
- Call any other function on TreasureEngine
- Exceed spend limits
- Survive beyond expiry

### MAP Purchases

**MAP buy/sell is NOT included in session keys.**

All MAP purchases require explicit wallet signature:
- MAP is purchased with USDC only (never HUNT)
- Bonding curve buy/sell requires user confirmation
- This preserves clear economic separation

### Security Properties

| Property | Guarantee |
|----------|-----------|
| No backend custody | Session keys are user-controlled |
| No private key exposure | Session key is scoped and ephemeral |
| No drain risk | Hard spend limits enforced |
| No scope creep | Only specified functions callable |
| Auto-expire | No lingering permissions |
| Auditable | All calls are on-chain |

---

## Security Considerations

1. **No Admin Keys**: All contracts are immutable with no owner/admin functions
2. **No Pause**: System runs autonomously once deployed
3. **Reentrancy**: All external calls use ReentrancyGuard
4. **VRF Security**: Uses Chainlink VRF v2.5 with request/fulfill separation
5. **Integer Overflow**: Use Solidity 0.8.x built-in checks
6. **Decimal Handling**: USDC (6 decimals) vs tokens (18 decimals) — careful scaling
7. **Bonding Curve Math**: Fixed-point exponential requires precision library
8. **Session Key Safety**: Session keys strictly safer than repeated EOA signing
9. **Solvency via Reservation**: Single USDC balance with logical partitioning (`J` vs `freeUSDC`). Exploration payouts never touch reserved funds. Insufficient liquidity reverts — no IOUs.

---

## Gas Estimates (Preliminary)

| Operation | Estimated Gas |
|-----------|---------------|
| placeBet | ~150,000 |
| VRF callback (no discovery) | ~250,000 |
| VRF callback (with discovery) | ~500,000 |
| stake | ~80,000 |
| withdraw | ~60,000 |
| MAP buy | ~120,000 |
| MAP sell | ~100,000 |
| airdrop claim | ~80,000 |

---

## Locked Parameters (v1)

All parameters below are **LOCKED** for v1 deployment. Do not modify without full review.

### Core Constants

```solidity
// === VRF Configuration ===
uint32 constant CALLBACK_GAS_LIMIT = 500_000;
uint16 constant REQUEST_CONFIRMATIONS = 3;
// keyHash: Standard/Fast lane (finalized at deploy)

// === Exploration Limits ===
uint256 constant MAX_BET_BPS = 100;              // 1% of M
uint256 constant BPS_DENOMINATOR = 10_000;

// === Discovery Limits ===
uint256 constant MAX_CASCADE = 5;                // Max discovery iterations per tx

// === MAP Bonding Curve Limits ===
uint256 constant MAX_MAP_BUY_USDC = 50_000e6;    // $50,000 per tx
uint256 constant MAX_MAP_SELL_BPS = 100;         // 1% of total MAP supply per tx
```

### Rationale Summary

| Parameter | Value | Why |
|-----------|-------|-----|
| VRF Gas Lane | Standard/Fast | Callback is heavy (routing + cascade) |
| Callback Gas | 500,000 | Supports worst-case cascade + multi-call |
| Max Bet | 1% of M | Limits liquidity shock, prevents forced discovery |
| Max Cascade | 5 | Prevents gas exhaustion, allows legendary events |
| MAP Buy Cap | $50k/tx | Prevents gas blowups, precision edge cases |
| MAP Sell Cap | 1% supply/tx | Prevents sudden curve collapse |

> **Note**: These limits do not affect long-term access, only per-transaction execution.

---

*Document Version: 1.2*
*Last Updated: February 3, 2026*
*Status: LOCKED — All Parameters Finalized*
