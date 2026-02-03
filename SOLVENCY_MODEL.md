# Treasure Hunt
## Canonical USDC Accounting & Solvency Model
**(Authoritative – Start to Finish)**

This section defines exactly how USDC enters, moves through, and exits the system, how payouts are funded, and why the system remains solvent under arbitrarily many high-multiplier events.

---

## 1. Core Principle (Read First)

There is exactly **ONE contract** that holds USDC: the `TreasureEngine`.

There are no multiple USDC wallets inside the protocol. All solvency is achieved through **logical reservation**, **strict ordering**, and **invariant enforcement**, not by refilling side pools.

---

## 2. Logical USDC Partitions (Accounting Model)

Although all USDC lives in one contract, it is logically partitioned into two mutually exclusive balances:

### 2.1 Reserved USDC — The Treasure Chest (`J`)

- Tracked explicitly as a state variable `J`
- Represents USDC reserved for future Treasure (jackpot) payouts
- **Cannot be spent for any other purpose**
- Grows only from:
  - 50% of 0x exploration losses
- Shrinks only from:
  - Treasure discovery distributions

> This is **sacrosanct, reserved capital**.

### 2.2 Unreserved USDC — Free Liquidity

Defined implicitly as:

```
freeUSDC = totalUSDCBalance(TreasureEngine) − J
```

This pool funds everything else, including:
- Exploration payout multipliers (0.5x, 1x, 1.5x, 2x, 4x, 10x)
- Loss routing (DEX buys, bonding curve buys)
- Founder payments
- Community payments
- HUNT buy & burn
- MAP bonding curve purchases

There is no target level for `freeUSDC`. It fluctuates continuously.

---

## 3. Entry of USDC (Exploration)

When a player explores with amount `B` USDC:

1. `B` USDC is transferred into `TreasureEngine`
2. No other USDC is created or injected
3. The system now has:
   - +B total USDC
   - J unchanged (initially)

---

## 4. Exploration Outcome Resolution (Critical Ordering)

Exploration resolution follows a **strict, non-negotiable order**:

### Step 1: Determine Outcome

Outcome is selected via VRF from the immutable outcome table.

### Step 2: If Outcome is Non-Zero (Multiplier > 0)

Let multiplier = `m`.

1. Payout = B × m
2. Payout is paid **exclusively from freeUSDC**
3. Invariant enforced:

```
freeUSDC ≥ payout
```

**If this invariant would be violated, the transaction reverts.**

⚠️ **The Treasure Chest (`J`) is NEVER touched to pay multipliers.**

After payout:
- `totalUSDC` decreases by payout
- `J` remains unchanged
- `freeUSDC` decreases accordingly

### Step 3: If Outcome is Zero (0x Loss)

Let `L = B`.

Loss routing occurs as follows:

#### 3.1 Reserve Creation (First, Always)

- **50% of L** → added to Treasure Chest (`J`)

This immediately converts freeUSDC → reserved USDC.

#### 3.2 Remaining 50% of L (Value Routing)

From the remaining 50%:

| Allocation | Destination |
|------------|-------------|
| 19% of L | Buy $MAP from bonding curve → distribute to qualified HUNT stakers |
| 1% of L | Buy $MAP from bonding curve → founders (0.75% Cartographer, 0.25% Map Maker) |
| 20% of L | Buy & burn $MAP via bonding curve |
| 10% of L | Buy $HUNT from DEX → Community Pool |

All of these actions are funded from `freeUSDC`.

After routing:
- `totalUSDC` decreases by amounts sent externally
- `J` has increased
- `freeUSDC` adjusts accordingly

---

## 5. Treasure Discovery (Jackpot)

Treasure discovery occurs when cumulative contributions cause the hidden threshold to be crossed.

Let `P` be the Treasure size for this discovery.

### 5.1 Funding Source (Absolute Rule)

**ALL Treasure payouts are funded exclusively from the Treasure Chest (`J`).**

No `freeUSDC` is used for jackpots.

### 5.2 Standard Distribution

From the reserved amount `P`:

| Allocation | Destination |
|------------|-------------|
| 50% | Discoverer (USDC) |
| 40% | Qualified HUNT stakers (USDC) |
| 5% | Buy & burn HUNT (USDC → DEX) |
| 5% | Founders (3.75% Cartographer, 1.25% Map Maker) |

After distribution:
- `J` decreases by `P`
- `totalUSDC` decreases by `P`
- `freeUSDC` unchanged

### 5.3 Zero-Qualifier Case

If no qualified stakers exist:

The 40% staker share is replaced by:
- 20% → Buy & burn HUNT
- 20% → Community Pool (USDC)

All still funded from `J`.

---

## 6. Why Multiple 10× Events Are Safe

This is the key solvency proof.

**Exploration payouts:**
- Are paid from `freeUSDC` only
- Are bounded by:
  - prior player losses
  - outcome probabilities
- Cannot touch reserved funds (`J`)

**Treasure payouts:**
- Are paid from `J` only
- `J` only grows from prior losses
- `J` is never negative
- Payouts cannot exceed `J` by construction

**Therefore:**
- No payout ever depends on future players
- No circular funding
- No IOUs
- No leverage

If `freeUSDC` is insufficient to pay a large multiplier, **the transaction reverts**. This protects the system without harming the Treasure.

---

## 7. PRD-Ready Invariants (Must Be Included Verbatim)

1. `J ≤ totalUSDCBalance(TreasureEngine)` at all times
2. Exploration payouts **MUST NOT** reduce `J`
3. Treasure payouts **MUST NOT** use `freeUSDC`
4. No USDC minting occurs anywhere in the system
5. All payouts are fully funded at execution time or the transaction reverts

---

## 8. Correct PRD Language (Use This)

> The TreasureEngine maintains a single USDC balance with logical reservation. A tracked variable `J` represents reserved USDC for future Treasure payouts. All exploration multipliers are paid exclusively from unreserved USDC, while all Treasure discoveries are paid exclusively from `J`. At no point is reserved USDC used to fund exploration outcomes, and no payout is ever undercollateralized.

---

## 9. Instruction to Implementing AI (Final)

**Do not introduce additional USDC wallets, treasuries, or settlement pools.**

Implement solvency strictly through reservation (`J`) and ordering. Any implementation that allows exploration payouts to consume reserved Treasure funds is **incorrect**.
