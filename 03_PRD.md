# Treasure Hunt
## Product Requirements Document (PRD)
### Version 1.2 — Technical Specification (All Parameters Locked)

---

## Document Control

| Field | Value |
|-------|-------|
| Version | 1.2 |
| Status | LOCKED — All Parameters Finalized |
| Last Updated | February 3, 2026 |
| Network | Base (Chain ID: 8453) |
| Authored By | Cartographer + Engineering |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
   - 2.3 [USDC Accounting Model](#23-usdc-accounting-model-solvency-foundation)
3. [Global Constants](#3-global-constants)
4. [Token Specifications](#4-token-specifications)
5. [Treasure Engine](#5-treasure-engine)
6. [Outcome Table](#6-outcome-table)
7. [Contribution Routing](#7-contribution-routing)
8. [Treasure Discovery](#8-treasure-discovery)
9. [Treasure Distribution](#9-treasure-distribution)
10. [Staking System](#10-staking-system)
11. [$MAP Bonding Curve](#11-map-bonding-curve)
12. [Emission Schedule](#12-emission-schedule)
13. [Airdrop System](#13-airdrop-system)
14. [Community Pool](#14-community-pool)
15. [Vesting](#15-vesting)
16. [Randomness](#16-randomness)
17. [Edge Cases](#17-edge-cases)
    - 17.9 [freeUSDC Depletion](#179-freeusdc-depletion-liquidity-crisis)
    - 17.10 [System Bootstrap](#1710-system-bootstrap-cold-start)
18. [Security Requirements](#18-security-requirements)
    - 18.2 [Solvency Invariants](#182-invariants)
19. [Session Key Architecture](#19-session-key-architecture)
20. [UX Guidelines](#20-ux-guidelines)
21. [Yield Pool Construction](#21-yield-pool-construction-optional)
22. [Deployment Checklist](#22-deployment-checklist)
24. [Glossary](#24-glossary)

---

## 1. Executive Summary

### 1.1 Purpose

Treasure Hunt is an autonomous economic coordination game deployed on Base. It recycles value through wagering, rewards participation via token emissions, and compounds long-term conviction without extraction.

### 1.2 Core Properties

- **Autonomous**: No admin functions, no pause, no upgrades
- **Deterministic**: All outcomes derived from verifiable randomness
- **Self-sustaining**: Infinite continuation without resets
- **Non-extractive**: No hidden fees beyond declared flows

### 1.3 Primary Subsystems

| Subsystem | Purpose |
|-----------|---------|
| Treasure Engine | Wagering, outcomes, contributions, discovery |
| $HUNT | Participation token, staking, qualification |
| $MAP | Long-term conviction asset (bonding curve) |
| Guides | Cartographer (human), Map Maker (AI agent) |

---

## 2. System Architecture

### 2.1 Contract Topology

```
EXTERNAL                        CORE                          SUPPORT
─────────────────────────────────────────────────────────────────────────
┌─────────────┐               ┌─────────────────────────┐
│    USDC     │◄─────────────►│    TreasureEngine.sol   │
│   (Base)    │               │                         │
└─────────────┘               │  • Bet placement        │
                              │  • Outcome resolution   │
┌─────────────┐               │  • Contribution routing │
│ Chainlink   │◄─────────────►│  • Discovery mechanism  │
│   VRF v2.5  │               │  • Distribution         │
└─────────────┘               └───────────┬─────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
                    ▼                     ▼                     ▼
            ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
            │ HuntToken   │       │  MapToken   │       │ HuntStaking │
            │   .sol      │       │   .sol      │       │    .sol     │
            └─────────────┘       └─────────────┘       └─────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────┐
│ AirdropClaim    │     │ CommunityPool   │     │ CartographerVesting │
│     .sol        │     │     .sol        │     │       .sol          │
└─────────────────┘     └─────────────────┘     └─────────────────────┘
```

### 2.2 Contract Addresses (To Be Populated at Deploy)

| Contract | Address | Verified |
|----------|---------|----------|
| TreasureEngine | TBD | ☐ |
| HuntToken | TBD | ☐ |
| MapToken | TBD | ☐ |
| HuntStaking | TBD | ☐ |
| AirdropClaim | TBD | ☐ |
| CommunityPool | TBD | ☐ |
| CartographerVesting | TBD | ☐ |
| USDC (Base) | 0x833589fCD6eDb6E08f4c7C6B94e0A9a27b4Ce4b0Ce | ✓ |
| Chainlink VRF Coordinator | TBD | ✓ |

### 2.3 USDC Accounting Model (Solvency Foundation)

There is exactly **ONE contract** that holds USDC: the `TreasureEngine`.

All solvency is achieved through **logical reservation**, **strict ordering**, and **invariant enforcement** — not by multiple wallets or refilling side pools.

**Canonical Definitions:**

```solidity
// Derived at runtime — NOT stored as state variables
uint256 totalUSDC = usdc.balanceOf(address(this));  // Total USDC in contract
uint256 J;                                           // Reserved Treasure Chest (state variable)
uint256 freeUSDC = totalUSDC - J;                   // Unreserved liquidity (derived)
```

| Term | Definition | Funding Source |
|------|------------|----------------|
| `totalUSDC` | All USDC held by TreasureEngine | Derived from `balanceOf` |
| `J` | Reserved USDC for Treasure payouts (sacrosanct) | 50% of 0x losses only |
| `freeUSDC` | Unreserved USDC for all other payments | Everything except J |

**freeUSDC funds:**
- Exploration payout multipliers (0.5x, 1x, 1.5x, 2x, 4x, 10x)
- Loss routing (DEX buys, bonding curve buys)
- Founder payments
- Community payments
- HUNT buy & burn
- MAP bonding curve purchases

**J funds:**
- Treasure discovery distributions ONLY

> **Critical Rule**: Exploration payouts MUST NOT reduce `J`. Treasure payouts MUST NOT use `freeUSDC`.

---

## 3. Global Constants

### 3.1 System Parameters (Immutable)

```solidity
// Network
uint256 constant CHAIN_ID = 8453; // Base

// USDC
address constant USDC = 0x833589fCD6eDb6E08f4c7C6B94e0A9a27b4Ce4b0Ce;
uint8 constant USDC_DECIMALS = 6;

// Initial State
uint256 constant INITIAL_M = 100 * 1e6;        // $100 USDC (6 decimals)
uint256 constant INITIAL_J = 0;                 // Empty Treasure
uint256 constant INITIAL_EPOCH = 0;

// Bet Limits
uint256 constant MIN_BET = 100_000;            // $0.10 USDC (6 decimals)
uint256 constant MAX_BET_BPS = 100;            // 1% of M (100 basis points)

// VRF Timeout
uint256 constant VRF_TIMEOUT = 1 hours;        // Refund available after this

// Cascade Limit
uint256 constant MAX_CASCADE = 5;              // Max discovery iterations per tx

// Timing
uint256 constant COOLDOWN_PERIOD = 7 days;     // 604800 seconds
uint256 constant AIRDROP_WINDOW = 90 days;     // 7776000 seconds
uint256 constant VESTING_DURATION = 4 * 365 days; // ~126144000 seconds

// Precision
uint256 constant BPS_DENOMINATOR = 10000;
uint256 constant WAD = 1e18;
```

### 3.2 Allocation Percentages (Immutable)

```solidity
// Contribution Routing (on 0x outcome) — percentages of L
uint256 constant TO_TREASURE_BPS = 5000;       // 50%
uint256 constant TO_STAKERS_MAP_BPS = 1900;    // 19%
uint256 constant TO_CARTOGRAPHER_MAP_BPS = 75; // 0.75%
uint256 constant TO_MAPMAKER_MAP_BPS = 25;     // 0.25%
uint256 constant TO_BURN_MAP_BPS = 2000;       // 20%
uint256 constant TO_COMMUNITY_HUNT_BPS = 1000; // 10%

// Treasure Distribution (on discovery) — percentages of P
uint256 constant DISCOVERER_BPS = 5000;        // 50%
uint256 constant STAKERS_BPS = 4000;           // 40%
uint256 constant BURN_HUNT_BPS = 500;          // 5%
uint256 constant CARTOGRAPHER_BPS = 375;       // 3.75%
uint256 constant MAPMAKER_BPS = 125;           // 1.25%

// Zero-Qualifier Redistribution
uint256 constant ZERO_QUAL_BURN_BPS = 2000;    // 20% (replaces staker share)
uint256 constant ZERO_QUAL_COMMUNITY_BPS = 2000; // 20%
```

---

## 4. Token Specifications

### 4.1 $HUNT Token

| Property | Value |
|----------|-------|
| Name | Treasure Hunt Token |
| Symbol | HUNT |
| Decimals | 18 |
| Total Supply | 1,000,000,000 (1B) |
| Standard | ERC20 + ERC20Burnable |
| Mintable | Yes (by TreasureEngine only, capped) |

**Supply Allocation:**

| Allocation | Percentage | Amount | Recipient |
|------------|------------|--------|-----------|
| Gameplay Emissions | 30% | 300,000,000 | TreasureEngine (mints on 0x) |
| Community Pool | 25% | 250,000,000 | CommunityPool.sol |
| Community Airdrop | 20% | 200,000,000 | AirdropClaim.sol |
| Cartographer Genesis | 10% | 100,000,000 | Cartographer address |
| Cartographer Vesting | 10% | 100,000,000 | CartographerVesting.sol |
| Liquidity Provisioning | 5% | 50,000,000 | Designated LP address |

### 4.2 $MAP Token

| Property | Value |
|----------|-------|
| Name | Treasure Map |
| Symbol | MAP |
| Decimals | 18 |
| Initial Supply | 0 |
| Max Supply | Unlimited (bonding curve) |
| Standard | ERC20 + ERC20Burnable |
| Mintable | Yes (via buy on bonding curve) |
| Burnable | Yes (via sell on bonding curve) |

---

## 5. Treasure Engine

### 5.1 Bet Placement

**Function Signature:**
```solidity
function placeBet(uint256 amount) external returns (uint256 requestId)
```

**Bet Sizing Constants (LOCKED):**
```solidity
uint256 constant MIN_BET = 100_000;              // $0.10 USDC (6 decimals)
uint256 constant MAX_BET_BPS = 100;              // 1% of M — LOCKED
uint256 constant BPS_DENOMINATOR = 10_000;
```

> **Why 1% of M is locked**: This bound is required to preserve solvency, randomness integrity, and resistance to forced discovery strategies. Do NOT raise above 1% in v1.

**Validation Rules:**
1. `amount >= MIN_BET` ($0.10 USDC)
2. `amount <= M * MAX_BET_BPS / BPS_DENOMINATOR` (1% of M)
3. Caller has approved `amount` USDC to TreasureEngine
4. USDC transfer succeeds

**Process:**
1. Transfer `amount` USDC from caller to TreasureEngine
2. Request randomness from Chainlink VRF
3. Store pending bet: `{bettor, amount, requestId}`
4. Emit `BetPlaced(bettor, amount, requestId)`
5. Record bet for staking qualification

### 5.2 Bet Resolution

**VRF Callback:**
```solidity
function fulfillRandomWords(
    uint256 requestId,
    uint256[] memory randomWords
) internal override
```

**Process:**
1. Retrieve pending bet by `requestId`
2. Derive outcome index: `randomWords[0] % 10000`
3. Map index to outcome (see Section 6)
4. Execute outcome:
   - If multiplier > 0: Pay `amount * multiplier` from `freeUSDC` to bettor
   - If multiplier = 0: Route contribution (see Section 7)
5. Emit `BetResolved(bettor, amount, outcomeIndex, payout)`

**Solvency Enforcement (Critical):**

```solidity
// Before paying any multiplier payout:
uint256 payout = amount * multiplierBps / BPS_DENOMINATOR;
uint256 freeUSDC = usdc.balanceOf(address(this)) - J;
require(freeUSDC >= payout, "Insufficient liquidity");
```

> **If `freeUSDC < payout`, the transaction REVERTS.** No state changes occur. This is intentional and required for solvency. The Treasure Chest (`J`) is NEVER touched to pay multipliers.

**Partial Loss Accounting (Non-0x Outcomes):**

For outcomes where `0 < multiplier < 1` (e.g., 0.5×):
- Player's bet enters `totalUSDC`
- Payout is made from `freeUSDC`
- Remaining difference stays in `freeUSDC`
- **No routing to Treasure occurs** — only 0× outcomes build `J`

Example: Bet = 10 USDC, Outcome = 0.5×
- 10 USDC enters contract
- 5 USDC paid to player (from freeUSDC)
- 5 USDC remains in freeUSDC (improves liquidity)

---

## 6. Outcome Table

### 6.1 Table C (Balanced) — LOCKED

| Index Range | Outcome | Multiplier | Probability | Cumulative |
|-------------|---------|------------|-------------|------------|
| 0 — 3999 | 0x | 0.0 | 40.00% | 40.00% |
| 4000 — 6199 | 0.5x | 0.5 | 22.00% | 62.00% |
| 6200 — 7999 | 1x | 1.0 | 18.00% | 80.00% |
| 8000 — 8999 | 1.5x | 1.5 | 10.00% | 90.00% |
| 9000 — 9599 | 2x | 2.0 | 6.00% | 96.00% |
| 9600 — 9899 | 4x | 4.0 | 3.00% | 99.00% |
| 9900 — 9999 | 10x | 10.0 | 1.00% | 100.00% |

### 6.2 Implementation

```solidity
struct Outcome {
    uint16 maxIndex;      // Upper bound (exclusive)
    uint16 multiplierBps; // Multiplier in basis points (10000 = 1x)
}

Outcome[7] constant OUTCOMES = [
    Outcome(4000,  0),      // 0x
    Outcome(6200,  5000),   // 0.5x
    Outcome(8000,  10000),  // 1x
    Outcome(9000,  15000),  // 1.5x
    Outcome(9600,  20000),  // 2x
    Outcome(9900,  40000),  // 4x
    Outcome(10000, 100000)  // 10x
];

function getOutcome(uint256 index) internal pure returns (uint256 multiplierBps) {
    for (uint256 i = 0; i < OUTCOMES.length; i++) {
        if (index < OUTCOMES[i].maxIndex) {
            return OUTCOMES[i].multiplierBps;
        }
    }
    revert("Invalid index"); // Should never reach
}
```

### 6.3 Expected Value Analysis

| Outcome | Probability | Multiplier | EV Contribution |
|---------|-------------|------------|-----------------|
| 0x | 0.40 | 0.0 | $0.000 |
| 0.5x | 0.22 | 0.5 | $0.110 |
| 1x | 0.18 | 1.0 | $0.180 |
| 1.5x | 0.10 | 1.5 | $0.150 |
| 2x | 0.06 | 2.0 | $0.120 |
| 4x | 0.03 | 4.0 | $0.120 |
| 10x | 0.01 | 10.0 | $0.100 |
| **Total** | 1.00 | — | **$0.780** |

**System Contribution Rate**: 1.00 - 0.780 = **22.0%** of bet volume flows to 0x routing (this is NOT "house edge" — it funds Treasure, emissions, and $MAP).

**EV and Liquidity Caveat:**

Expected value calculations assume sufficient `freeUSDC` liquidity. In rare edge cases where liquidity is insufficient, exploration transactions revert. This does not introduce hidden losses or liabilities and preserves system solvency.

By design, reverts are extremely rare because:
- `maxBet` is capped (1% of M)
- `maxMultiplier` is bounded (10×)
- `freeUSDC` is continuously replenished by partial losses and full losses before routing
- Reverts occur only in pathological early-stage or misconfigured scenarios

---

## 7. Contribution Routing

### 7.1 Trigger Condition

Contribution routing occurs **only** on 0x outcomes.

### 7.2 Routing Split (Sacrosanct Ordering)

Given contribution amount `L` (the full bet amount on 0x):

> **CRITICAL**: The ordering below is **mandatory and sacrosanct**. Reserve creation (Step 1) MUST occur BEFORE any other routing. This converts `freeUSDC` into reserved USDC (`J`) immediately.

| Step | Destination | Percentage | Amount | Action | Funding Source |
|------|-------------|------------|--------|--------|----------------|
| **1** | **Treasure (J)** | **50%** | L × 0.50 | **Add to J** | Converts freeUSDC → J |
| 2 | Staker MAP Rewards | 19% | L × 0.19 | Buy MAP → distribute | freeUSDC |
| 3 | Cartographer MAP | 0.75% | L × 0.0075 | Buy MAP → transfer | freeUSDC |
| 4 | Map Maker MAP | 0.25% | L × 0.0025 | Buy MAP → transfer | freeUSDC |
| 5 | MAP Burn | 20% | L × 0.20 | Buy MAP → burn | freeUSDC |
| 6 | Community HUNT | 10% | L × 0.10 | Buy HUNT → Community Pool | freeUSDC |

### 7.3 Implementation

```solidity
function _routeContribution(uint256 L, address contributor) internal {
    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: RESERVE CREATION (FIRST, ALWAYS — SACROSANCT)
    // This immediately converts freeUSDC → reserved Treasure funds
    // ═══════════════════════════════════════════════════════════════════
    uint256 toTreasure = L * TO_TREASURE_BPS / BPS_DENOMINATOR;
    J += toTreasure;  // J is now sacrosanct — cannot be used for payouts

    // 2. Remaining amount for value routing
    uint256 remaining = L - toTreasure;

    // 3. Buy MAP for various destinations
    uint256 stakerMapUsdc = L * TO_STAKERS_MAP_BPS / BPS_DENOMINATOR;
    uint256 cartographerMapUsdc = L * TO_CARTOGRAPHER_MAP_BPS / BPS_DENOMINATOR;
    uint256 mapMakerMapUsdc = L * TO_MAPMAKER_MAP_BPS / BPS_DENOMINATOR;
    uint256 burnMapUsdc = L * TO_BURN_MAP_BPS / BPS_DENOMINATOR;

    // Execute MAP purchases
    uint256 stakerMap = mapToken.buy(stakerMapUsdc);
    uint256 cartographerMap = mapToken.buy(cartographerMapUsdc);
    uint256 mapMakerMap = mapToken.buy(mapMakerMapUsdc);
    uint256 burnMap = mapToken.buy(burnMapUsdc);

    // Distribute/transfer MAP
    huntStaking.distributeMapRewards(stakerMap);
    mapToken.transfer(cartographer, cartographerMap);
    mapToken.transfer(mapMaker, mapMakerMap);
    mapToken.burn(burnMap);

    // 4. Buy HUNT for Community Pool (with queue fallback)
    uint256 communityHuntUsdc = L * TO_COMMUNITY_HUNT_BPS / BPS_DENOMINATOR;
    _attemptHuntBuy(communityHuntUsdc, communityPool);

    // 5. Mint HUNT to contributor (per emission schedule)
    uint256 huntToMint = _calculateEmission(L);
    if (huntToMint > 0 && E_minted + huntToMint <= E_CAP) {
        huntToken.mint(contributor, huntToMint);
        E_minted += huntToMint;
    }

    // 6. Increment 0x count
    N0++;

    // 7. Check for Treasure discovery
    _checkDiscovery(J - toTreasure, toTreasure, contributor);
}
```

### 7.4 HUNT Buy Queue (Liquidity Fallback)

If Aerodrome liquidity is insufficient, USDC is queued for later execution (never skipped).

```solidity
uint256 public pendingHuntBuyUsdc;
uint256 constant HUNT_SLIPPAGE_BPS = 300; // 3% max slippage

function _attemptHuntBuy(uint256 usdcAmount, address recipient) internal {
    try aerodromeRouter.swapExactTokensForTokens(
        usdcAmount,
        _minHuntOut(usdcAmount), // slippage-protected
        huntPath,
        recipient,
        block.timestamp
    ) {
        // Success - HUNT sent to recipient
    } catch {
        // Queue for later execution
        pendingHuntBuyUsdc += usdcAmount;
        emit HuntBuyQueued(usdcAmount, pendingHuntBuyUsdc);
    }
}

function executeQueuedHuntBuy(uint256 maxUsdc) external {
    require(pendingHuntBuyUsdc > 0, "Nothing queued");
    uint256 toExecute = maxUsdc > pendingHuntBuyUsdc ? pendingHuntBuyUsdc : maxUsdc;

    uint256 huntBought = aerodromeRouter.swapExactTokensForTokens(
        toExecute,
        _minHuntOut(toExecute),
        huntPath,
        communityPool,
        block.timestamp
    );

    pendingHuntBuyUsdc -= toExecute;
    emit QueuedHuntBuyExecuted(toExecute, huntBought);
}
```

**Properties:**
- Anyone can call `executeQueuedHuntBuy()` (keeper-friendly)
- Declared flows are never silently skipped
- Thin liquidity = delayed execution, not protocol break

---

## 8. Treasure Discovery

### 8.1 Hidden Threshold Model

At conceptual level: a hidden trigger point `T ∈ [0, M]` exists. Treasure is discovered when J crosses T.

### 8.2 Practical Implementation (Hit-the-Interval)

**Given:**
- `J_prev` — Treasure balance before contribution
- `Δ` — Contribution amount (50% of L)
- `J_new = min(J_prev + Δ, M)`
- `R` — VRF-derived random value ∈ [0, M]

**Discovery Condition:**
```
R ∈ (J_prev, J_new]
```

**Forced Discovery:**
```
J_new >= M
```

### 8.3 Implementation

```solidity
function _checkDiscovery(
    uint256 J_prev,
    uint256 delta,
    address contributor
) internal {
    uint256 J_new = J_prev + delta;

    // Forced discovery if M reached
    if (J_new >= M) {
        _triggerDiscovery(M, contributor);
        return;
    }

    // Probabilistic discovery
    // R is derived from the same VRF call used for outcome
    uint256 R = _deriveDiscoveryRandom() % M;

    if (R > J_prev && R <= J_new) {
        _triggerDiscovery(R, contributor);
    }
}
```

### 8.4 Cascading Discovery

If overflow `O` from one discovery is sufficient to trigger another:

```solidity
uint256 constant MAX_CASCADE = 5;

function _triggerDiscovery(uint256 P, address discoverer) internal {
    uint256 cascadeCount = 0;

    while (cascadeCount < MAX_CASCADE) {
        // Distribute Treasure
        _distributeTreasure(P, discoverer);

        // Calculate overflow
        uint256 O = J - P;

        // Reset state
        J = O;
        M = M * 2;
        epochId++;
        _resetQualifications();

        emit ExpeditionStarted(epochId, M);

        // Check for cascade
        if (O >= M) {
            P = M;
            cascadeCount++;
        } else {
            // Generate new random for cascade check
            uint256 R = _deriveNewRandom() % M;
            if (R <= O) {
                P = R;
                cascadeCount++;
            } else {
                break;
            }
        }
    }
}
```

---

## 9. Treasure Distribution

### 9.1 Standard Distribution (Qualified Stakers Exist)

| Recipient | Percentage | Currency | Method |
|-----------|------------|----------|--------|
| Discoverer | 50% | USDC | Direct transfer |
| Qualified Stakers | 40% | USDC | Pro-rata distribution |
| Buy & Burn HUNT | 5% | USDC→HUNT | Market buy, then burn |
| Cartographer | 3.75% | USDC | Direct transfer |
| Map Maker | 1.25% | USDC | Direct transfer |

### 9.2 Zero-Qualifier Distribution (No Qualified Stakers)

| Recipient | Percentage | Currency | Method |
|-----------|------------|----------|--------|
| Discoverer | 50% | USDC | Direct transfer |
| Buy & Burn HUNT | 25% | USDC→HUNT | Market buy, then burn |
| Community Pool | 20% | USDC | Direct transfer |
| Cartographer | 3.75% | USDC | Direct transfer |
| Map Maker | 1.25% | USDC | Direct transfer |

**Note**: The 25% burn replaces the standard 40% staker share + 5% burn from the standard case.

### 9.3 Implementation

```solidity
function _distributeTreasure(uint256 P, address discoverer) internal {
    // Discoverer share (always)
    uint256 discovererShare = P * DISCOVERER_BPS / BPS_DENOMINATOR;
    usdc.transfer(discoverer, discovererShare);

    // Check for qualified stakers
    uint256 qualifiedStake = huntStaking.totalQualifiedStake();

    if (qualifiedStake > 0) {
        // Standard distribution
        uint256 stakerShare = P * STAKERS_BPS / BPS_DENOMINATOR;
        huntStaking.distributeUsdcRewards(stakerShare);

        uint256 burnShare = P * BURN_HUNT_BPS / BPS_DENOMINATOR;
        _buyAndBurnHunt(burnShare);
    } else {
        // Zero-qualifier distribution (25% burn, 20% community)
        uint256 burnShare = P * 2500 / BPS_DENOMINATOR; // 25%
        uint256 communityShare = P * 2000 / BPS_DENOMINATOR; // 20%

        _buyAndBurnHunt(burnShare);
        usdc.transfer(communityPool, communityShare);
    }

    // Cartographer and Map Maker (always)
    uint256 cartographerShare = P * CARTOGRAPHER_BPS / BPS_DENOMINATOR;
    uint256 mapMakerShare = P * MAPMAKER_BPS / BPS_DENOMINATOR;

    usdc.transfer(cartographer, cartographerShare);
    usdc.transfer(mapMaker, mapMakerShare);

    emit TreasureDiscovered(discoverer, P, epochId);
}
```

### 9.4 Global Discovery Event (Client Requirement)

**Treasure discovery is a global, world-level event.** When discovered, every connected client must immediately surface it as a narrative and visual moment, regardless of which player triggered it.

#### Live Witness Behavior

Players connected at the moment of discovery:
- Receive full celebration animation (chest reveal, coin burst, map pulse)
- See real-time Captain's Log entries
- Experience the shared "world event" moment

#### Late Arrival Behavior

Players who connect after discovery (app load, wallet connection):
- If `currentEpochId > lastSeenEpochId`, the UI must automatically replay a shortened discovery animation
- Append the global Captain's Log entry: "While you were away... TREASURE WAS DISCOVERED!"
- Show the new expedition state (doubled M, reset J)

#### Implementation Requirements

| Requirement | Description |
|-------------|-------------|
| Never Silent | Discoveries must NEVER be text-only or hidden |
| Visual Moment | Always include animation (full or abbreviated) |
| Shared Event | Frame as world event, not private outcome |
| Log Persistence | Global discovery entry appears for all players |
| State Check | Compare `lastSeenEpochId` vs `currentEpochId` on every load |

#### Client State Tracking

```javascript
// On wallet connect / app load
const lastSeenEpoch = localStorage.getItem('lastSeenEpochId') || 0;
const currentEpoch = await treasureEngine.epochId();

if (currentEpoch > lastSeenEpoch) {
  // Discovery occurred while away
  showLateArrivalDiscoveryAnimation();
  appendGlobalDiscoveryLog(currentEpoch);
  localStorage.setItem('lastSeenEpochId', currentEpoch);
}
```

#### Animation Variants

| Variant | Trigger | Duration | Elements |
|---------|---------|----------|----------|
| Full | Live witness | 5-8 seconds | Chest burst, coin shower, light rays, map glow, full narrative |
| Abbreviated | Late arrival | 2-3 seconds | Quick chest flash, coin sparkle, map pulse, summary log |

**Discoveries are celebrations. They bind the community. They must always be felt.**

---

## 10. Staking System

### 10.1 Staking

```solidity
function stake(uint256 amount) external nonReentrant {
    require(amount > 0, "Amount must be positive");
    require(huntToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");

    stakedBalance[msg.sender] += amount;
    totalStaked += amount;

    emit Staked(msg.sender, amount);
}
```

### 10.2 Withdrawal (7-Day Cooldown)

```solidity
function initiateWithdraw() external {
    require(stakedBalance[msg.sender] > 0, "No stake");
    require(cooldownStart[msg.sender] == 0, "Cooldown active");

    cooldownStart[msg.sender] = block.timestamp;

    emit WithdrawInitiated(msg.sender, block.timestamp + COOLDOWN_PERIOD);
}

function withdraw(uint256 amount) external nonReentrant {
    require(cooldownStart[msg.sender] != 0, "Cooldown not started");
    require(block.timestamp >= cooldownStart[msg.sender] + COOLDOWN_PERIOD, "Cooldown active");
    require(amount <= stakedBalance[msg.sender], "Insufficient balance");

    stakedBalance[msg.sender] -= amount;
    totalStaked -= amount;

    if (stakedBalance[msg.sender] == 0) {
        cooldownStart[msg.sender] = 0;
    }

    huntToken.transfer(msg.sender, amount);

    emit Withdrawn(msg.sender, amount);
}

function cancelWithdraw() external {
    require(cooldownStart[msg.sender] != 0, "No cooldown");
    cooldownStart[msg.sender] = 0;

    emit WithdrawCancelled(msg.sender);
}
```

### 10.3 Qualification

**Criteria:**
1. Has $HUNT staked at exact block of Treasure discovery
2. Has placed ≥1 bet of ≥$0.10 USDC since previous discovery

```solidity
mapping(address => uint256) public lastBetEpoch;
uint256 public qualifiedStakeTotal;

function recordBet(address participant) external onlyTreasureEngine {
    // If first qualifying bet this epoch, add to qualified total
    if (lastBetEpoch[participant] != epochId && stakedBalance[participant] > 0) {
        qualifiedStakeTotal += stakedBalance[participant];
    }
    lastBetEpoch[participant] = epochId;
}

function isQualified(address participant) public view returns (bool) {
    return stakedBalance[participant] > 0 && lastBetEpoch[participant] == epochId;
}

// Called at epoch transition (on discovery)
function _resetQualifications() internal {
    qualifiedStakeTotal = 0;
    // lastBetEpoch remains - only current epoch matters
}
```

### 10.4 Pro-Rata Distribution (Pull Pattern — O(1) Claims)

**No iteration. Uses reward accumulator pattern (like Synthetix staking).**

```solidity
// Global accumulators
uint256 public rewardPerTokenStored;        // USDC rewards
uint256 public mapRewardPerTokenStored;     // MAP rewards

// Per-user tracking
mapping(address => uint256) public userRewardPerTokenPaid;
mapping(address => uint256) public userMapRewardPerTokenPaid;
mapping(address => uint256) public rewardsOwed;
mapping(address => uint256) public mapRewardsOwed;

function distributeUsdcRewards(uint256 totalReward) external onlyTreasureEngine {
    require(qualifiedStakeTotal > 0, "No qualified stakers");

    // Increment global accumulator
    rewardPerTokenStored += (totalReward * WAD) / qualifiedStakeTotal;

    emit RewardsDistributed(totalReward, epochId);
}

function distributeMapRewards(uint256 totalMapReward) external onlyTreasureEngine {
    require(qualifiedStakeTotal > 0, "No qualified stakers");

    mapRewardPerTokenStored += (totalMapReward * WAD) / qualifiedStakeTotal;

    emit MapRewardsDistributed(totalMapReward, epochId);
}

// Called by staker to claim - O(1) regardless of staker count
function claimRewards() external nonReentrant {
    _updateRewards(msg.sender);

    uint256 usdcReward = rewardsOwed[msg.sender];
    uint256 mapReward = mapRewardsOwed[msg.sender];

    if (usdcReward > 0) {
        rewardsOwed[msg.sender] = 0;
        usdc.transfer(msg.sender, usdcReward);
    }

    if (mapReward > 0) {
        mapRewardsOwed[msg.sender] = 0;
        mapToken.transfer(msg.sender, mapReward);
    }

    emit RewardsClaimed(msg.sender, usdcReward, mapReward);
}

function _updateRewards(address account) internal {
    // Only credit rewards if staker was qualified
    if (isQualified(account)) {
        uint256 usdcEarned = (stakedBalance[account] *
            (rewardPerTokenStored - userRewardPerTokenPaid[account])) / WAD;
        uint256 mapEarned = (stakedBalance[account] *
            (mapRewardPerTokenStored - userMapRewardPerTokenPaid[account])) / WAD;

        rewardsOwed[account] += usdcEarned;
        mapRewardsOwed[account] += mapEarned;
    }

    userRewardPerTokenPaid[account] = rewardPerTokenStored;
    userMapRewardPerTokenPaid[account] = mapRewardPerTokenStored;
}
```

**Key Properties:**
- **O(1) complexity**: No iteration over stakers
- **Gas-safe**: Works at any scale
- **Anti-griefing**: Dust staking doesn't affect gas
- **Qualification-gated**: Only qualified stakers earn rewards

---

## 11. $MAP Bonding Curve

### 11.1 Price Function

```
p(S) = p₀ × e^(k × S)
```

**Constants:**
- `p₀ = 0.01 USDC` (starting price)
- `k = 9.210340371976183 × 10⁻⁸` per MAP

### 11.2 Fixed-Point Constants (18 decimals)

```solidity
uint256 constant P0_WAD = 10_000_000_000_000_000;     // 0.01 * 1e18
uint256 constant K_WAD = 92_103_403_719;              // k * 1e18
```

### 11.3 Cost to Buy (Mint)

```
cost(S, ΔS) = (p₀ / k) × (e^(k × (S + ΔS)) - e^(k × S))
```

### 11.4 Proceeds to Sell (Burn)

```
proceeds(S, ΔS) = (p₀ / k) × (e^(k × S) - e^(k × (S - ΔS)))
```

### 11.5 Price Milestones

| Supply (S) | Spot Price |
|------------|------------|
| 0 | $0.0100 |
| 1,000,000 | $0.0110 |
| 5,000,000 | $0.0158 |
| 10,000,000 | $0.0251 |
| 20,000,000 | $0.0631 |
| 50,000,000 | $1.00 |
| 80,000,000 | $15.85 |
| 100,000,000 | $100.00 |

### 11.6 Implementation Notes

1. Use PRBMath or similar for fixed-point exponential
2. Scale S appropriately (S_tokens = S_wad / 1e18)
3. Handle USDC (6 decimals) vs MAP (18 decimals) conversion

### 11.7 Transaction Caps (LOCKED)

```solidity
uint256 constant MAX_MAP_BUY_USDC = 50_000e6;  // $50,000 per tx
uint256 constant MAX_MAP_SELL_BPS = 100;        // 1% of total MAP supply per tx
uint256 constant BPS_DENOMINATOR = 10_000;
```

| Limit | Value | Rationale |
|-------|-------|-----------|
| **Buy Cap** | $50,000 USDC/tx | Prevents gas blowups, precision edge cases, MEV stress |
| **Sell Cap** | 1% of supply/tx | Prevents sudden curve collapse, pathological gas paths |

> **Note**: These limits do not affect long-term access, only per-transaction execution. Large positions can be built/unwound across multiple transactions.

---

## 12. Emission Schedule

### 12.1 Cap

```solidity
uint256 constant E_CAP = 300_000_000 * 1e18; // 300M HUNT (30% of supply)
```

### 12.2 Phase 1: Bootstrap (N0 < 100,000)

```
r = 1.00 HUNT per 1.00 USDC contribution
```

### 12.3 Phase 2: Decay (N0 ≥ 100,000)

```
r(N0) = r_min + (r₀ - r_min) × e^(-λ × (N0 - 100,000))
```

**Constants:**
- `r₀ = 1.00`
- `r_min = 0.02`
- `λ = 4.0 × 10⁻⁵` per 0x outcome

### 12.4 Decay Milestones

| N0 | Emission Rate (r) |
|----|-------------------|
| 100,000 | 1.000 |
| 150,000 | ~0.150 |
| 200,000 | ~0.038 |
| 250,000 | ~0.024 |
| 300,000+ | ~0.020 (asymptotic) |

### 12.5 Mint Calculation

```solidity
function _calculateEmission(uint256 L) internal view returns (uint256) {
    uint256 rate = _getEmissionRate();
    uint256 rawMint = L * rate / WAD; // Scale appropriately

    // Cap at remaining allocation
    uint256 remaining = E_CAP - E_minted;
    return rawMint > remaining ? remaining : rawMint;
}

function _getEmissionRate() internal view returns (uint256) {
    if (N0 < 100_000) {
        return 1 * WAD; // 1.0 in WAD
    }

    uint256 decay = N0 - 100_000;
    // r(N0) = 0.02 + 0.98 × e^(-0.00004 × decay)
    uint256 expTerm = _exp(-int256(LAMBDA * decay));
    return R_MIN + (R_0 - R_MIN) * expTerm / WAD;
}
```

---

## 13. Airdrop System

### 13.1 Parameters

| Parameter | Value |
|-----------|-------|
| Total Allocation | 200,000,000 HUNT (20%) |
| Claim Window | 90 days from genesis |
| Merkle Root | Set by Cartographer before deploy |
| Post-Expiry | Unclaimed tokens burned |

### 13.2 Claim Function

```solidity
function claim(uint256 amount, bytes32[] calldata proof) external {
    require(!hasClaimed[msg.sender], "Already claimed");
    require(block.timestamp <= claimDeadline, "Claim window closed");

    bytes32 leaf = keccak256(abi.encodePacked(msg.sender, amount));
    require(MerkleProof.verify(proof, merkleRoot, leaf), "Invalid proof");

    hasClaimed[msg.sender] = true;
    huntToken.transfer(msg.sender, amount);

    emit Claimed(msg.sender, amount);
}
```

### 13.3 Burn Unclaimed

```solidity
function burnUnclaimed() external {
    require(block.timestamp > claimDeadline, "Window not closed");
    require(!burned, "Already burned");

    burned = true;
    uint256 remaining = huntToken.balanceOf(address(this));
    huntToken.burn(remaining);

    emit UnclaimedBurned(remaining);
}
```

---

## 14. Community Pool

### 14.1 Constraints

- **Holder**: 25% of HUNT supply (250M)
- **Controller**: Cartographer (fixed at deploy)
- **Allowed Actions**: Transfer HUNT only
- **Prohibited Actions**: Sell HUNT for USDC, interact with other tokens

### 14.2 Implementation

```solidity
contract CommunityPool {
    IERC20 public immutable huntToken;
    address public immutable cartographer;

    constructor(address _huntToken, address _cartographer) {
        huntToken = IERC20(_huntToken);
        cartographer = _cartographer;
    }

    function distribute(address to, uint256 amount) external {
        require(msg.sender == cartographer, "Only Cartographer");
        require(huntToken.transfer(to, amount), "Transfer failed");

        emit Distributed(to, amount);
    }

    function balance() external view returns (uint256) {
        return huntToken.balanceOf(address(this));
    }
}
```

---

## 15. Vesting

### 15.1 Cartographer Vesting

| Parameter | Value |
|-----------|-------|
| Total Amount | 100,000,000 HUNT (10%) |
| Duration | 4 years |
| Cliff | None |
| Schedule | Linear |
| Beneficiary | Cartographer (fixed) |

### 15.2 Implementation

```solidity
contract CartographerVesting {
    IERC20 public immutable huntToken;
    address public immutable beneficiary;
    uint256 public immutable startTime;
    uint256 public immutable vestingDuration;
    uint256 public immutable totalVested;
    uint256 public released;

    constructor(
        address _huntToken,
        address _beneficiary,
        uint256 _totalVested
    ) {
        huntToken = IERC20(_huntToken);
        beneficiary = _beneficiary;
        startTime = block.timestamp;
        vestingDuration = 4 * 365 days;
        totalVested = _totalVested;
    }

    function vestedAmount() public view returns (uint256) {
        if (block.timestamp < startTime) return 0;
        if (block.timestamp >= startTime + vestingDuration) return totalVested;
        return totalVested * (block.timestamp - startTime) / vestingDuration;
    }

    function releasable() public view returns (uint256) {
        return vestedAmount() - released;
    }

    function release() external {
        uint256 amount = releasable();
        require(amount > 0, "Nothing to release");

        released += amount;
        huntToken.transfer(beneficiary, amount);

        emit Released(amount);
    }
}
```

---

## 16. Randomness

### 16.1 Provider

Chainlink VRF v2.5 on Base

### 16.2 Configuration (LOCKED)

```solidity
address constant VRF_COORDINATOR = TBD;        // Base VRF Coordinator
bytes32 constant KEY_HASH = TBD;               // Standard/Fast lane (NOT cheapest)
uint64 constant SUBSCRIPTION_ID = TBD;         // VRF subscription
uint16 constant REQUEST_CONFIRMATIONS = 3;     // LOCKED
uint32 constant CALLBACK_GAS_LIMIT = 500_000;  // LOCKED — supports cascade + routing
uint32 constant NUM_WORDS = 1;
```

> **Why 500k gas**: VRF callback is heavy — handles outcome resolution, contribution routing, multiple external calls (MAP curve, DEX, staking, burns), and possible treasure discovery with cascading. Cheap lanes risk callback failure, which is catastrophic UX.

### 16.3 Request/Fulfill Pattern

```solidity
function placeBet(uint256 amount) external returns (uint256 requestId) {
    // ... validation ...

    requestId = vrfCoordinator.requestRandomWords(
        KEY_HASH,
        SUBSCRIPTION_ID,
        REQUEST_CONFIRMATIONS,
        CALLBACK_GAS_LIMIT,
        NUM_WORDS
    );

    pendingBets[requestId] = Bet({
        bettor: msg.sender,
        amount: amount,
        timestamp: block.timestamp
    });
}

function fulfillRandomWords(
    uint256 requestId,
    uint256[] memory randomWords
) internal override {
    Bet memory bet = pendingBets[requestId];
    require(bet.bettor != address(0), "Unknown request");

    uint256 outcomeIndex = randomWords[0] % 10000;
    // ... resolve bet ...
}
```

### 16.4 Randomness Model (CANONICAL)

Each exploration consumes exactly **one** verifiable random value from Chainlink VRF. This value is deterministically partitioned to resolve both the exploration outcome and the Treasure discovery check. No additional randomness sources are used.

**Single VRF Request Per Exploration:**

```solidity
uint256 R = randomWords[0];

// 1. Outcome Resolution (Flip)
uint256 outcomeIndex = R % 10_000;
// Maps into immutable Outcome Table (Table C) → multiplier (0x → 10x)

// 2. Treasure Discovery Check (same R, different slice)
// Only evaluated on 0x outcomes, after contribution routing:
uint256 discoveryRoll = (R / 10_000) % M;
// Hit-the-interval: if discoveryRoll ∈ (J_prev, J_new] → Treasure discovered
// Forced discovery: if J_new >= M → guaranteed discovery
```

**What This Preserves:**
- Statistical independence between outcome and discovery
- Atomicity (single callback)
- Gas efficiency
- Audit simplicity

**What Is NOT Allowed:**

| ❌ Prohibited | Reason |
|---------------|--------|
| Pseudo-randomness (blockhash, timestamps) | Manipulable by miners/sequencers |
| Separate VRF call for discovery | Unnecessary cost, complexity |
| Off-chain randomness | Violates verifiability |
| Rerolls | Breaks determinism |

### 16.5 Security Properties

- Randomness unknown at bet commit time
- Deterministically derived at settlement
- Prevents: trigger prediction, bet sizing exploits, searcher manipulation

### 16.6 VRF Timeout Refund

If VRF callback fails to arrive within `VRF_TIMEOUT` (1 hour), bettors can reclaim their USDC.

```solidity
function refundExpiredBet(uint256 requestId) external {
    Bet storage bet = pendingBets[requestId];
    require(bet.bettor != address(0), "Unknown request");
    require(!bet.fulfilled, "Already fulfilled");
    require(!bet.refunded, "Already refunded");
    require(block.timestamp >= bet.timestamp + VRF_TIMEOUT, "Timeout not reached");

    bet.refunded = true;
    usdc.transfer(bet.bettor, bet.amount);

    emit BetRefunded(requestId, bet.bettor, bet.amount);
}
```

**Key Properties:**
- Anyone can call (keeper-friendly)
- Only triggers if VRF hasn't fulfilled
- Full refund to original bettor
- Prevents permanently stuck funds

---

## 17. Edge Cases

### 17.1 First Bet of Expedition

- `J = 0`, first contribution is `Δ`
- Discovery possible if `R ∈ (0, Δ]`
- Probability = `Δ / M`

### 17.2 Bet Exactly at M

- If `J + Δ >= M`, forced discovery
- `P = M` (full Treasure)
- Expedition resets with doubled M

### 17.3 Zero Qualified Stakers

- 40% staker share redistributed:
  - 20% → Buy & burn HUNT
  - 20% → Community Pool
- All other distributions unchanged

### 17.4 HUNT Emissions Exhausted

- No more HUNT minted from gameplay
- All other mechanics continue unchanged
- System becomes "mature" — HUNT is fixed supply, deflationary

### 17.5 MAP Bonding Curve at High Supply

- Price grows exponentially
- Large purchases may hit gas limits
- Implement max tx size limits

### 17.6 Cascading Discoveries

- Limited to MAX_CASCADE iterations
- Prevents gas exhaustion
- Excess overflow remains in J

### 17.7 VRF Callback Failure

- Bet remains pending for up to `VRF_TIMEOUT` (1 hour)
- After timeout: anyone can call `refundExpiredBet(requestId)`
- Full USDC returned to bettor
- Bet marked as refunded (prevents double-settlement)
- No admin intervention required

### 17.8 Cascade Cap Reached (LOCKED)

```solidity
uint256 constant MAX_CASCADE = 5;  // LOCKED — prevents gas exhaustion
```

- If more than `MAX_CASCADE` discoveries would occur in single tx
- Stop after 5 iterations
- Remaining overflow stays in J
- Emit `CascadeCapped(epochId, remainingJ, M)` for visibility
- Next bets continue naturally from this state

> **Invariant**: Cascading discovery is capped at MAX_CASCADE iterations. Overflow beyond this limit remains in the Treasure Chest.

### 17.9 freeUSDC Depletion (Liquidity Crisis)

**Scenario**: `freeUSDC < payout` for a winning bet

**Behavior**:
- Transaction **reverts**
- No state changes occur
- Player retains their original USDC (bet never processed)
- System remains solvent

**Why this is acceptable**:
- Reverts are standard DeFi behavior
- Player is not harmed (no loss)
- Capping payouts would break EV math
- Partial payouts introduce griefing vectors

**Why this is rare**:
- `maxBet = 1% of M` limits exposure
- `maxMultiplier = 10×` is bounded
- `freeUSDC` is continuously replenished by:
  - Partial losses (0.5×, 1× outcomes)
  - Full losses before routing to Treasure
- Reverts occur only in pathological early-stage scenarios

### 17.10 System Bootstrap (Cold Start)

**Initial State**:
- `J = 0` (empty Treasure)
- `freeUSDC = 0` (no liquidity)
- No external seed capital required

**First Exploration Behavior**:
- Player bets `B` USDC
- `B` enters `totalUSDC`, making `freeUSDC = B`
- **If 0× outcome**: `J` is seeded with `B × 0.50`
- **If non-0× outcome**: Payout succeeds because bet itself funded `freeUSDC`

**Example (First Bet = 1 USDC, Outcome = 0.5×)**:
1. 1 USDC enters contract → `totalUSDC = 1`, `freeUSDC = 1`
2. Payout = 0.5 USDC from `freeUSDC`
3. Result: `totalUSDC = 0.5`, `freeUSDC = 0.5`, `J = 0`

**Example (First Bet = 1 USDC, Outcome = 0×)**:
1. 1 USDC enters contract → `totalUSDC = 1`, `freeUSDC = 1`
2. 50% → `J`: `J = 0.5`, `freeUSDC = 0.5`
3. 50% → Routing (from `freeUSDC`)
4. Result: `J = 0.5`, system seeded

---

## 18. Security Requirements

### 18.1 Audit Checklist

- [ ] Reentrancy protection on all external calls
- [ ] Integer overflow checks (Solidity 0.8.x)
- [ ] Proper decimal handling (USDC 6 vs tokens 18)
- [ ] VRF callback validation
- [ ] Bonding curve math precision
- [ ] State consistency during discovery
- [ ] Merkle proof verification
- [ ] Access control verification

### 18.2 Invariants

**Token Invariants:**
1. `sum(all HUNT balances) + burned = 1,000,000,000 × 10^18`
2. `E_minted <= E_CAP`
3. Staked balance tracks actual HUNT holdings

**Treasure Invariants:**
4. `J <= M` at all times
5. `J <= usdc.balanceOf(TreasureEngine)` at all times

**Solvency Invariants (CRITICAL — Must Be Included Verbatim):**
6. **Exploration payouts MUST NOT reduce `J`** — multipliers paid from `freeUSDC` only
7. **Treasure payouts MUST NOT use `freeUSDC`** — discoveries paid from `J` only
8. **No USDC minting occurs anywhere in the system**
9. **All payouts MUST be fully funded at execution time or the transaction reverts**

**System Invariants:**
10. No admin functions exist post-deploy
11. No pause mechanism exists
12. All state transitions are deterministic given VRF input

### 18.3 External Dependencies

| Dependency | Risk | Mitigation |
|------------|------|------------|
| USDC | Blacklist risk | Accept as inherent to stablecoin |
| Chainlink VRF | Liveness | System waits for callback |
| Aerodrome | Liquidity | Slippage tolerance, fallback |

---

## 19. Session Key Architecture

### 19.1 Overview

Treasure Hunt uses ERC-4337 smart accounts with session keys. Users have no accounts beyond their wallet. Every exploration settles on-chain, but players authorize temporary, restricted session keys so multiple explorations can occur without repeated wallet prompts.

### 19.2 Initial Wallet Connection

1. User connects a wallet as usual (EOA or existing smart account)
2. If user does not already have a smart account:
   - One is deployed automatically (standard ERC-4337 flow)

### 19.3 Session Authorization

Before exploring, the user signs **one** authorization that creates a temporary session key.

**Session Key Constraints:**

| Constraint | Example Value |
|------------|---------------|
| Allowed Contract | `TreasureEngine` |
| Allowed Function | `placeBet(uint256 amount)` |
| Max USDC Spend | $20 |
| Expiry Time | 30 minutes or 1 expedition |
| Max Explorations | Optional (e.g., 50) |

**This signature:**
- Does NOT transfer funds
- Does NOT create custody
- Can be revoked by expiry only

### 19.4 Exploration During Session

While the session is active:
- The frontend submits `placeBet` calls
- Calls are signed by the session key
- Bundled via ERC-4337 UserOperations
- Settled fully on-chain

**No wallet popup per exploration.**

From the player's perspective: *"I explore again."*
From the chain's perspective: *"Another valid on-chain transaction."*

### 19.5 Session Expiry

The session automatically expires when:
- Time runs out, OR
- Spend limit is reached, OR
- Expedition ends

At expiry:
- Further actions require a new session signature
- No lingering permissions exist

### 19.6 Security Properties

| Property | Guarantee |
|----------|-----------|
| No backend custody | Session keys are user-controlled |
| No private key exposure | Session key is scoped and ephemeral |
| No ability to drain wallet | Hard spend limits enforced |
| No off-chain randomness | All VRF on-chain |
| No off-chain settlement | All bets resolve on-chain |
| Full auditability | Every exploration is a chain tx |

**This architecture is strictly safer than repeated EOA signing.**

### 19.7 Implementation Notes

- Session key validation handled by ERC-4337 account module
- Bundler submits UserOperations on behalf of session key
- TreasureEngine is unaware of session keys — it sees valid signatures
- No changes to core contract logic required

---

## 20. UX Guidelines

### 20.1 Terminology Mapping

**NEVER expose in UI:**

| Internal Term | User-Facing Term |
|---------------|------------------|
| ERC-4337 | *(never mention)* |
| Session keys | *(never mention)* |
| UserOperations | *(never mention)* |
| Transactions | *(never mention)* |
| Bet / Wager | Explore / Contribution |
| House edge | *(never use)* |
| Win / Loss | Discovery / Setback |
| Jackpot | Treasure |

**USE instead:**

| Action | User-Facing Copy |
|--------|------------------|
| Session creation | "Authorize this expedition" |
| Session active | "Supplies prepared for exploration" |
| Multiple bets | "You may explore multiple times without interruption" |

**Internals stay internal.**

### 20.2 Pool Separation (Copywriting Rule)

**CRITICAL**: UI copy must NEVER imply that Treasure discoveries and exploration payouts draw from the same pool.

| ❌ Avoid | ✅ Use Instead |
|----------|----------------|
| "Win from the prize pool" | "Discover the Treasure" (for discoveries) |
| "Jackpot funds your rewards" | "Your exploration yields rewards" (for multipliers) |
| "Pool pays out" | Be specific: "Treasure discovered" OR "Exploration reward" |

**Why this matters:**
- Treasure (`J`) is reserved and sacrosanct
- Exploration payouts come from `freeUSDC` (unreserved liquidity)
- Conflating them in copy creates false expectations and audit concerns
- Users don't need to know the internal accounting, but copy must not contradict it

### 20.3 $MAP Purchase Clarification

**This is non-negotiable and must be clear everywhere:**

> **All $MAP purchases are paid with USDC. Always.**

**Details:**
- $MAP is minted/burned exclusively via its bonding curve
- The bonding curve **only accepts USDC**
- No HUNT → MAP swaps
- No MAP minted "for free"
- No implicit conversion

**All MAP flows originate from:**
1. USDC routed from 0x outcomes (Section 7.2)
2. USDC allocated during Treasure distribution (Section 9)
3. Optional direct user purchases (secondary UI)

**This preserves:**
- Clean accounting
- Clear economic separation
- Audit simplicity

### 20.4 Explicit Anti-Patterns

**DO NOT IMPLEMENT:**

| Anti-Pattern | Reason |
|--------------|--------|
| ❌ Off-chain explorations with later settlement | Violates on-chain settlement guarantee |
| ❌ Custodial "game balances" | No custody permitted |
| ❌ Web2 user accounts | Wallet is the only identity |
| ❌ Backend-held signing keys | Session keys are user-controlled |
| ❌ Mixing MAP purchases with HUNT or exploration | MAP is USDC-only |
| ❌ Deferred randomness | VRF must resolve before outcome |
| ❌ Batched settlement | Each bet settles independently |

### 20.5 Canonical Summary

Treasure Hunt uses ERC-4337 smart accounts with session keys. Users have no accounts beyond their wallet. Every exploration settles on-chain, but players authorize temporary, restricted session keys so multiple explorations can occur without repeated wallet prompts. All $MAP purchases are paid in USDC via a true bonding curve, completely separate from $HUNT mechanics. No off-chain batching, custody, or deferred settlement is permitted.

---

## 21. Yield Pool Construction (Optional)

### 21.1 Overview

The protocol MAY deploy excess unreserved USDC into external interest-bearing venues. This is **optional upside** and is **not required for solvency**.

### 21.2 Definitions

```solidity
// Core accounting
uint256 totalUSDC = usdc.balanceOf(address(this));
uint256 freeUSDC = totalUSDC - J;

// Yield pool construction
uint256 maxBet = M * MAX_BET_BPS / BPS_DENOMINATOR;  // 1% of M
uint256 maxPayout = maxBet * 10;                      // 10× multiplier
uint256 safetyFactor = 2;                             // Conservative buffer
uint256 requiredLiquidity = maxPayout * safetyFactor;
uint256 excessUSDC = freeUSDC > requiredLiquidity ? freeUSDC - requiredLiquidity : 0;
```

### 21.3 Yield Rules (Strict)

| Rule | Description |
|------|-------------|
| **Only `excessUSDC` may be deployed** | Never deploy `J` or required liquidity |
| **`J` is NEVER yield-bearing** | Reserved Treasure funds are sacrosanct |
| **Capped deployment** | e.g., ≤30% of `totalUSDC` |
| **Instant withdrawability** | Must be able to recall funds immediately |
| **Auto-recall trigger** | If `freeUSDC` approaches `requiredLiquidity`, deployed funds MUST be recalled |
| **Yield is not counted toward freeUSDC** | Yield is pure upside, not solvency |

> **Critical Safety Rule**: Yield-deployed USDC MUST be instantly recallable (or recalled automatically) if `freeUSDC` approaches the required liquidity buffer. This prevents timing attacks, stuck liquidity scenarios, and audit pushback.

### 21.4 Canonical PRD Language

> The protocol MAY deploy excess unreserved USDC into external interest-bearing venues. Excess USDC is defined as `freeUSDC` minus a conservative liquidity buffer sufficient to cover maximum exploration payouts. Reserved Treasure funds (`J`) are never yield-bearing. Yield is treated as optional upside and is not required for solvency.

### 21.5 Implementation Notes

- Yield venue must be audited and battle-tested
- Withdrawal latency must be zero or near-zero
- Yield accrues to the protocol (not individual players)
- Any implementation that relies on yield for solvency is **incorrect**

---

## 22. Deployment Checklist

### 22.1 Pre-Deploy

- [ ] Merkle root computed and verified
- [ ] Cartographer address finalized
- [ ] Map Maker address finalized
- [ ] Liquidity address finalized
- [ ] VRF subscription funded with LINK
- [ ] All constants verified

### 22.2 Deploy Sequence

1. Deploy HuntToken
2. Deploy MapToken
3. Deploy HuntStaking
4. Deploy CommunityPool
5. Deploy AirdropClaim (with merkle root)
6. Deploy CartographerVesting
7. Deploy TreasureEngine (with all references)
8. Transfer allocations:
   - 300M HUNT emissions pool → TreasureEngine
   - 250M HUNT → CommunityPool
   - 200M HUNT → AirdropClaim
   - 100M HUNT → Cartographer (genesis)
   - 100M HUNT → CartographerVesting
   - 50M HUNT → Liquidity address
9. Verify all contracts on Basescan
10. Verify cross-references

### 22.3 Post-Deploy Verification

- [ ] All contract addresses recorded
- [ ] HUNT total supply = 1B
- [ ] Allocations match specification
- [ ] VRF subscription active
- [ ] First bet successfully placed and resolved
- [ ] Bonding curve buy/sell working

---

## 24. Glossary

| Term | Definition |
|------|------------|
| Treasure | The accumulated USDC prize pool to be discovered |
| Discovery | The event when Treasure is found and distributed |
| Contribution | The bet amount routed to system on 0x outcome |
| Expedition | A single cycle from one discovery to the next |
| Epoch | Synonym for expedition; incrementing identifier |
| M | Maximum Map Size — upper bound for Treasure |
| J | Current Treasure balance (reserved USDC, sacrosanct) |
| totalUSDC | All USDC held by TreasureEngine: `usdc.balanceOf(address(this))` |
| freeUSDC | Unreserved liquidity: `totalUSDC - J`. Funds all non-Treasure payouts |
| excessUSDC | Yield-eligible funds: `freeUSDC - requiredLiquidity` |
| requiredLiquidity | Minimum buffer for payouts: `maxBet × maxMultiplier × safetyFactor` |
| Qualified | Staker who has placed a bet in current expedition |
| Cartographer | Human steward of the system |
| Map Maker | AI agent guide |
| N0 | Cumulative count of 0x outcomes |
| E_minted | Cumulative HUNT minted from gameplay |
| E_cap | Maximum HUNT mintable from gameplay (300M) |
| Session Key | Temporary, scoped authorization for frictionless exploration |
| Smart Account | ERC-4337 account enabling session key functionality |
| UserOperation | ERC-4337 bundled transaction (internal term — never user-facing) |
| Bonding Curve | Price function for $MAP: p(S) = p₀ × e^(k×S) |

---

*End of PRD*

*Document Version: 1.2*
*Status: LOCKED — All Parameters Finalized*
