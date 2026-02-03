# Treasure Hunt: State Machine Specifications
## Version 1.0 — Complete System States

---

## Overview

Treasure Hunt has **7 interconnected state machines**:

1. **System State** — Global system lifecycle
2. **Expedition State** — Repeating expedition cycles
3. **Bet State** — Individual bet resolution
4. **Stake State** — Participant staking lifecycle
5. **Emission State** — $HUNT gameplay emissions
6. **Airdrop State** — Claim window lifecycle
7. **Session State** — Session key authorization lifecycle (ERC-4337)

---

## 1. System State Machine

The top-level system state. Once deployed, the system runs autonomously forever.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SYSTEM STATE MACHINE                        │
└─────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │   UNDEPLOYED │
    └──────┬───────┘
           │ deploy()
           ▼
    ┌──────────────┐
    │    ACTIVE    │◄─────────────────────────────────────┐
    │              │                                       │
    │  • Accepts   │                                       │
    │    bets      │                                       │
    │  • Processes │                                       │
    │    outcomes  │                                       │
    │  • Discovers │                                       │
    │    Treasures │                                       │
    └──────────────┘                                       │
           │                                               │
           │ (no exit — runs forever)                      │
           │                                               │
           └───────────────────────────────────────────────┘

States:
  • UNDEPLOYED: Contracts not yet on chain
  • ACTIVE: System operational, no shutdown possible

Transitions:
  • deploy() → ACTIVE (one-way, irreversible)

Invariants:
  • Once ACTIVE, system cannot be paused, stopped, or upgraded
  • No admin functions exist
```

---

## 2. Expedition State Machine

Each expedition begins immediately after a Treasure discovery and ends at the next discovery.

```
┌─────────────────────────────────────────────────────────────────────┐
│                       EXPEDITION STATE MACHINE                       │
└─────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────────┐
                              │                     │
                              ▼                     │
    ┌──────────────┐     ┌──────────────┐          │
    │   GENESIS    │────►│   ACTIVE     │──────────┤
    │  (epoch 0)   │     │              │          │
    └──────────────┘     │ J accumulates│          │
                         │ M is fixed   │          │
                         │ Bets placed  │          │
                         └──────┬───────┘          │
                                │                  │
                                │ Discovery!       │
                                ▼                  │
                         ┌──────────────┐          │
                         │  DISCOVERED  │          │
                         │              │          │
                         │ Distribute P │          │
                         │ Reset J to O │          │
                         │ Double M     │          │
                         │ Increment    │          │
                         │   epochId    │          │
                         └──────┬───────┘          │
                                │                  │
                                │ (atomic)         │
                                └──────────────────┘

States:
  • GENESIS: Initial state (epoch 0, M = $100)
  • ACTIVE: Expedition in progress, accepting bets
  • DISCOVERED: Treasure found (transient, atomic transition)

State Variables:
  • J: Current Treasure balance (USDC)
  • M: Maximum Map Size (USDC)
  • epochId: Current expedition number

Transitions:
  • GENESIS → ACTIVE: On deploy (M = 100 USDC, J = 0, epochId = 0)
  • ACTIVE → DISCOVERED: When discovery condition met
  • DISCOVERED → ACTIVE: Immediate (within same transaction)

Discovery Condition:
  Given J_prev (Treasure before), Δ (contribution amount):
  1. J_new = min(J_prev + Δ, M)
  2. Sample R ∈ [0, M] using VRF
  3. Discovery if R ∈ (J_prev, J_new]
  4. Forced discovery if J_new >= M

On Discovery:
  1. P = min(J_prev + Δ, M)  // Payout amount
  2. Distribute P per rules
  3. O = (J_prev + Δ) - P     // Overflow
  4. J := O                   // Reset
  5. M := 2M                  // Double
  6. epochId++                // New expedition
```

---

## 3. Bet State Machine

Individual bet lifecycle from placement to resolution.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          BET STATE MACHINE                           │
└─────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │    NONE      │
    │  (no bet)    │
    └──────┬───────┘
           │ placeBet(amount)
           │ validate:
           │   • amount >= $0.10 USDC
           │   • amount <= 0.01 * M
           │   • USDC approved
           │
           ▼
    ┌──────────────┐
    │   PENDING    │
    │              │
    │ USDC locked  │
    │ VRF requested│
    │ requestId    │
    │ timestamp    │
    │   stored     │
    └──────┬───────┘
           │
           ├─── (VRF_TIMEOUT exceeded, no fulfill) ──────┐
           │                                              │
           │ VRF fulfillRandomWords(requestId, randomWords) │
           │                                              ▼
           │                                      ┌──────────────┐
           │                                      │   REFUNDED   │
           │                                      │              │
           │                                      │ USDC returned│
           │                                      │ to bettor    │
           │                                      │ (via         │
           │                                      │ refundExpired│
           │                                      │ Bet())       │
           │                                      └──────────────┘
           │
           ▼
    ┌──────────────────────────────────────────────────────────┐
    │                    RESOLVE OUTCOME                        │
    │                                                           │
    │  randomWord % 10000 → outcome index (Table C)            │
    │                                                           │
    │  ┌─────────────────────────────────────────────────────┐ │
    │  │ Index Range │ Outcome │ Multiplier │ Probability    │ │
    │  ├─────────────┼─────────┼────────────┼────────────────┤ │
    │  │ 0-3999      │ 0x      │ 0.0        │ 40%            │ │
    │  │ 4000-6199   │ 0.5x    │ 0.5        │ 22%            │ │
    │  │ 6200-7999   │ 1x      │ 1.0        │ 18%            │ │
    │  │ 8000-8999   │ 1.5x    │ 1.5        │ 10%            │ │
    │  │ 9000-9599   │ 2x      │ 2.0        │ 6%             │ │
    │  │ 9600-9899   │ 4x      │ 4.0        │ 3%             │ │
    │  │ 9900-9999   │ 10x     │ 10.0       │ 1%             │ │
    │  └─────────────────────────────────────────────────────┘ │
    └──────────────────────────┬───────────────────────────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
    │   0x OUTCOME │   │ PARTIAL (0.5x│   │  WIN (>1x)   │
    │              │   │   or 1x)     │   │              │
    │ L = amount   │   │              │   │ payout =     │
    │ Contribution │   │ payout =     │   │ amount *     │
    │   routed     │   │ amount *     │   │ multiplier   │
    │ HUNT minted  │   │ multiplier   │   │              │
    │ Discovery?   │   │              │   │ USDC sent    │
    └──────────────┘   │ USDC sent    │   │ to bettor    │
                       └──────────────┘   └──────────────┘

Validation Rules:
  • amount >= 100_000 ($0.10 USDC, 6 decimals)
  • amount <= M / 100 (1% of current Max Map Size)
  • msg.sender has approved USDC to TreasureEngine

On 0x Outcome:
  1. L = bet amount (full contribution)
  2. Route contribution (see Contribution Routing below)
  3. Mint HUNT to bettor per emission schedule
  4. Record bet for staking qualification
  5. Check discovery condition
  6. If discovery: trigger distribution

On Partial/Win:
  1. Transfer payout USDC to bettor
  2. Record bet for staking qualification
  3. No contribution routing
  4. No HUNT minting
```

---

## 4. Contribution Routing State Machine

What happens to a 0x outcome contribution.

```
┌─────────────────────────────────────────────────────────────────────┐
│                   CONTRIBUTION ROUTING STATE MACHINE                 │
└─────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────┐
                    │   0x OUTCOME        │
                    │   L = bet amount    │
                    └──────────┬──────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
            ▼                  ▼                  │
    ┌──────────────┐                             │
    │  TO TREASURE │   ┌─────────────────────────┴────────────────┐
    │    50% of L  │   │           TO VALUE ROUTING               │
    │              │   │              50% of L                    │
    │  J += 0.5*L  │   │                                          │
    └──────────────┘   │  Split as follows:                       │
                       │                                          │
                       │  ┌─────────────────────────────────────┐ │
                       │  │ 19% of L → Buy MAP → Staker Rewards │ │
                       │  │ 0.75% of L → Buy MAP → Cartographer │ │
                       │  │ 0.25% of L → Buy MAP → Map Maker    │ │
                       │  │ 20% of L → Buy MAP → Burn           │ │
                       │  │ 10% of L → Buy HUNT → Community Pool│ │
                       │  └─────────────────────────────────────┘ │
                       └──────────────────────────────────────────┘

Implementation Notes:
  • All MAP purchases use bonding curve atomically
  • MAP distribution to stakers: pro-rata by staked balance
  • HUNT purchase: market buy (requires external liquidity)
  • If HUNT liquidity insufficient: queue for later execution

Example: $100 USDC 0x outcome
  • $50 → Treasure
  • $19 → Buy MAP → distribute to stakers
  • $0.75 → Buy MAP → Cartographer
  • $0.25 → Buy MAP → Map Maker
  • $20 → Buy MAP → burn permanently
  • $10 → Buy HUNT → Community Pool
```

---

## 5. Stake State Machine

Staking lifecycle for a participant.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         STAKE STATE MACHINE                          │
└─────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │   UNSTAKED   │◄───────────────────────────────────────┐
    │              │                                         │
    │ balance = 0  │                                         │
    └──────┬───────┘                                         │
           │                                                 │
           │ stake(amount)                                   │
           │ HUNT transferred                                │
           ▼                                                 │
    ┌──────────────┐                                         │
    │    STAKED    │◄────────────────────────┐               │
    │              │                         │               │
    │ balance > 0  │                         │               │
    │ cooldown = 0 │                         │               │
    │              │                         │               │
    │ Qualified if:│                         │               │
    │ hasQualifying│                         │               │
    │   Bet = true │                         │               │
    └──────┬───────┘                         │               │
           │                                 │               │
           │ initiateWithdraw()              │               │
           │                                 │               │
           ▼                                 │               │
    ┌──────────────┐                         │               │
    │   COOLDOWN   │                         │               │
    │              │                         │               │
    │ cooldownStart│                         │               │
    │   = now      │                         │               │
    │              │                         │               │
    │ Still staked │                         │               │
    │ Still qualif-│                         │               │
    │   iable      │                         │               │
    └──────┬───────┘                         │               │
           │                                 │               │
           │ cancelWithdraw()                │               │
           ├────────────────────────────────►┘               │
           │                                                 │
           │ (7 days pass)                                   │
           │                                                 │
           │ withdraw(amount)                                │
           │ amount == balance → UNSTAKED                    │
           │ amount < balance → STAKED                       │
           └─────────────────────────────────────────────────┘

States:
  • UNSTAKED: No HUNT staked, not eligible for rewards
  • STAKED: HUNT staked, potentially qualified
  • COOLDOWN: Withdrawal initiated, 7-day timer active

Qualification Logic (per epoch):
  • hasQualifyingBet: Set to true when participant places bet >= $0.10 USDC
  • Reset to false at start of each new expedition
  • Qualified = STAKED + hasQualifyingBet at discovery block

Important: During COOLDOWN, participant remains:
  • Staked (balance counted)
  • Qualifiable (can earn rewards if bet placed)
  • Able to cancel and return to STAKED
```

---

## 6. $HUNT Emission State Machine

Emission rate transitions based on 0x outcome count.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      EMISSION STATE MACHINE                          │
└─────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │  BOOTSTRAP   │
    │              │
    │ N0 < 100,000 │
    │              │
    │ r = 1.00     │
    │ HUNT per $1  │
    └──────┬───────┘
           │
           │ N0 reaches 100,000
           │
           ▼
    ┌──────────────┐
    │    DECAY     │
    │              │
    │ N0 >= 100,000│
    │              │
    │ r(N0) =      │
    │ 0.02 + 0.98  │
    │ × e^(-λ×    │
    │ (N0-100000)) │
    │              │
    │ λ = 4e-5     │
    └──────┬───────┘
           │
           │ E_minted reaches E_cap (300M)
           │
           ▼
    ┌──────────────┐
    │  EXHAUSTED   │
    │              │
    │ No more HUNT │
    │ minting from │
    │ gameplay     │
    │              │
    │ System       │
    │ continues    │
    │ unchanged    │
    └──────────────┘

Emission Formula:
  Phase 1 (Bootstrap): r = 1.00 HUNT per 1 USDC lost
  Phase 2 (Decay): r(N0) = 0.02 + 0.98 × e^(-0.00004 × (N0 - 100,000))

Decay Milestones:
  • N0 = 100,000 → r = 1.000
  • N0 = 150,000 → r ≈ 0.150
  • N0 = 200,000 → r ≈ 0.038
  • N0 = 250,000 → r ≈ 0.024
  • N0 = 300,000+ → r ≈ 0.020 (asymptotic)

Mint Calculation:
  mint(L) = min(L × r(N0), E_cap - E_minted)

Cap Constants:
  • E_cap = 300,000,000 HUNT (30% of 1B supply)
  • E_minted: tracks cumulative minted amount
```

---

## 7. Treasure Discovery State Machine

What happens when Treasure is discovered.

```
┌─────────────────────────────────────────────────────────────────────┐
│                   TREASURE DISCOVERY STATE MACHINE                   │
└─────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │ CONTRIBUTION │
    │   RECEIVED   │
    │              │
    │ J_prev, Δ    │
    └──────┬───────┘
           │
           │ Check: Is R ∈ (J_prev, J_new]?
           │        Or: J_new >= M?
           │
           ├─── No ──────────────────────────────────┐
           │                                         │
           │ Yes                                     │
           ▼                                         ▼
    ┌──────────────┐                         ┌──────────────┐
    │  DISCOVERED  │                         │ NO DISCOVERY │
    │              │                         │              │
    │ P = trigger  │                         │ J := J_new   │
    │   amount     │                         │ Continue     │
    └──────┬───────┘                         │ expedition   │
           │                                 └──────────────┘
           ▼
    ┌──────────────────────────────────────────────────────────┐
    │                    DISTRIBUTE TREASURE                    │
    │                                                           │
    │  Check: Are there qualified stakers?                      │
    │                                                           │
    │  ┌─────────────────────┐   ┌─────────────────────────┐   │
    │  │ YES: Qualified > 0  │   │ NO: Zero qualifiers     │   │
    │  │                     │   │                         │   │
    │  │ 50% → Discoverer    │   │ 50% → Discoverer        │   │
    │  │ 40% → Stakers       │   │ 20% → Buy & Burn HUNT   │   │
    │  │ 5% → Buy & Burn HUNT│   │ 20% → Community Pool    │   │
    │  │ 3.75% → Cartographer│   │ 5% → Buy & Burn HUNT    │   │
    │  │ 1.25% → Map Maker   │   │ 3.75% → Cartographer    │   │
    │  │                     │   │ 1.25% → Map Maker       │   │
    │  └─────────────────────┘   └─────────────────────────┘   │
    └──────────────────────────────┬───────────────────────────┘
                                   │
                                   ▼
    ┌──────────────────────────────────────────────────────────┐
    │                      RESET EXPEDITION                     │
    │                                                           │
    │  O = (J_prev + Δ) - P    // Calculate overflow           │
    │  J := O                  // Reset Treasure to overflow   │
    │  M := 2M                 // Double Max Map Size          │
    │  epochId++               // Increment expedition         │
    │                                                           │
    │  Reset qualification flags for all stakers               │
    │                                                           │
    │  Check: Does O trigger another discovery?                │
    │  If yes: Loop (bounded to prevent gas exhaustion)        │
    └──────────────────────────────────────────────────────────┘

Cascading Discovery:
  • If overflow O is large enough to trigger in new expedition
  • Loop up to MAX_CASCADE (e.g., 5) iterations
  • Each iteration: distribute, reset, check again
  • If MAX_CASCADE reached: remaining overflow stays in J
```

---

## 8. Airdrop State Machine

Claim window lifecycle.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AIRDROP STATE MACHINE                         │
└─────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │   INACTIVE   │
    │              │
    │ Pre-genesis  │
    │ Merkle root  │
    │   set        │
    └──────┬───────┘
           │
           │ System deployed (genesis)
           │
           ▼
    ┌──────────────┐
    │    ACTIVE    │
    │              │
    │ Claims open  │
    │ 90-day window│
    └──────┬───────┘
           │
           │ block.timestamp > claimDeadline
           │
           ▼
    ┌──────────────┐
    │   EXPIRED    │
    │              │
    │ No new claims│
    │ burnUnclaimed│
    │   callable   │
    └──────┬───────┘
           │
           │ burnUnclaimed() called
           │
           ▼
    ┌──────────────┐
    │   FINALIZED  │
    │              │
    │ All unclaimed│
    │ HUNT burned  │
    │              │
    │ Contract     │
    │ effectively  │
    │ dead         │
    └──────────────┘

Claim Flow:
  1. Participant calls claim(amount, proof)
  2. Verify: merkleRoot matches leaf(address, amount)
  3. Verify: hasClaimed[address] == false
  4. Verify: block.timestamp <= claimDeadline
  5. Transfer amount HUNT to address
  6. Set hasClaimed[address] = true
```

---

## 9. Session State Machine

Session key lifecycle for frictionless exploration (ERC-4337 smart accounts).

```
┌─────────────────────────────────────────────────────────────────────┐
│                       SESSION STATE MACHINE                          │
└─────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │  NO SESSION  │◄───────────────────────────────────────┐
    │              │                                         │
    │ Wallet       │                                         │
    │ connected    │                                         │
    │ No active    │                                         │
    │ session key  │                                         │
    └──────┬───────┘                                         │
           │                                                 │
           │ User signs session authorization               │
           │ (one wallet signature)                          │
           │                                                 │
           ▼                                                 │
    ┌──────────────┐                                         │
    │   AUTHORIZED │                                         │
    │              │                                         │
    │ Session key  │                                         │
    │ active with: │                                         │
    │              │                                         │
    │ • Contract:  │                                         │
    │   Treasure   │                                         │
    │   Engine     │                                         │
    │              │                                         │
    │ • Function:  │                                         │
    │   placeBet() │                                         │
    │              │                                         │
    │ • Max spend: │                                         │
    │   e.g., $20  │                                         │
    │              │                                         │
    │ • Expiry:    │                                         │
    │   30 min or  │                                         │
    │   1 epoch    │                                         │
    └──────┬───────┘                                         │
           │                                                 │
           │ Frontend submits exploration                    │
           │ (no wallet popup)                               │
           ▼                                                 │
    ┌──────────────┐                                         │
    │   EXPLORING  │                                         │
    │              │────────────────────────────────┐        │
    │ Session key  │                                │        │
    │ signs calls  │                                │        │
    │              │                                │        │
    │ UserOps      │                                │        │
    │ bundled      │                                │        │
    │              │   (repeat until expiry)        │        │
    │ On-chain     │◄───────────────────────────────┘        │
    │ settlement   │                                         │
    └──────┬───────┘                                         │
           │                                                 │
           ├─── Time expired ─────────────────────────────────┤
           │                                                 │
           ├─── Spend limit reached ─────────────────────────┤
           │                                                 │
           ├─── Expedition ended (discovery) ─────────────────┤
           │                                                 │
           ▼                                                 │
    ┌──────────────┐                                         │
    │   EXPIRED    │                                         │
    │              │                                         │
    │ Session key  │                                         │
    │ invalidated  │                                         │
    │              │                                         │
    │ No lingering │                                         │
    │ permissions  │                                         │
    └──────────────┘─────────────────────────────────────────┘

States:
  • NO SESSION: Wallet connected, no active session key
  • AUTHORIZED: Session key created, constraints active
  • EXPLORING: Active exploration within session bounds
  • EXPIRED: Session ended, must re-authorize

Session Constraints (Immutable at creation):
  • allowedContract: TreasureEngine address only
  • allowedFunction: placeBet(uint256) only
  • maxSpend: USDC cap (e.g., 20 * 1e6)
  • expiry: timestamp OR epochId at creation + 1
  • maxCalls: optional call count limit

Security Properties:
  • No custody: Session key cannot transfer arbitrary tokens
  • No drain: Spend limited to explicit cap
  • No scope creep: Only specified functions callable
  • Auto-expire: No lingering permissions
  • Auditable: All calls are on-chain transactions

UX Properties:
  • Single signature enables multiple explorations
  • No wallet popup during active session
  • Invisible to user (no mention of "session keys")
  • User sees: "Authorize this expedition" → explore freely

Note: MAP purchases are NOT included in session keys.
      MAP buy/sell requires explicit user wallet signature (USDC only).
```

---

## State Interaction Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                    STATE MACHINE INTERACTIONS                        │
└─────────────────────────────────────────────────────────────────────┘

                      ┌─────────────┐
                      │   SESSION   │ ─── Authorizes ──────────────┐
                      │    STATE    │   frictionless exploration   │
                      └──────┬──────┘                              │
                             │                                      │
                             ▼                                      │
 ┌─────────────┐                                                    │
 │   SYSTEM    │ ───────────────────────────────────────────────────┤
 │   STATE     │                                                    │
 └──────┬──────┘                                                    │
        │                                                           │
        │ Contains                                                  │
        ▼                                                           │
 ┌─────────────┐      Triggers       ┌─────────────┐               │
 │ EXPEDITION  │ ◄─────────────────► │  DISCOVERY  │               │
 │   STATE     │   (can expire       │    STATE    │               │
 └──────┬──────┘    session)         └──────┬──────┘               │
        │                                   │                       │
        │ Accepts                           │ Distributes to        │
        ▼                                   ▼                       │
 ┌─────────────┐                     ┌─────────────┐               │
 │    BET      │ ─── 0x outcome ───► │   ROUTING   │               │
 │   STATE     │◄────────────────────│    STATE    │               │
 └──────┬──────┘  Session submits    └──────┬──────┘               │
        │         placeBet() calls          │                       │
        │                                   │                       │
        │ Records bet for                   │ Buys MAP for          │
        ▼                                   ▼                       │
 ┌─────────────┐                     ┌─────────────┐               │
 │   STAKE     │ ◄─────────────────  │  EMISSION   │               │
 │   STATE     │   Mints HUNT to     │    STATE    │               │
 └─────────────┘   contributor       └─────────────┘               │
        ▲                                                           │
        │                                                           │
        │ Uses HUNT from                                            │
        │                                                           │
 ┌─────────────┐                                                    │
 │  AIRDROP    │ ───────────────────────────────────────────────────┘
 │   STATE     │   (Parallel, independent lifecycle)
 └─────────────┘

Note: Session State is a UX layer. It does NOT modify contract logic.
      Contracts see valid signatures; they are unaware of session keys.
      MAP purchases bypass session keys (require explicit wallet signature).
```

---

*Document Version: 1.0*
*Last Updated: February 2, 2026*
*Status: DRAFT — Awaiting Review*
