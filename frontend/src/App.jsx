import React, { useState, useEffect, useRef, createContext, useContext, useMemo, useCallback } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  useAccount,
  useChainId,
  useReadContracts,
  useSwitchChain,
  useWatchContractEvent,
  useDisconnect,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from 'wagmi';
import { erc20Abi, formatUnits, isAddress, parseUnits, maxUint256 } from 'viem';

import {
  addresses,
  SUPPORTED_CHAIN_ID,
  SUPPORTED_CHAIN_NAME,
  DECIMALS,
  configReady,
  addressIssues,
  REQUIRED_ENV,
  walletConnectProjectId,
  CHAIN_ENV_VALID,
  DEMO_MODE,
} from './config.js';
import { treasureEngineAbi, mapTokenAbi, huntStakingAbi } from './abi/index.js';

// Treasure Hunt Interactive Mockup v2.6
// Visual Direction: Monkey Island — Pirate Adventure
// Typography: Pirata One (headings), IM Fell English (body)
// Materials: Parchment, Ink, Brass, Weathered Wood
// Language: Canonical Text Bible applied — no gambling terms, narrative prose
// Cartographer's Notes: Global overlay with hover state machine
// Full Log Modal: View complete expedition history
// Discovery Celebration: True viewport-centered overlay
// Map Table: Single action card with quick buttons, live estimate, subtle success

// ============================================================================
// CARTOGRAPHER'S NOTES — Global Overlay System
// ============================================================================
const NOTE_WIDTH = 280;
const NOTE_HEIGHT_ESTIMATE = 72;

const cartographerNotes = {
  expedition: "The expedition advances each time the treasure is found. This is how far we've come.",
  mapSize: "The treasure chest can hold no more than this. When reached or found, the chest resets and doubles.",
  contributions: "Every explorer who gives to the sea is marked here. The more who contribute, the less HUNT is minted.",
  emissionRate: "HUNT flows freely at first, then slows as the map fills with names. The early discoverers find the richest waters.",
  treasureChest: "Gold accumulates here until the chest is found. Anyone may discover it — the sea chooses.",
  beginExploration: "This is how you contribute to the expedition. Part goes to the chest. Part to the map. Part to the crew.",
  tidesOfFortune: "These are the possible fates of each exploration. The sea decides.",
  captainsLog: "The record of this voyage. Events, discoveries, and the crew's fortunes are written here.",
  huntWallet: "The token earned through exploration. Stake it to earn a seat at the crew's table.",
  huntStaked: "HUNT stowed below deck. Stake holders share in every discovery — if they've explored this expedition.",
  stakingCooldown: "It takes seven days to leave the crew. This is the remaining time before HUNT may be withdrawn.",
  map: "A bonding-curve token reflecting the progress of the expedition. Bought with USDC. Rises as others contribute.",
  mapPrice: "The current cost to acquire one MAP. This increases as the map supply grows.",
  mapSupply: "How much MAP exists. New MAP is minted through the bonding curve or earned by stakers.",
  mapState: "The tier of the current map, from Blank Parchment to Myth Made Real.",
  globalDiscovery: "When the chest is found, the discoverer receives half. Stakers who explored this expedition share the rest.",
};

const CartographerNotesContext = createContext(null);

const computePosition = (anchorRect) => {
  if (!anchorRect) return { top: 0, left: 0, flipped: false };
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const spaceBelow = viewportHeight - anchorRect.bottom;
  const flipped = spaceBelow < NOTE_HEIGHT_ESTIMATE + 12;
  const top = flipped ? anchorRect.top - NOTE_HEIGHT_ESTIMATE - 6 : anchorRect.bottom + 6;
  let left = anchorRect.left;
  if (left + NOTE_WIDTH > viewportWidth - 12) left = viewportWidth - NOTE_WIDTH - 12;
  if (left < 12) left = 12;
  return { top, left, flipped };
};

const formatToken = (value, decimals, maxFrac = 2) => {
  if (value === null || value === undefined) return '--';
  const raw = formatUnits(value, decimals);
  const [whole, frac = ''] = raw.split('.');
  const clipped = frac.slice(0, maxFrac).replace(/0+$/, '');
  return clipped.length ? `${whole}.${clipped}` : whole;
};

const toNumber = (value, decimals) => {
  if (value === null || value === undefined) return 0;
  const raw = formatUnits(value, decimals);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseAmount = (value, decimals) => {
  if (value === null || value === undefined) return 0n;
  const raw = typeof value === 'number' ? value.toString() : String(value).trim();
  if (!raw || raw === '0') return 0n;
  try {
    return parseUnits(raw, decimals);
  } catch {
    return 0n;
  }
};

const shortAddress = (value) => {
  if (!value || !isAddress(value)) return '--';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const formatError = (error) => {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error.shortMessage) return error.shortMessage;
  if (error.cause?.shortMessage) return error.cause.shortMessage;
  if (error.cause?.message) return error.cause.message;
  if (error.cause?.data?.errorName) return error.cause.data.errorName;
  if (error.data?.errorName) return error.data.errorName;
  if (error.reason) return error.reason;
  if (error.message) return error.message;
  return 'Transaction failed';
};

const normalizeBlockNumber = (value) => {
  if (value === null || value === undefined) return null;
  try {
    return Number(value);
  } catch {
    return null;
  }
};

// Overlay: pointerEvents: none — note does NOT stay open when hovering the note
const CartographerNotesOverlay = ({ activeNote, position }) => {
  if (!activeNote) return null;
  const note = cartographerNotes[activeNote];
  if (!note) return null;
  return (
    <div
      id="cartographers-notes-root"
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        width: NOTE_WIDTH,
        zIndex: 9999,
        pointerEvents: 'none',
        animation: position.flipped ? 'noteSlideUp 0.15s ease-out' : 'noteSlideDown 0.15s ease-out',
        fontFamily: "'IM Fell English', serif",
      }}
    >
      <div style={{
        padding: '12px 16px',
        background: 'linear-gradient(180deg, #f0e6d2 0%, #e8dcc4 50%, #dfd2b8 100%)',
        borderRadius: '3px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.5)',
        color: '#4a3a28',
        fontSize: '14px',
        fontStyle: 'italic',
        lineHeight: '1.4',
      }}>
        {note}
      </div>
    </div>
  );
};

// Trigger: just the ink dot. Note closes via global pointermove tracking.
const CartographerNote = ({ noteKey }) => {
  const manager = useContext(CartographerNotesContext);
  const anchorRef = useRef(null);
  if (!cartographerNotes[noteKey]) return null;

  const handleMouseEnter = () => {
    if (anchorRef.current && manager) {
      manager.show(noteKey, anchorRef.current.getBoundingClientRect());
    }
  };

  const isActive = manager?.activeNote === noteKey;

  return (
    <span
      ref={anchorRef}
      onMouseEnter={handleMouseEnter}
      onTouchStart={() => isActive ? manager?.forceClose() : handleMouseEnter()}
      style={{ display: 'inline-block', marginLeft: '6px', verticalAlign: 'middle', cursor: 'help' }}
    >
      <span style={{
        display: 'inline-block',
        width: '5px',
        height: '5px',
        borderRadius: '50%',
        background: isActive
          ? 'radial-gradient(circle at 30% 30%, #5c4a32 0%, #3d2818 100%)'
          : 'radial-gradient(circle at 30% 30%, #8b7355 0%, #6b5c47 100%)',
        opacity: isActive ? 1 : 0.5,
        transition: 'opacity 0.15s',
      }} />
    </span>
  );
};

const TreasureHuntMockup = () => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { disconnect } = useDisconnect();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const isWrongNetwork = isConnected && chainId !== SUPPORTED_CHAIN_ID;
  const readEnabled = isConnected && !isWrongNetwork && configReady;
  const demoOnly = DEMO_MODE && !readEnabled;
  const interactionsEnabled = readEnabled || demoOnly;

  // Global state
  const [J, setJ] = useState(0);
  const [M, setM] = useState(100);
  const [epochId, setEpochId] = useState(0);
  const [N0, setN0] = useState(0);

  // Player state
  const [balance, setBalance] = useState(1000);
  const [huntBalance, setHuntBalance] = useState(0);
  const [stakedHunt, setStakedHunt] = useState(0);
  const [hasQualifyingBet, setHasQualifyingBet] = useState(false);
  const [pendingRewards, setPendingRewards] = useState(0);
  const [pendingMapRewards, setPendingMapRewards] = useState(0);
  const [mapBalance, setMapBalance] = useState(0);
  const [mapSupply, setMapSupply] = useState(0);

  // Staking state
  const [cooldownStart, setCooldownStart] = useState(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  // UI state
  const [betAmount, setBetAmount] = useState(1);
  const [isSpinning, setIsSpinning] = useState(false);
  const [lastOutcome, setLastOutcome] = useState(null);
  const [lastFateMessage, setLastFateMessage] = useState(null);
  const [log, setLog] = useState(() =>
    DEMO_MODE
      ? [{ message: '⚠ Demo mode enabled — scripted effects only.', type: 'demo', time: new Date().toLocaleTimeString() }]
      : []
  );
  const [showFullLog, setShowFullLog] = useState(false);
  const [stakeAmount, setStakeAmount] = useState(0);

  // MAP Purchase Flow State (single action)
  const [mapPurchaseAmount, setMapPurchaseAmount] = useState('');  // USDC input
  const [mapPurchasing, setMapPurchasing] = useState(false);       // Transaction in progress
  const [mapPurchaseError, setMapPurchaseError] = useState(null);
  const [mapPurchaseSuccess, setMapPurchaseSuccess] = useState(false); // Brief success flash

  // MAP Trade Mode (buy/sell toggle)
  const [mapTradeMode, setMapTradeMode] = useState('buy'); // 'buy' | 'sell'
  const [mapSellAmount, setMapSellAmount] = useState('');   // MAP input for selling
  const [mapSelling, setMapSelling] = useState(false);
  const [mapSellError, setMapSellError] = useState(null);
  const [mapSellSuccess, setMapSellSuccess] = useState(false);

  // Transaction state
  const [pendingTx, setPendingTx] = useState(null);

  // Wallet Display State
  const [walletDropdownOpen, setWalletDropdownOpen] = useState(false);

  const logSeqRef = useRef(0);

  // Correlated movement indicators
  const [mapPriceTick, setMapPriceTick] = useState(null);
  const [huntSupplyTick, setHuntSupplyTick] = useState(null);
  const [treasureGlow, setTreasureGlow] = useState(false);

  // Global Discovery Animation State
  const [discoveryAnimation, setDiscoveryAnimation] = useState(null);
  const [particles, setParticles] = useState([]);
  const [mapGlow, setMapGlow] = useState(false);
  const [lastSeenEpochId, setLastSeenEpochId] = useState(0);

  const { data: pendingReceipt, error: pendingReceiptError } = useWaitForTransactionReceipt({
    hash: pendingTx?.hash,
    query: { enabled: !!pendingTx?.hash },
  });

  const globalReads = useReadContracts({
    allowFailure: true,
    contracts: readEnabled
      ? [
          { address: addresses.treasureEngine, abi: treasureEngineAbi, functionName: 'J' },
          { address: addresses.treasureEngine, abi: treasureEngineAbi, functionName: 'M' },
          { address: addresses.treasureEngine, abi: treasureEngineAbi, functionName: 'epochId' },
          { address: addresses.treasureEngine, abi: treasureEngineAbi, functionName: 'MIN_BET' },
          { address: addresses.treasureEngine, abi: treasureEngineAbi, functionName: 'MAX_BET_BPS' },
          {
            address: addresses.usdc,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [addresses.treasureEngine],
          },
          { address: addresses.mapToken, abi: mapTokenAbi, functionName: 'currentPrice' },
          { address: addresses.mapToken, abi: mapTokenAbi, functionName: 'totalSupply' },
        ]
      : [],
    query: {
      enabled: readEnabled,
      refetchInterval: 5000,
      watch: true,
    },
  });

  const userReads = useReadContracts({
    allowFailure: true,
    contracts:
      readEnabled && address
        ? [
            { address: addresses.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [address] },
            { address: addresses.huntToken, abi: erc20Abi, functionName: 'balanceOf', args: [address] },
            { address: addresses.mapToken, abi: mapTokenAbi, functionName: 'balanceOf', args: [address] },
            { address: addresses.huntStaking, abi: huntStakingAbi, functionName: 'stakedBalance', args: [address] },
            { address: addresses.huntStaking, abi: huntStakingAbi, functionName: 'cooldownStart', args: [address] },
            { address: addresses.huntStaking, abi: huntStakingAbi, functionName: 'isQualified', args: [address] },
            { address: addresses.huntStaking, abi: huntStakingAbi, functionName: 'rewardsOwed', args: [address] },
            { address: addresses.huntStaking, abi: huntStakingAbi, functionName: 'mapRewardsOwed', args: [address] },
          ]
        : [],
    query: {
      enabled: readEnabled && !!address,
      refetchInterval: 5000,
      watch: true,
    },
  });

  const allowanceReads = useReadContracts({
    allowFailure: true,
    contracts:
      readEnabled && address
        ? [
            { address: addresses.usdc, abi: erc20Abi, functionName: 'allowance', args: [address, addresses.treasureEngine] },
            { address: addresses.usdc, abi: erc20Abi, functionName: 'allowance', args: [address, addresses.mapToken] },
            { address: addresses.huntToken, abi: erc20Abi, functionName: 'allowance', args: [address, addresses.huntStaking] },
          ]
        : [],
    query: {
      enabled: readEnabled && !!address,
      refetchInterval: 5000,
      watch: true,
    },
  });

  const [jBalance, mValue, epochValue, minBetRaw, maxBetBpsRaw, engineUsdc, mapPrice, mapSupplyRaw] = useMemo(() => {
    const results = globalReads.data || [];
    return results.map((entry) => entry?.result ?? null);
  }, [globalReads.data]);

  const [userUsdc, huntBal, mapBal, stakedBal, cooldownStartRaw, isQualifiedRaw, rewardsOwedRaw, mapRewardsOwedRaw] = useMemo(() => {
    const results = userReads.data || [];
    return results.map((entry) => entry?.result ?? null);
  }, [userReads.data]);

  const [engineAllowance, mapAllowance, stakingAllowance] = useMemo(() => {
    const results = allowanceReads.data || [];
    return results.map((entry) => entry?.result ?? null);
  }, [allowanceReads.data]);

  const freeUSDC = useMemo(() => {
    if (engineUsdc === null || engineUsdc === undefined) return null;
    if (jBalance === null || jBalance === undefined) return null;
    return engineUsdc > jBalance ? engineUsdc - jBalance : 0n;
  }, [engineUsdc, jBalance]);

  const liveJ = useMemo(() => toNumber(jBalance, DECIMALS.usdc), [jBalance]);
  const liveM = useMemo(() => toNumber(mValue, DECIMALS.usdc), [mValue]);
  const liveEpoch = useMemo(() => (epochValue === null || epochValue === undefined ? 0 : Number(epochValue)), [epochValue]);
  const liveHunt = useMemo(() => toNumber(huntBal, DECIMALS.hunt), [huntBal]);
  const liveMap = useMemo(() => toNumber(mapBal, DECIMALS.map), [mapBal]);
  const liveStaked = useMemo(() => toNumber(stakedBal, DECIMALS.hunt), [stakedBal]);
  const liveMapSupply = useMemo(() => toNumber(mapSupplyRaw, DECIMALS.map), [mapSupplyRaw]);
  const liveMapPrice = useMemo(() => toNumber(mapPrice, DECIMALS.usdc), [mapPrice]);
  const liveUserUsdc = useMemo(() => toNumber(userUsdc, DECIMALS.usdc), [userUsdc]);
  const liveMinBet = useMemo(() => toNumber(minBetRaw, DECIMALS.usdc) || 0.1, [minBetRaw]);
  const maxBetRaw = useMemo(() => {
    if (mValue === null || mValue === undefined) return null;
    if (maxBetBpsRaw === null || maxBetBpsRaw === undefined) return null;
    return (mValue * maxBetBpsRaw) / 10000n;
  }, [mValue, maxBetBpsRaw]);
  const liveMaxBet = useMemo(() => {
    if (maxBetRaw === null) return M * 0.01;
    return toNumber(maxBetRaw, DECIMALS.usdc);
  }, [maxBetRaw, M]);
  const liveCooldownStartMs = useMemo(() => {
    if (cooldownStartRaw === null || cooldownStartRaw === undefined) return 0;
    const seconds = Number(cooldownStartRaw);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
  }, [cooldownStartRaw]);
  const liveIsQualified = useMemo(() => !!isQualifiedRaw, [isQualifiedRaw]);
  const liveRewardsOwed = useMemo(() => toNumber(rewardsOwedRaw, DECIMALS.usdc), [rewardsOwedRaw]);
  const liveMapRewardsOwed = useMemo(() => toNumber(mapRewardsOwedRaw, DECIMALS.map), [mapRewardsOwedRaw]);
  const betAmountRaw = useMemo(() => parseAmount(betAmount, DECIMALS.usdc), [betAmount]);
  const stakeAmountRaw = useMemo(() => parseAmount(stakeAmount, DECIMALS.hunt), [stakeAmount]);
  const mapPurchaseRaw = useMemo(() => parseAmount(mapPurchaseAmount, DECIMALS.usdc), [mapPurchaseAmount]);
  const mapSellRaw = useMemo(() => parseAmount(mapSellAmount, DECIMALS.map), [mapSellAmount]);
  const usdcEngineAllowance = useMemo(() => (engineAllowance === null || engineAllowance === undefined ? 0n : engineAllowance), [engineAllowance]);
  const usdcMapAllowance = useMemo(() => (mapAllowance === null || mapAllowance === undefined ? 0n : mapAllowance), [mapAllowance]);
  const huntStakingAllowance = useMemo(() => (stakingAllowance === null || stakingAllowance === undefined ? 0n : stakingAllowance), [stakingAllowance]);
  const needsEngineApproval = betAmountRaw > 0n && usdcEngineAllowance < betAmountRaw;
  const needsMapApproval = mapPurchaseRaw > 0n && usdcMapAllowance < mapPurchaseRaw;
  const needsStakingApproval = stakeAmountRaw > 0n && huntStakingAllowance < stakeAmountRaw;
  const txBusy = !!pendingTx;

  useEffect(() => {
    if (!readEnabled) return;
    setJ(liveJ);
    if (liveM > 0) setM(liveM);
    setEpochId(liveEpoch);
    setHuntBalance(liveHunt);
    setMapBalance(liveMap);
    setStakedHunt(liveStaked);
    setMapSupply(liveMapSupply);
    setBalance(liveUserUsdc);
    setHasQualifyingBet(liveIsQualified);
    setPendingRewards(liveRewardsOwed);
    setPendingMapRewards(liveMapRewardsOwed);
    setCooldownStart(liveCooldownStartMs || null);
  }, [
    readEnabled,
    liveJ,
    liveM,
    liveEpoch,
    liveHunt,
    liveMap,
    liveStaked,
    liveMapSupply,
    liveUserUsdc,
    liveIsQualified,
    liveRewardsOwed,
    liveMapRewardsOwed,
    liveCooldownStartMs,
  ]);

  // Cooldown timer
  useEffect(() => {
    if (!cooldownStart) {
      setCooldownRemaining(0);
      return;
    }
    const interval = setInterval(() => {
      const elapsed = Date.now() - cooldownStart;
      const remaining = Math.max(0, 7 * 24 * 60 * 60 * 1000 - elapsed);
      setCooldownRemaining(remaining);
      if (remaining === 0) setCooldownStart(null);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownStart]);

  // Clear ticks after animation
  useEffect(() => {
    if (mapPriceTick) {
      const timer = setTimeout(() => setMapPriceTick(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [mapPriceTick]);

  useEffect(() => {
    if (huntSupplyTick) {
      const timer = setTimeout(() => setHuntSupplyTick(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [huntSupplyTick]);

  useEffect(() => {
    if (treasureGlow) {
      const timer = setTimeout(() => setTreasureGlow(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [treasureGlow]);

  // Check for missed discoveries
  useEffect(() => {
    if (epochId > lastSeenEpochId) {
      showLateArrivalDiscovery();
    }
  }, [epochId, lastSeenEpochId]);

  // Spawn celebration particles
  const spawnParticles = (count = 40) => {
    const newParticles = [];
    const types = ['coin', 'sparkle', 'star', 'gem'];
    for (let i = 0; i < count; i++) {
      newParticles.push({
        id: Date.now() + i,
        type: types[Math.floor(Math.random() * types.length)],
        x: Math.random() * 100,
        y: -10,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 3 + 2,
        rotation: Math.random() * 360,
        scale: 0.5 + Math.random() * 1,
        opacity: 1,
      });
    }
    setParticles(newParticles);
  };

  // Animate particles
  useEffect(() => {
    if (particles.length === 0) return;
    const interval = setInterval(() => {
      setParticles(prev =>
        prev
          .map(p => ({
            ...p,
            x: p.x + p.vx * 0.5,
            y: p.y + p.vy,
            vy: p.vy + 0.1,
            rotation: p.rotation + 5,
            opacity: p.opacity - 0.015,
          }))
          .filter(p => p.opacity > 0 && p.y < 110)
      );
    }, 50);
    return () => clearInterval(interval);
  }, [particles.length > 0]);

  const showLateArrivalDiscovery = () => {
    setDiscoveryAnimation('abbreviated');
    setMapGlow(true);
    spawnParticles(25);
    addLog("⚓ The Treasure has been found. The echoes still ring through the hull.", 'discovery');
    addLog("Discovery: Treasure distributed — Expedition advanced", 'result');
    setTimeout(() => {
      setDiscoveryAnimation(null);
      setMapGlow(false);
      setLastSeenEpochId(epochId);
    }, 2500);
  };

  const showFullDiscovery = (amount) => {
    setDiscoveryAnimation('full');
    setMapGlow(true);
    spawnParticles(50);
    addLog("⚓ TREASURE FOUND! The chest bursts open — the map expands.", 'discovery');
    if (amount) {
      addLog(`Discovery: ${amount.toFixed(2)} USDC distributed`, 'result');
    }
    setTimeout(() => addLog("The map shudders with newfound power.", 'map'), 1200);
    setTimeout(() => {
      setDiscoveryAnimation(null);
      setMapGlow(false);
      setLastSeenEpochId(epochId);
    }, 3200);
  };

  // MAP functions
  const getMapPrice = (supply) => {
    const k = 9.210340371976183e-8;
    return 0.01 * Math.exp(k * supply);
  };

  const getMapTier = (price) => {
    if (price < 0.02) return { name: "Blank Parchment", icon: "◇" };
    if (price < 0.05) return { name: "Rough Coastlines", icon: "◆" };
    if (price < 0.15) return { name: "Trade Routes", icon: "⚓" };
    if (price < 0.50) return { name: "Interior Charted", icon: "⛰" };
    if (price < 1.00) return { name: "Known World", icon: "◉" };
    return { name: "Myth Made Real", icon: "✦" };
  };

  // HUNT price (simulated from Aerodrome pool)
  const getHuntPrice = () => {
    const basePrice = 0.05;
    const supplyFactor = 1 + (N0 / 10000);
    return basePrice * supplyFactor;
  };

  // Canonical Tides of Fortune outcomes
  const outcomes = [
    { name: "0×", label: "The Sea Claims Its Due", probability: 0.40, multiplier: 0, maxIndex: 4000 },
    { name: "½×", label: "A Modest Return", probability: 0.22, multiplier: 0.5, maxIndex: 6200 },
    { name: "1×", label: "Safe Harbor", probability: 0.18, multiplier: 1.0, maxIndex: 8000 },
    { name: "1½×", label: "Favorable Winds", probability: 0.10, multiplier: 1.5, maxIndex: 9000 },
    { name: "2×", label: "Strong Tides", probability: 0.06, multiplier: 2.0, maxIndex: 9600 },
    { name: "4×", label: "A Rare Surge", probability: 0.03, multiplier: 4.0, maxIndex: 9900 },
    { name: "10×", label: "Legendary Fortune", probability: 0.01, multiplier: 10.0, maxIndex: 10000 },
  ];

  const getEmissionRate = (n) => {
    if (n < 100000) return 1.0;
    return 0.02 + 0.98 * Math.exp(-0.00004 * (n - 100000));
  };

  // Canonical messages from Language Bible
  const messages = {
    '0×': [
      "The sea takes its share. The map darkens with ink.",
      "Fortune turns away, but the journey deepens.",
      "The sea claims its due.",
      "Another mark stains the parchment.",
    ],
    '½×': [
      "A modest haul. Enough to keep rum flowing.",
      "The winds nod politely.",
    ],
    '1×': [
      "We return as we left. Spirits steady.",
      "Safe passage. No tales worth bragging.",
    ],
    '1½×': [
      "A modest haul. Enough to keep spirits steady.",
      "The winds were generous.",
    ],
    '2×': [
      "The tide swells in our favor.",
      "The hold grows heavier.",
    ],
    '4×': [
      "The crew erupts — fortune smiles wide today.",
      "By Neptune's beard… riches abound.",
    ],
    '10×': [
      "Songs will be sung of this moment.",
      "The sea itself bows.",
      "By all gods… fortune smiles upon us.",
    ],
    'mint': [
      "The expedition marks the contribution.",
      "Another name etched in the ledger.",
    ],
    'mapBuy': [
      "The gods favor us.",
      "The winds are with us.",
      "The parchment grows wiser.",
      "Old ink finds new meaning.",
      "Another coastline emerges.",
      "The map remembers.",
    ],
  };

  const getRandomMessage = (type) => {
    const pool = messages[type] || messages['1×'];
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const addLog = (message, type = 'info', meta = {}) => {
    const entry = {
      id: logSeqRef.current++,
      message,
      type,
      time: new Date().toLocaleTimeString(),
      createdAt: Date.now(),
      blockNumber: normalizeBlockNumber(meta.blockNumber),
      logIndex: meta.logIndex ?? null,
    };
    setLog(prev => [...prev.slice(-9), entry]);
  };

  const refetchAll = useCallback(() => {
    globalReads.refetch?.();
    userReads.refetch?.();
    allowanceReads.refetch?.();
  }, [globalReads, userReads, allowanceReads]);

  const orderedLog = useMemo(() => {
    const copy = [...log];
    copy.sort((a, b) => {
      if (a.blockNumber !== null && b.blockNumber !== null) {
        if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
        if (a.logIndex !== null && b.logIndex !== null && a.logIndex !== b.logIndex) return a.logIndex - b.logIndex;
      }
      const aSeq = a.id ?? 0;
      const bSeq = b.id ?? 0;
      return aSeq - bSeq;
    });
    return copy;
  }, [log]);

  const submitTx = useCallback(
    async ({ label, onStart, onSuccess, onError, ...tx }) => {
      if (!writeContractAsync) {
        addLog('Wallet not ready for transactions.', 'error');
        return;
      }
      if (pendingTx) {
        addLog('Another transaction is still awaiting confirmation.', 'info');
        return;
      }
      onStart?.();
      try {
        if (publicClient && address) {
          try {
            await publicClient.simulateContract({ ...tx, account: address });
          } catch (error) {
            onError?.(error);
            addLog(formatError(error), 'error');
            return;
          }
        }
        const hash = await writeContractAsync(tx);
        addLog(`${label} submitted`, 'info');
        setPendingTx({ hash, label, onSuccess, onError });
      } catch (error) {
        onError?.(error);
        addLog(formatError(error), 'error');
      }
    },
    [writeContractAsync, pendingTx, addLog, publicClient, address]
  );

  useEffect(() => {
    if (!pendingTx || !pendingReceipt) return;
    if (pendingReceipt.status === 'reverted') {
      pendingTx.onError?.(pendingReceipt);
      addLog('Execution reverted.', 'error');
      setPendingTx(null);
      return;
    }
    pendingTx.onSuccess?.(pendingReceipt);
    addLog(`${pendingTx.label} confirmed`, 'result');
    refetchAll();
    setPendingTx(null);
  }, [pendingReceipt, pendingTx, refetchAll]);

  useEffect(() => {
    if (!pendingTx || !pendingReceiptError) return;
    pendingTx.onError?.(pendingReceiptError);
    addLog(formatError(pendingReceiptError), 'error');
    setPendingTx(null);
  }, [pendingReceiptError, pendingTx]);

  const userAddressLower = address?.toLowerCase();

  useWatchContractEvent({
    address: readEnabled ? addresses.treasureEngine : undefined,
    abi: treasureEngineAbi,
    eventName: 'TreasureDiscovered',
    enabled: readEnabled && !!addresses.treasureEngine,
    onLogs: (logs) => {
      logs.forEach((log) => {
        const { discoverer, amount, epochId: epoch } = log.args || {};
        const parsedAmount = amount ? Number(formatUnits(amount, DECIMALS.usdc)) : 0;
        addLog(`Treasure discovered: ${parsedAmount.toFixed(2)} USDC`, 'discovery', { blockNumber: log.blockNumber, logIndex: log.logIndex });
        addLog(`Epoch ${epoch ?? '--'} • ${shortAddress(discoverer)}`, 'result', { blockNumber: log.blockNumber, logIndex: log.logIndex });
        showFullDiscovery(parsedAmount);
      });
      refetchAll();
    },
  });

  useWatchContractEvent({
    address: readEnabled ? addresses.treasureEngine : undefined,
    abi: treasureEngineAbi,
    eventName: 'ExpeditionStarted',
    enabled: readEnabled && !!addresses.treasureEngine,
    onLogs: (logs) => {
      logs.forEach((log) => {
        const { epochId: epoch, newM } = log.args || {};
        const parsedM = newM ? Number(formatUnits(newM, DECIMALS.usdc)) : 0;
        addLog(`New expedition: M is now ${parsedM.toFixed(2)} USDC`, 'expedition', { blockNumber: log.blockNumber, logIndex: log.logIndex });
        addLog(`Epoch ${epoch ?? '--'} begins`, 'result', { blockNumber: log.blockNumber, logIndex: log.logIndex });
      });
      refetchAll();
    },
  });

  useWatchContractEvent({
    address: readEnabled ? addresses.treasureEngine : undefined,
    abi: treasureEngineAbi,
    eventName: 'BetResolved',
    enabled: readEnabled && !!addresses.treasureEngine,
    onLogs: (logs) => {
      logs.forEach((log) => {
        const { participant, amount, outcomeIndex, payout } = log.args || {};
        const parsedAmount = amount ? Number(formatUnits(amount, DECIMALS.usdc)) : 0;
        const parsedPayout = payout ? Number(formatUnits(payout, DECIMALS.usdc)) : 0;
        const outcome = typeof outcomeIndex === 'number' || typeof outcomeIndex === 'bigint'
          ? outcomes[Number(outcomeIndex)]
          : null;
        if (outcome) {
          setLastOutcome(outcome);
          setLastFateMessage(getRandomMessage(outcome.name));
        }
        addLog(`Exploration resolved: ${parsedAmount.toFixed(2)} USDC → ${parsedPayout.toFixed(2)} USDC`, 'result', { blockNumber: log.blockNumber, logIndex: log.logIndex });
        addLog(`${shortAddress(participant)} • Outcome ${outcomeIndex ?? '--'}`, 'expedition', { blockNumber: log.blockNumber, logIndex: log.logIndex });
      });
      refetchAll();
    },
  });

  useWatchContractEvent({
    address: readEnabled ? addresses.mapToken : undefined,
    abi: mapTokenAbi,
    eventName: 'MapBought',
    enabled: readEnabled && !!addresses.mapToken,
    onLogs: (logs) => {
      logs.forEach((log) => {
        const { buyer, usdcIn, mapOut } = log.args || {};
        const parsedUsdc = usdcIn ? Number(formatUnits(usdcIn, DECIMALS.usdc)) : 0;
        const parsedMap = mapOut ? Number(formatUnits(mapOut, DECIMALS.map)) : 0;
        addLog(`MAP bought: ${parsedMap.toFixed(3)} MAP`, 'map', { blockNumber: log.blockNumber, logIndex: log.logIndex });
        addLog(`${shortAddress(buyer)} • ${parsedUsdc.toFixed(2)} USDC`, 'result', { blockNumber: log.blockNumber, logIndex: log.logIndex });
        if (buyer && userAddressLower && buyer.toLowerCase() === userAddressLower) {
          setMapBalance((prev) => prev + parsedMap);
        }
      });
      refetchAll();
    },
  });

  useWatchContractEvent({
    address: readEnabled ? addresses.mapToken : undefined,
    abi: mapTokenAbi,
    eventName: 'MapSold',
    enabled: readEnabled && !!addresses.mapToken,
    onLogs: (logs) => {
      logs.forEach((log) => {
        const { seller, mapIn, usdcOut } = log.args || {};
        const parsedUsdc = usdcOut ? Number(formatUnits(usdcOut, DECIMALS.usdc)) : 0;
        const parsedMap = mapIn ? Number(formatUnits(mapIn, DECIMALS.map)) : 0;
        addLog(`MAP sold: ${parsedMap.toFixed(3)} MAP`, 'map', { blockNumber: log.blockNumber, logIndex: log.logIndex });
        addLog(`${shortAddress(seller)} • ${parsedUsdc.toFixed(2)} USDC`, 'result', { blockNumber: log.blockNumber, logIndex: log.logIndex });
        if (seller && userAddressLower && seller.toLowerCase() === userAddressLower) {
          setMapBalance((prev) => Math.max(0, prev - parsedMap));
        }
      });
      refetchAll();
    },
  });

  const resolveOutcome = () => {
    const rand = Math.floor(Math.random() * 10000);
    for (const outcome of outcomes) {
      if (rand < outcome.maxIndex) return outcome;
    }
    return outcomes[outcomes.length - 1];
  };

  const checkDiscovery = (prevJ, delta) => {
    const newJ = Math.min(prevJ + delta, M);
    if (newJ >= M) return { discovered: true, amount: M };
    const R = Math.random() * M;
    if (R > prevJ && R <= newJ) return { discovered: true, amount: R };
    return { discovered: false, newJ };
  };

  const approveUsdcForEngine = async () => {
    if (!readEnabled) {
      addLog('Connect your wallet to approve USDC.', 'info');
      return;
    }
    if (betAmountRaw === 0n) {
      addLog('Enter an amount to approve.', 'info');
      return;
    }
    await submitTx({
      label: 'Approve USDC',
      address: addresses.usdc,
      abi: erc20Abi,
      functionName: 'approve',
      args: [addresses.treasureEngine, maxUint256],
    });
  };

  const approveUsdcForMap = async () => {
    if (!readEnabled) {
      addLog('Connect your wallet to approve USDC.', 'info');
      return;
    }
    if (mapPurchaseRaw === 0n) {
      addLog('Enter an amount to approve.', 'info');
      return;
    }
    await submitTx({
      label: 'Approve USDC',
      address: addresses.usdc,
      abi: erc20Abi,
      functionName: 'approve',
      args: [addresses.mapToken, maxUint256],
    });
  };

  const approveHuntForStaking = async () => {
    if (!readEnabled) {
      addLog('Connect your wallet to approve HUNT.', 'info');
      return;
    }
    if (stakeAmountRaw === 0n) {
      addLog('Enter an amount to approve.', 'info');
      return;
    }
    await submitTx({
      label: 'Approve HUNT',
      address: addresses.huntToken,
      abi: erc20Abi,
      functionName: 'approve',
      args: [addresses.huntStaking, maxUint256],
    });
  };

  // Canonical: "Begin Exploration" (never "bet" or "wager")
  const placeBet = async () => {
    if (demoOnly) {
      if (betAmount < 0.10) {
        addLog("The sea refuses the command.", 'error');
        return;
      }
      if (betAmount > M * 0.01) {
        addLog("The sea refuses the command.", 'error');
        return;
      }
      if (betAmount > balance) {
        addLog("The sea refuses the command.", 'error');
        return;
      }

      setIsSpinning(true);
      setBalance(prev => prev - betAmount);
      setHasQualifyingBet(true);

      setTimeout(() => {
        const outcome = resolveOutcome();
        setLastOutcome(outcome);
        setIsSpinning(false);

        if (outcome.multiplier > 0) {
          const returnAmount = betAmount * outcome.multiplier;
          setBalance(prev => prev + returnAmount);
          const fateMsg = getRandomMessage(outcome.name);
          setLastFateMessage(fateMsg);
          // Flavor line
          addLog(fateMsg, outcome.multiplier > 1 ? 'fortune' : 'partial');
          // Outcome line (plain facts)
          addLog(`Result: ${outcome.name} — Received ${returnAmount.toFixed(2)} USDC`, 'result');
        } else {
          const contribution = betAmount;
          const toTreasure = contribution * 0.50;
          setN0(prev => prev + 1);

          const huntMinted = contribution * getEmissionRate(N0);
          setHuntBalance(prev => prev + huntMinted);
          const fateMsg = getRandomMessage('0×');
          setLastFateMessage(fateMsg);
          // Flavor line
          addLog(fateMsg, 'contribution');
          // Outcome line (plain facts)
          addLog(`Result: 0× — Contributed ${contribution.toFixed(2)} USDC to the expedition`, 'result');
          addLog(`Minted: +${huntMinted.toFixed(4)} HUNT`, 'mint');

          const mapBuyUsdc = contribution * 0.39;
          const mapMinted = mapBuyUsdc / getMapPrice(mapSupply) * 0.8;
          setMapSupply(prev => prev + mapMinted);

          setTreasureGlow(true);
          setMapPriceTick('up');
          setHuntSupplyTick('tightening');

          if (stakedHunt > 0 && hasQualifyingBet) {
            const stakerMapShare = mapMinted * (19/39);
            setMapBalance(prev => prev + stakerMapShare);
          }

          const prevJ = J;
          setJ(Math.min(prevJ + toTreasure, M));
          const discovery = checkDiscovery(prevJ, toTreasure);
          if (discovery.discovered) {
            setTimeout(() => showFullDiscovery(discovery.amount), 500);
          }
        }
      }, 1500);
      return;
    }

    if (!readEnabled) {
      addLog('Connect your wallet to explore.', 'info');
      return;
    }

    const betValue = Number(betAmount) || 0;
    if (betValue < liveMinBet) {
      addLog("The sea refuses the command.", 'error');
      return;
    }
    if (maxBetRaw && betAmountRaw > maxBetRaw) {
      addLog("The sea refuses the command.", 'error');
      return;
    }
    if (!maxBetRaw && betValue > M * 0.01) {
      addLog("The sea refuses the command.", 'error');
      return;
    }
    if (userUsdc !== null && userUsdc !== undefined && betAmountRaw > userUsdc) {
      addLog("The sea refuses the command.", 'error');
      return;
    }
    if (needsEngineApproval) {
      addLog('Approve USDC before beginning exploration.', 'info');
      return;
    }

    await submitTx({
      label: 'Exploration',
      onStart: () => setIsSpinning(true),
      onSuccess: () => setIsSpinning(false),
      onError: () => setIsSpinning(false),
      address: addresses.treasureEngine,
      abi: treasureEngineAbi,
      functionName: 'placeBet',
      args: [betAmountRaw],
    });
  };

  // Staking functions (canonical: "Ship's Hold")
  const stake = async (amount) => {
    if (demoOnly) {
      if (amount <= 0 || amount > huntBalance) return;
      setHuntBalance(prev => prev - amount);
      setStakedHunt(prev => prev + amount);
      addLog("HUNT stowed below deck.", 'stake');
      return;
    }
    if (!readEnabled) {
      addLog('Connect your wallet to stake.', 'info');
      return;
    }
    if (amount <= 0 || amount > huntBalance) return;
    if (needsStakingApproval) {
      addLog('Approve HUNT before staking.', 'info');
      return;
    }

    await submitTx({
      label: 'Stake HUNT',
      address: addresses.huntStaking,
      abi: huntStakingAbi,
      functionName: 'stake',
      args: [stakeAmountRaw],
    });
  };

  const initiateWithdraw = async () => {
    if (demoOnly) {
      if (stakedHunt <= 0 || cooldownStart) return;
      setCooldownStart(Date.now());
      addLog("The gangplank lowers in seven days.", 'stake');
      return;
    }
    if (!readEnabled) {
      addLog('Connect your wallet to withdraw.', 'info');
      return;
    }
    await submitTx({
      label: 'Initiate Withdrawal',
      address: addresses.huntStaking,
      abi: huntStakingAbi,
      functionName: 'initiateWithdraw',
      args: [],
    });
  };

  const cancelWithdraw = async () => {
    if (demoOnly) {
      setCooldownStart(null);
      addLog("No sailor leaves mid-watch.", 'stake');
      return;
    }
    if (!readEnabled) {
      addLog('Connect your wallet to withdraw.', 'info');
      return;
    }
    await submitTx({
      label: 'Cancel Withdrawal',
      address: addresses.huntStaking,
      abi: huntStakingAbi,
      functionName: 'cancelWithdraw',
      args: [],
    });
  };

  const completeWithdraw = async () => {
    if (demoOnly) {
      if (cooldownRemaining > 0) return;
      const amount = stakedHunt;
      setStakedHunt(0);
      setHuntBalance(prev => prev + amount);
      setCooldownStart(null);
      addLog("HUNT returned to the hold.", 'stake');
      return;
    }
    if (!readEnabled) {
      addLog('Connect your wallet to withdraw.', 'info');
      return;
    }
    if (cooldownRemaining > 0) return;
    const withdrawAmount = stakedBal ?? stakeAmountRaw;
    if (!withdrawAmount || withdrawAmount === 0n) return;
    await submitTx({
      label: 'Withdraw HUNT',
      address: addresses.huntStaking,
      abi: huntStakingAbi,
      functionName: 'withdraw',
      args: [withdrawAmount],
    });
  };

  const claimRewards = async () => {
    if (demoOnly) {
      if (pendingRewards > 0) {
        setBalance(prev => prev + pendingRewards);
        addLog("The crew's share has been claimed.", 'reward');
        setPendingRewards(0);
        setPendingMapRewards(0);
      }
      return;
    }
    if (!readEnabled) {
      addLog('Connect your wallet to claim rewards.', 'info');
      return;
    }
    await submitTx({
      label: 'Claim Rewards',
      address: addresses.huntStaking,
      abi: huntStakingAbi,
      functionName: 'claimRewards',
      args: [],
    });
  };

  // MAP Purchase — Single action flow
  const getEstimatedMapOut = () => {
    const usdcAmount = parseFloat(mapPurchaseAmount) || 0;
    if (usdcAmount <= 0) return 0;
    return usdcAmount / getMapPrice(mapSupply);
  };

  const handleMapPurchase = () => {
    if (demoOnly) {
      setMapPurchaseError(null);
      const amount = parseFloat(mapPurchaseAmount) || 0;

      if (amount <= 0) {
        setMapPurchaseError('Enter a valid amount');
        return;
      }
      if (amount > balance) {
        setMapPurchaseError('Insufficient balance');
        return;
      }

      setMapPurchasing(true);

      // Simulate wallet confirmation
      setTimeout(() => {
        const estimatedMap = getEstimatedMapOut();

        // Execute purchase — update state in place
        setBalance(prev => prev - amount);
        setMapBalance(prev => prev + estimatedMap);
        setMapSupply(prev => prev + estimatedMap);
        setMapPriceTick('up');

        // Brief success flash
        setMapPurchaseSuccess(true);
        setMapPurchasing(false);
        setMapPurchaseAmount('');

        // Clear success after brief moment
        setTimeout(() => setMapPurchaseSuccess(false), 2000);
      }, 800);
      return;
    }

    if (!readEnabled) {
      addLog('Connect your wallet to buy MAP.', 'info');
      return;
    }
    setMapPurchaseError(null);
    const amount = parseFloat(mapPurchaseAmount) || 0;

    if (amount <= 0) {
      setMapPurchaseError('Enter a valid amount');
      return;
    }
    if (amount > balance) {
      setMapPurchaseError('Insufficient balance');
      return;
    }
    if (needsMapApproval) {
      setMapPurchaseError('Approve USDC before buying MAP');
      return;
    }

    submitTx({
      label: 'Buy MAP',
      onStart: () => setMapPurchasing(true),
      onSuccess: () => {
        setMapPurchaseSuccess(true);
        setMapPurchasing(false);
        setMapPurchaseAmount('');
        setTimeout(() => setMapPurchaseSuccess(false), 2000);
      },
      onError: () => setMapPurchasing(false),
      address: addresses.mapToken,
      abi: mapTokenAbi,
      functionName: 'buy',
      args: [mapPurchaseRaw],
    });
  };

  const setMapAmountPercent = (percent) => {
    if (!interactionsEnabled || txBusy) return;
    const amount = (balance * percent / 100).toFixed(2);
    setMapPurchaseAmount(amount);
    setMapPurchaseError(null);
  };

  // MAP Sell — Single action flow
  const getEstimatedUsdcOut = () => {
    const mapAmount = parseFloat(mapSellAmount) || 0;
    if (mapAmount <= 0) return 0;
    // Sell at current price with 2% slippage/fee
    return mapAmount * getMapPrice(mapSupply) * 0.98;
  };

  const getSellPreview = () => {
    const mapAmount = parseFloat(mapSellAmount) || 0;
    if (mapAmount <= 0) return null;
    const currentPrice = getMapPrice(mapSupply);
    const usdcOut = mapAmount * currentPrice * 0.98;
    const newSupply = mapSupply - mapAmount;
    const priceAfter = getMapPrice(Math.max(0, newSupply));
    return { mapIn: mapAmount, usdcOut, currentPrice, priceAfter };
  };

  const handleMapSell = () => {
    if (demoOnly) {
      setMapSellError(null);
      const amount = parseFloat(mapSellAmount) || 0;

      if (amount <= 0) {
        setMapSellError('Enter a valid amount');
        return;
      }
      if (amount > mapBalance) {
        setMapSellError('Insufficient MAP balance');
        return;
      }

      setMapSelling(true);

      // Simulate wallet confirmation
      setTimeout(() => {
        const usdcOut = getEstimatedUsdcOut();

        // Execute sell — update state in place
        setMapBalance(prev => prev - amount);
        setMapSupply(prev => Math.max(0, prev - amount));
        setBalance(prev => prev + usdcOut);
        setMapPriceTick('down');

        // Log the sale
        addLog(`Returned ${amount.toFixed(4)} MAP to the sea. Received ${usdcOut.toFixed(2)} USDC.`, 'map');

        // Brief success flash
        setMapSellSuccess(true);
        setMapSelling(false);
        setMapSellAmount('');

        // Clear success after brief moment
        setTimeout(() => setMapSellSuccess(false), 2000);
      }, 800);
      return;
    }

    if (!readEnabled) {
      addLog('Connect your wallet to sell MAP.', 'info');
      return;
    }
    setMapSellError(null);
    const amount = parseFloat(mapSellAmount) || 0;

    if (amount <= 0) {
      setMapSellError('Enter a valid amount');
      return;
    }
    if (amount > mapBalance) {
      setMapSellError('Insufficient MAP balance');
      return;
    }

    submitTx({
      label: 'Sell MAP',
      onStart: () => setMapSelling(true),
      onSuccess: () => {
        setMapSellSuccess(true);
        setMapSelling(false);
        setMapSellAmount('');
        setTimeout(() => setMapSellSuccess(false), 2000);
      },
      onError: () => setMapSelling(false),
      address: addresses.mapToken,
      abi: mapTokenAbi,
      functionName: 'sell',
      args: [mapSellRaw],
    });
  };

  const setMapSellPercent = (percent) => {
    if (!interactionsEnabled || txBusy) return;
    const amount = (mapBalance * percent / 100).toFixed(4);
    setMapSellAmount(amount);
    setMapSellError(null);
  };

  // Wallet helpers
  const shortenAddress = (addr) => shortAddress(addr);

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
    }
    setWalletDropdownOpen(false);
  };

  const disconnectWallet = () => {
    if (disconnect) {
      disconnect();
    }
    setWalletDropdownOpen(false);
  };

  const triggerDemoDiscovery = () => {
    if (!DEMO_MODE) return;
    showFullDiscovery(M || liveM || 0);
  };

  const progressPercent = M > 0 ? (J / M) * 100 : 0;
  const currentMapPrice = liveMapPrice > 0 ? liveMapPrice : getMapPrice(mapSupply);
  const freeUsdcDisplay = freeUSDC === null ? '--' : formatToken(freeUSDC, DECIMALS.usdc, 2);
  const totalUsdcDisplay = engineUsdc === null ? '--' : formatToken(engineUsdc, DECIMALS.usdc, 2);
  const currentHuntPrice = getHuntPrice();
  const mapTier = getMapTier(currentMapPrice);

  const formatCooldown = (ms) => {
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    return `${days}d ${hours}h remaining`;
  };

  const getParticleEmoji = (type) => {
    const emojis = { coin: '●', sparkle: '✦', star: '★', gem: '◆' };
    return emojis[type] || '✦';
  };

  const getLogStyle = (type) => {
    const styles = {
      discovery: 'border-l-4 border-amber-600 bg-amber-900/20',
      reward: 'border-l-4 border-emerald-800 bg-emerald-900/10',
      error: 'border-l-4 border-red-900 bg-red-900/10',
      fortune: 'border-l-4 border-teal-800 bg-teal-900/10',
      contribution: 'border-l-4 border-orange-800 bg-orange-900/10',
      mint: 'border-l-4 border-sky-900 bg-sky-900/10',
      map: 'border-l-4 border-indigo-800 bg-indigo-900/10',
      stake: 'border-l-4 border-violet-900 bg-violet-900/10',
      expedition: 'border-l-4 border-amber-700 bg-amber-900/10',
      info: 'border-l-4 border-stone-700 bg-stone-800/20',
    };
    return styles[type] || styles.info;
  };

  // Parchment panel component
  const ParchmentPanel = ({ children, className = '', glow = false, dark = false }) => (
    <div
      className={`relative ${className}`}
      style={{
        background: dark
          ? 'linear-gradient(165deg, #1a1812 0%, #12100c 100%)'
          : 'linear-gradient(165deg, #e8dcc4 0%, #d4c4a0 50%, #c9b896 100%)',
        borderRadius: '4px',
        boxShadow: glow
          ? '0 0 30px rgba(201, 162, 39, 0.5), inset 0 1px 0 rgba(255,255,255,0.1)'
          : 'inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 12px rgba(0,0,0,0.4)',
        border: glow ? '3px solid #c9a227' : '2px solid #8b7355',
      }}
    >
      {/* Rough edge overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: dark ? 'none' : `url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        opacity: 0.03,
        pointerEvents: 'none',
        borderRadius: '4px',
      }} />
      <div className="relative z-10">{children}</div>
    </div>
  );

  // Wooden button component
  const WoodButton = ({ onClick, disabled, children, variant = 'primary', className = '' }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative font-pirata tracking-wide transition-all ${className}`}
      style={{
        background: disabled
          ? 'linear-gradient(180deg, #4a4035 0%, #2d2820 100%)'
          : variant === 'primary'
            ? 'linear-gradient(180deg, #8b6914 0%, #5c4a12 50%, #3d3210 100%)'
            : variant === 'danger'
              ? 'linear-gradient(180deg, #6b3030 0%, #4a2020 100%)'
              : 'linear-gradient(180deg, #5c4a32 0%, #3d3220 100%)',
        color: disabled ? '#6b5c47' : '#f5e6c8',
        border: disabled ? '2px solid #3d3428' : '2px solid #8b7355',
        borderRadius: '4px',
        boxShadow: disabled ? 'none' : '0 4px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
        textShadow: disabled ? 'none' : '0 1px 2px rgba(0,0,0,0.5)',
      }}
    >
      {children}
    </button>
  );

  // Brass plaque component — noteKey anchors note inline with label text
  const BrassPlaque = ({ label, value, subvalue, tick, noteKey }) => (
    <div
      className="relative p-3 text-center"
      style={{
        background: 'linear-gradient(180deg, #c9a227 0%, #a08020 50%, #806515 100%)',
        borderRadius: '3px',
        border: '2px solid #5c4a12',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.4)',
      }}
    >
      <div className="font-fell text-xs" style={{ color: '#3d3210', textShadow: '0 1px 0 rgba(255,255,255,0.3)' }}>
        {label}
        {noteKey && <CartographerNote noteKey={noteKey} />}
      </div>
      <div className="font-pirata text-lg flex items-center justify-center gap-1" style={{ color: '#1a1510', textShadow: '0 1px 0 rgba(255,255,255,0.2)' }}>
        {value}
        {tick === 'up' && <span className="text-emerald-800 animate-pulse">▲</span>}
        {tick === 'down' && <span className="text-red-800 animate-pulse">▼</span>}
      </div>
      {subvalue && (
        <div className="font-fell text-xs" style={{ color: '#4a3d20' }}>{subvalue}</div>
      )}
    </div>
  );

  // Ink divider
  const InkDivider = () => (
    <div className="my-4 flex items-center justify-center gap-3">
      <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, #5c4a32, #5c4a32)' }} />
      <span style={{ color: '#5c4a32' }}>✦</span>
      <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, #5c4a32, #5c4a32, transparent)' }} />
    </div>
  );

  // ============================================================================
  // Note Manager — Global pointermove tracking (notes are purely ephemeral)
  // ============================================================================
  // Notes close IMMEDIATELY when pointer leaves anchor bounds.
  // No "hover the note" behavior. No persistence. Purely transient annotations.
  // ============================================================================
  const [activeNote, setActiveNote] = useState(null);
  const [noteAnchorRect, setNoteAnchorRect] = useState(null);
  const anchorRectRef = useRef(null);

  const close = () => {
    setActiveNote(null);
    setNoteAnchorRect(null);
    anchorRectRef.current = null;
  };

  // Global tracking: pointermove, scroll, resize, escape
  useEffect(() => {
    if (!activeNote || !anchorRectRef.current) return;

    const rect = anchorRectRef.current;
    const pad = 8; // small padding around anchor

    const onPointerMove = (e) => {
      const x = e.clientX;
      const y = e.clientY;
      const inside = x >= (rect.left - pad) && x <= (rect.right + pad) &&
                     y >= (rect.top - pad) && y <= (rect.bottom + pad);
      if (!inside) close();
    };

    const onScroll = () => close();
    const onResize = () => close();
    const onKeyDown = (e) => { if (e.key === 'Escape') close(); };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeNote]);

  const noteManager = {
    activeNote,
    show: (noteKey, rect) => {
      // Opening a new note closes any existing one
      anchorRectRef.current = rect;
      setActiveNote(noteKey);
      setNoteAnchorRect(rect);
    },
    forceClose: close,
  };

  const notePosition = computePosition(noteAnchorRect);

  return (
    <CartographerNotesContext.Provider value={noteManager}>
      <CartographerNotesOverlay activeNote={activeNote} position={notePosition} />
    <div className="min-h-screen p-4 relative overflow-hidden" style={{
      background: 'linear-gradient(180deg, #1a1510 0%, #0f0d0a 100%)',
      fontFamily: "'IM Fell English', 'Times New Roman', serif",
    }}>
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Pirata+One&family=IM+Fell+English:ital@0;1&display=swap');

        .font-pirata { font-family: 'Pirata One', cursive; }
        .font-fell { font-family: 'IM Fell English', serif; }

        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes flicker {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        @keyframes noteSlideDown {
          0% { opacity: 0; transform: translateY(-4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes noteSlideUp {
          0% { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        input[type="number"] {
          font-family: 'IM Fell English', serif;
        }
      `}</style>

      {/* Floating Particles */}
      {particles.map(p => (
        <div key={p.id} className="fixed pointer-events-none text-2xl z-50 font-pirata" style={{
          left: `${p.x}%`, top: `${p.y}%`,
          transform: `rotate(${p.rotation}deg) scale(${p.scale})`,
          opacity: p.opacity,
          color: '#ffd700',
          textShadow: '0 0 10px rgba(255, 215, 0, 0.8)',
        }}>
          {getParticleEmoji(p.type)}
        </div>
      ))}

      {/* Discovery Celebration Overlay — True Viewport Center */}
      {discoveryAnimation && (
        <div
          className="pointer-events-none"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {/* Golden radial glow background */}
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(circle at 50% 50%, rgba(201, 162, 39, 0.5) 0%, rgba(0, 0, 0, 0.6) 70%)',
              animation: 'flicker 0.5s ease-in-out infinite',
            }}
          />

          {/* Spinning conic gradient (full discovery only) */}
          {discoveryAnimation === 'full' && (
            <div
              className="absolute"
              style={{
                width: '500px',
                height: '500px',
                background: 'conic-gradient(from 0deg, transparent, rgba(255, 215, 0, 0.25), transparent, rgba(255, 215, 0, 0.25), transparent)',
                animation: 'spin 8s linear infinite',
              }}
            />
          )}

          {/* Centered Celebration Card */}
          <div
            className={`relative text-center px-8 py-6 rounded ${
              discoveryAnimation === 'full' ? 'animate-bounce' : ''
            }`}
            style={{
              background: discoveryAnimation === 'full'
                ? 'linear-gradient(180deg, rgba(61, 50, 16, 0.95) 0%, rgba(45, 36, 12, 0.95) 100%)'
                : 'rgba(61, 50, 16, 0.9)',
              border: '3px solid #c9a227',
              boxShadow: '0 0 60px rgba(255, 215, 0, 0.4), 0 0 120px rgba(201, 162, 39, 0.2)',
            }}
          >
            <div
              className={`font-pirata ${discoveryAnimation === 'full' ? 'text-6xl mb-4' : 'text-4xl mb-2'}`}
              style={{ color: '#ffd700', textShadow: '0 0 20px rgba(255, 215, 0, 0.8), 2px 2px 0 #5c4a12' }}
            >
              ☠ ✦ ⚓
            </div>
            <h1
              className={`font-pirata mb-2 ${discoveryAnimation === 'full' ? 'text-5xl' : 'text-2xl'}`}
              style={{ color: '#ffd700', textShadow: '0 0 20px rgba(255, 215, 0, 0.8), 3px 3px 0 #3d3210' }}
            >
              {discoveryAnimation === 'full' ? 'TREASURE DISCOVERED!' : 'TREASURE WAS FOUND!'}
            </h1>
            <p
              className={`font-fell italic ${discoveryAnimation === 'full' ? 'text-xl' : 'text-sm'}`}
              style={{ color: '#f5e6c8' }}
            >
              {discoveryAnimation === 'full' ? 'The expedition celebrates!' : 'While ye were away...'}
            </p>
          </div>
        </div>
      )}

      {/* Full Log Modal */}
      {showFullLog && (
        <div
          className="fixed inset-0 z-50"
          style={{ background: 'rgba(0, 0, 0, 0.85)' }}
          onClick={() => setShowFullLog(false)}
        >
          <div
            className="fixed inset-0 flex items-center justify-center p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="relative w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-sm"
              style={{
                background: 'linear-gradient(180deg, #f0e6d2 0%, #e8dcc4 30%, #ddd0b8 70%, #d4c4a0 100%)',
                boxShadow: '0 25px 50px rgba(0,0,0,0.5), inset 0 2px 0 rgba(255,255,255,0.3), inset 0 -2px 0 rgba(0,0,0,0.1)',
                border: '3px solid #8b7355',
              }}
            >
              {/* Header */}
              <div className="p-4 border-b" style={{ borderColor: 'rgba(93, 74, 50, 0.3)' }}>
                <div className="flex items-center justify-between">
                  <h2 className="font-pirata text-2xl" style={{ color: '#3d3210' }}>
                    ⚓ Captain's Log — Complete Record
                  </h2>
                  <button
                    onClick={() => setShowFullLog(false)}
                    className="font-fell text-xl px-3 py-1 rounded hover:opacity-70 transition-opacity"
                    style={{ color: '#5c4a32' }}
                  >
                    ✕
                  </button>
                </div>
                <p className="font-fell text-sm italic mt-1" style={{ color: '#6b5c47' }}>
                  Expedition № {epochId} — {orderedLog.length} entries recorded
                </p>
              </div>

              {/* Scrollable Log Entries */}
              <div
                className="overflow-y-auto p-4 font-fell"
                style={{ maxHeight: 'calc(80vh - 100px)', color: '#3d2818' }}
              >
                {orderedLog.length === 0 ? (
                  <p className="text-center italic py-8" style={{ color: '#6b5c47' }}>
                    The pages remain blank… for now.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {orderedLog.map((entry, i) => (
                      <div
                        key={i}
                        className="relative pl-4 py-2 border-l-2"
                        style={{
                          borderColor: entry.type === 'discovery' ? '#c9a227' :
                                       entry.type === 'result' ? 'rgba(93, 74, 50, 0.2)' :
                                       'rgba(93, 74, 50, 0.4)',
                        }}
                      >
                        <span className="text-xs italic block mb-1" style={{ color: '#8b7355' }}>
                          Entry #{orderedLog.length - i}
                        </span>
                        <span
                          className={entry.type === 'result' ? 'text-sm' : ''}
                          style={{
                            color: entry.type === 'discovery' ? '#3d3210' :
                                   entry.type === 'result' ? '#5c4a32' :
                                   '#4a3828',
                            fontWeight: entry.type === 'discovery' ? '600' : 'normal',
                            fontStyle: entry.type === 'result' ? 'normal' : 'italic',
                          }}
                        >
                          {entry.message}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto relative z-10">
        {/* Header with Wallet/Network */}
        <div className="mb-6 pb-4">
          {/* Top bar: Network + Wallet */}
          <div className="flex justify-end items-center gap-3 mb-4">
            {/* Network Badge */}
            <div
              className="px-3 py-1.5 rounded flex items-center gap-2"
              style={{
                background: isWrongNetwork
                  ? 'linear-gradient(180deg, #5c3030 0%, #4a2020 100%)'
                  : 'linear-gradient(180deg, #1a3a5c 0%, #0f2840 100%)',
                border: isWrongNetwork ? '1px solid #8b4040' : '1px solid #2a5a8c',
              }}
            >
              {isWrongNetwork ? (
                <>
                  <span style={{ color: '#ff8888' }}>⚠</span>
                  <span className="font-fell text-sm" style={{ color: '#ffaaaa' }}>Wrong Network</span>
                  <button
                    onClick={() => switchChain && switchChain({ chainId: SUPPORTED_CHAIN_ID })}
                    className="ml-1 px-2 py-0.5 rounded text-xs font-fell"
                    style={{ background: '#5c3030', color: '#ffcccc', border: '1px solid #8b4040' }}
                  >
                    Switch to {SUPPORTED_CHAIN_NAME}
                  </button>
                </>
              ) : (
                <>
                  <span style={{ color: '#60a5fa' }}>◆</span>
                  <span className="font-fell text-sm" style={{ color: '#93c5fd' }}>{SUPPORTED_CHAIN_NAME}</span>
                </>
              )}
            </div>

            {/* Wallet Display */}
            <div className="relative">
              {isConnected ? (
                <button
                  onClick={() => setWalletDropdownOpen(!walletDropdownOpen)}
                  className="px-4 py-1.5 rounded flex items-center gap-2"
                  style={{
                    background: 'linear-gradient(180deg, #3d3210 0%, #2d2408 100%)',
                    border: '1px solid #5c4a32',
                  }}
                >
                  <span style={{ color: '#c9a227' }}>●</span>
                  <span className="font-fell text-sm" style={{ color: '#e8dcc4' }}>
                    {shortenAddress(address)}
                  </span>
                  <span style={{ color: '#8b7355' }}>{walletDropdownOpen ? '▲' : '▼'}</span>
                </button>
              ) : (
                <ConnectButton showBalance={false} chainStatus="icon" />
              )}

              {/* Dropdown */}
              {walletDropdownOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-64 rounded overflow-hidden z-50"
                  style={{
                    background: 'linear-gradient(180deg, #f0e6d2 0%, #e8dcc4 100%)',
                    border: '2px solid #8b7355',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  }}
                >
                  {/* Address */}
                  <div className="p-3 border-b" style={{ borderColor: '#c9b896' }}>
                    <div className="font-fell text-xs" style={{ color: '#6b5c47' }}>Connected Wallet</div>
                    <div className="font-pirata text-sm mt-1" style={{ color: '#3d3210' }}>
                      {shortenAddress(address)}
                    </div>
                  </div>

                  {/* Balances */}
                  <div className="p-3 border-b" style={{ borderColor: '#c9b896' }}>
                    <div className="font-fell text-xs mb-2" style={{ color: '#6b5c47' }}>Balances</div>
                    <div className="space-y-1">
                      <div className="flex justify-between font-fell text-sm">
                        <span style={{ color: '#5c4a32' }}>● USDC</span>
                        <span style={{ color: '#3d3210' }}>${balance.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-fell text-sm">
                        <span style={{ color: '#5c4a32' }}>⊕ HUNT</span>
                        <span style={{ color: '#3d3210' }}>{huntBalance.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-fell text-sm">
                        <span style={{ color: '#5c4a32' }}>◇ MAP</span>
                        <span style={{ color: '#3d3210' }}>{mapBalance.toFixed(4)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="p-2">
                    <button
                      onClick={copyAddress}
                      className="w-full py-2 rounded font-fell text-sm mb-1"
                      style={{ background: 'rgba(92, 74, 50, 0.1)', color: '#5c4a32' }}
                    >
                      Copy Address
                    </button>
                    <button
                      onClick={disconnectWallet}
                      className="w-full py-2 rounded font-fell text-sm"
                      style={{ background: 'rgba(139, 34, 34, 0.1)', color: '#8b2222' }}
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Title */}
          <div className="text-center">
            <h1 className="font-pirata text-5xl mb-2" style={{
              color: '#c9a227',
              textShadow: '3px 3px 0 #3d3210, 0 0 20px rgba(201, 162, 39, 0.3)'
            }}>
              ⚓ TREASURE HUNT ⚓
            </h1>
            <p className="font-fell italic" style={{ color: '#8b7355' }}>
              An Autonomous Economic Game of Discovery
            </p>
          </div>
          <InkDivider />
        </div>

        {/* Stats Bar (canonical: Expedition State) */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <BrassPlaque label="Expedition" value={`№ ${epochId}`} noteKey="expedition" />
          <BrassPlaque label="Map Size" value={`$${M.toFixed(0)}`} noteKey="mapSize" />
          <BrassPlaque label="Contributions" value={N0.toLocaleString()} noteKey="contributions" />
          <BrassPlaque label="Emission Rate" value={`${getEmissionRate(N0).toFixed(2)}×`} noteKey="emissionRate" />
        </div>

        {/* Treasure Chest (canonical section) */}
        <ParchmentPanel className="p-4 mb-6" glow={treasureGlow || discoveryAnimation}>
          <div className="flex justify-between mb-2">
            <span className="font-pirata text-xl" style={{ color: '#3d3210' }}>
              ⚓ The Treasure Chest
              <CartographerNote noteKey="treasureChest" />
            </span>
            <span className="font-pirata text-xl" style={{ color: '#5c4a12' }}>${J.toFixed(2)} / ${M.toFixed(0)}</span>
          </div>
          <div className="h-8 rounded overflow-hidden relative" style={{
            background: '#c9b896',
            border: '2px solid #8b7355',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
          }}>
            <div className="h-full transition-all duration-500 flex items-center justify-end pr-2" style={{
              width: `${Math.min(progressPercent, 100)}%`,
              background: treasureGlow
                ? 'linear-gradient(90deg, #ffd700 0%, #ffec8b 50%, #ffd700 100%)'
                : 'linear-gradient(90deg, #8b6914 0%, #c9a227 50%, #8b6914 100%)',
              boxShadow: treasureGlow ? '0 0 15px rgba(255, 215, 0, 0.6)' : 'none',
            }}>
              {progressPercent > 15 && (
                <span className="font-pirata text-sm" style={{ color: '#3d3210', textShadow: '0 1px 0 rgba(255,255,255,0.3)' }}>
                  {progressPercent.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
          <p className="font-fell text-sm text-center mt-2 italic" style={{ color: '#6b5c47' }}>
            {treasureGlow ? "The chest rattles as it fills…" : "The closer we draw, the quieter the sea becomes."}
          </p>
          <div className="flex justify-center gap-6 mt-2 font-fell text-xs" style={{ color: '#6b5c47' }}>
            <span>freeUSDC: ${freeUsdcDisplay}</span>
            <span>Total USDC: ${totalUsdcDisplay}</span>
          </div>
        </ParchmentPanel>

        {/* Main Grid: 3 columns */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {/* Left: Exploration (canonical section) */}
          <ParchmentPanel className="p-4">
            <h2 className="font-pirata text-xl mb-3 text-center" style={{ color: '#3d3210' }}>
              🧭 Exploration
              <CartographerNote noteKey="beginExploration" />
            </h2>

            <div className="mb-3">
              <label className="font-pirata text-sm" style={{ color: '#5c4a32' }}>Exploration Contribution (USDC)</label>
              <input
                type="number"
                min={liveMinBet}
                max={liveMaxBet}
                step="0.01"
                value={betAmount}
                onChange={(e) => setBetAmount(parseFloat(e.target.value) || 0)}
                className="w-full rounded p-2 mt-1"
                style={{
                  background: '#f5e6c8',
                  border: '2px solid #8b7355',
                  color: '#3d3210',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
                }}
                disabled={isSpinning || !interactionsEnabled || txBusy}
             />
              <div className="font-fell text-xs mt-1 italic" style={{ color: '#6b5c47' }}>
                Every expedition welcomes at least one step.
              </div>
            </div>

            {readEnabled && needsEngineApproval && (
              <WoodButton
                onClick={approveUsdcForEngine}
                disabled={isSpinning || betAmountRaw === 0n || txBusy}
                variant="secondary"
                className="w-full py-2 mb-2"
              >
                Approve USDC
              </WoodButton>
            )}

            <WoodButton
              onClick={placeBet}
              disabled={isSpinning || betAmount < liveMinBet || !interactionsEnabled || (needsEngineApproval && readEnabled) || txBusy}
              className="w-full py-3 text-xl"
            >
              {isSpinning ? '🧭 The oracle peers into the deep…' : '🧭 Begin Exploration'}
            </WoodButton>

            {lastOutcome && !isSpinning && (
              <div className="mt-3 p-3 rounded" style={{
                background: '#d4c4a8',
                border: '2px solid #8b7355',
              }}>
                <div className="font-pirata text-center mb-1" style={{ color: '#3d3210' }}>
                  {lastOutcome.label || lastOutcome.name}
                </div>
                {lastFateMessage && (
                  <div className="font-fell text-sm italic text-center" style={{ color: '#5c4a32' }}>
                    "{lastFateMessage}"
                  </div>
                )}
              </div>
            )}

            {DEMO_MODE ? (
              <button
                onClick={triggerDemoDiscovery}
                className="w-full mt-3 py-1 rounded font-fell text-xs opacity-50 hover:opacity-100 transition-opacity"
                style={{ background: 'transparent', color: '#6b5c47', border: '1px dashed #8b7355' }}
              >
                [Demo: Trigger Discovery]
              </button>
            ) : null}
          </ParchmentPanel>

          {/* Center: Holdings (canonical labels) */}
          <ParchmentPanel className="p-4">
            <h2 className="font-pirata text-xl mb-3 text-center" style={{ color: '#3d3210' }}>
              ☠ Holdings
            </h2>

            <div className="space-y-2">
              {/* USDC */}
              <div className="flex justify-between items-center p-2 rounded" style={{ background: '#c9b896', border: '1px solid #8b7355' }}>
                <span className="font-pirata" style={{ color: '#5c4a32' }}>● Doubloons</span>
                <span className="font-pirata text-lg" style={{ color: '#3d3210' }}>${balance.toFixed(2)}</span>
              </div>

              {/* HUNT Wallet - canonical: "Yer HUNT" */}
              <div className="flex justify-between items-center p-2 rounded" style={{ background: '#c9b896', border: '1px solid #8b7355' }}>
                <div>
                  <span className="font-pirata" style={{ color: '#5c4a32' }}>
                    ⊕ Yer HUNT
                    <CartographerNote noteKey="huntWallet" />
                  </span>
                  <div className="font-fell text-xs italic" style={{ color: '#8b7355' }}>Earned through exploration</div>
                </div>
                <div className="text-right">
                  <span className="font-pirata" style={{ color: '#3d3210' }}>{huntBalance.toFixed(2)}</span>
                  <div className="font-fell text-xs italic" style={{ color: '#6b5c47' }}>≈ ${(huntBalance * currentHuntPrice).toFixed(2)}</div>
                </div>
              </div>

              {/* HUNT Staked - canonical: "HUNT Aboard Ship" */}
              <div className="flex justify-between items-center p-2 rounded" style={{ background: '#b8a886', border: '1px solid #8b7355' }}>
                <span className="font-pirata" style={{ color: '#5c4a32' }}>
                  ⚓ HUNT Aboard Ship
                  <CartographerNote noteKey="huntStaked" />
                </span>
                <div className="text-right">
                  <span className="font-pirata" style={{ color: '#3d3210' }}>{stakedHunt.toFixed(2)}</span>
                  <div className="font-fell text-xs italic" style={{ color: '#6b5c47' }}>≈ ${(stakedHunt * currentHuntPrice).toFixed(2)}</div>
                </div>
              </div>

              {/* MAP */}
              <div className="flex justify-between items-center p-2 rounded transition-all duration-500" style={{
                background: mapPriceTick ? '#a8c4b8' : '#c9b896',
                border: mapPriceTick ? '2px solid #5c8b6b' : '1px solid #8b7355'
              }}>
                <span className="font-pirata" style={{ color: '#5c4a32' }}>
                  ◇ MAP
                  <CartographerNote noteKey="map" />
                </span>
                <div className="text-right flex items-center gap-2">
                  <div>
                    <span className="font-pirata" style={{ color: '#3d3210' }}>{mapBalance.toFixed(2)}</span>
                    <div className="font-fell text-xs italic" style={{ color: '#6b5c47' }}>≈ ${(mapBalance * currentMapPrice).toFixed(2)}</div>
                  </div>
                  {mapPriceTick === 'up' && <span className="font-pirata text-emerald-700 animate-pulse">▲</span>}
                  {mapPriceTick === 'down' && <span className="font-pirata text-red-700 animate-pulse">▼</span>}
                </div>
              </div>

              {/* Pending Rewards */}
              <div className="flex justify-between items-center p-2 rounded" style={{ background: '#a8c4a8', border: '1px solid #5c8b5c' }}>
                <span className="font-pirata" style={{ color: '#3d5c3d' }}>
                  ✦ Pending
                  <CartographerNote noteKey="globalDiscovery" />
                </span>
                <div className="text-right">
                  <span className="font-pirata text-lg" style={{ color: '#2d4a2d' }}>${pendingRewards.toFixed(2)}</span>
                  <div className="font-fell text-xs italic" style={{ color: '#3d5c3d' }}>{pendingMapRewards.toFixed(4)} MAP</div>
                </div>
              </div>

              {(pendingRewards > 0 || pendingMapRewards > 0) && (
                <WoodButton onClick={claimRewards} disabled={!interactionsEnabled || txBusy} className="w-full py-2">
                  Claim Yer Rewards
                </WoodButton>
              )}
            </div>
          </ParchmentPanel>

          {/* Right: Ship's Hold (canonical staking section) */}
          <ParchmentPanel className="p-4">
            <h2 className="font-pirata text-xl mb-3 text-center" style={{ color: '#3d3210' }}>
              ⚓ Ship's Hold
              <CartographerNote noteKey="huntStaked" />
            </h2>

            <p className="font-fell text-sm text-center italic mb-3" style={{ color: '#6b5c47' }}>
              One exploration per expedition earns a seat at the table.
            </p>

            {/* Staking Stats */}
            <div className="space-y-2 mb-4">
              <div className="flex justify-between font-fell" style={{ color: '#5c4a32' }}>
                <span>Below Deck</span>
                <span className="font-pirata" style={{ color: '#3d3210' }}>{stakedHunt.toFixed(2)} HUNT</span>
              </div>
              <div className="flex justify-between font-fell" style={{ color: '#5c4a32' }}>
                <span>Available</span>
                <span className="font-pirata" style={{ color: '#3d3210' }}>{huntBalance.toFixed(2)} HUNT</span>
              </div>
            </div>

            {/* Cooldown Status */}
            {cooldownStart && (
              <div className="p-2 rounded mb-3 text-center" style={{ background: '#d4c4a0', border: '2px solid #8b7355' }}>
                <div className="font-pirata" style={{ color: '#8b6914' }}>
                  Gangplank Lowering
                  <CartographerNote noteKey="stakingCooldown" />
                </div>
                <div className="font-fell text-xs italic" style={{ color: '#6b5c47' }}>{formatCooldown(cooldownRemaining)}</div>
              </div>
            )}

            {/* Qualification Status */}
            <div className="p-2 rounded mb-3 text-center" style={{
              background: hasQualifyingBet && stakedHunt > 0 ? '#a8c4a8' : '#d4c4a0',
              border: hasQualifyingBet && stakedHunt > 0 ? '2px solid #5c8b5c' : '1px solid #8b7355',
            }}>
              {hasQualifyingBet && stakedHunt > 0 ? (
                <span className="font-fell italic" style={{ color: '#2d4a2d' }}>✓ Seat earned for this expedition</span>
              ) : stakedHunt > 0 ? (
                <span className="font-fell italic" style={{ color: '#6b5c47' }}>Explore once to earn a seat</span>
              ) : (
                <span className="font-fell italic" style={{ color: '#6b5c47' }}>Stow HUNT to join the crew's share</span>
              )}
            </div>

            {/* Stake Input */}
            {huntBalance > 0 && !cooldownStart && (
              <div className="mb-3">
                <input
                  type="number"
                  min="0"
                  max={huntBalance}
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(parseFloat(e.target.value) || 0)}
                  placeholder="Amount to stow"
                  className="w-full rounded p-2 text-sm"
                  style={{
                    background: '#f5e6c8',
                    border: '2px solid #8b7355',
                    color: '#3d3210',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
                  }}
                  disabled={!interactionsEnabled || txBusy}
               />
                {readEnabled && needsStakingApproval && (
                  <WoodButton onClick={approveHuntForStaking} disabled={stakeAmountRaw === 0n || txBusy} variant="secondary" className="w-full mt-2 py-2">
                    Approve HUNT
                  </WoodButton>
                )}
                <WoodButton
                  onClick={() => stake(stakeAmount)}
                  disabled={!interactionsEnabled || (needsStakingApproval && readEnabled) || txBusy}
                  className="w-full mt-2 py-2"
                >
                  Stow HUNT Below Deck
                </WoodButton>
              </div>
            )}

            {/* Withdraw Controls */}
            {stakedHunt > 0 && !cooldownStart && (
              <WoodButton onClick={initiateWithdraw} disabled={!interactionsEnabled || txBusy} variant="secondary" className="w-full py-2">
                Prepare to Disembark
              </WoodButton>
            )}

            {cooldownStart && cooldownRemaining > 0 && (
              <WoodButton onClick={cancelWithdraw} disabled={!interactionsEnabled || txBusy} variant="secondary" className="w-full py-2">
                Cancel Disembarkation
              </WoodButton>
            )}

            {cooldownStart && cooldownRemaining === 0 && (
              <WoodButton onClick={completeWithdraw} disabled={!interactionsEnabled || txBusy} className="w-full py-2">
                Complete Withdrawal
              </WoodButton>
            )}
          </ParchmentPanel>
        </div>

        {/* MAP Panel - Treasure Map Background with Pinned Card Overlays */}
        <div
          className="relative mb-6 overflow-hidden"
          style={{
            borderRadius: '6px',
            border: mapGlow ? '4px solid #c9a227' : '3px solid #5c4a32',
            boxShadow: mapGlow
              ? '0 0 40px rgba(201, 162, 39, 0.5), 0 8px 24px rgba(0,0,0,0.5)'
              : '0 8px 24px rgba(0,0,0,0.5)',
            minHeight: '220px',
          }}
        >
          {/* Treasure Map Background Layer */}
          <div
            className="absolute inset-0"
            style={{
              background: `
                linear-gradient(135deg,
                  #c9a86c 0%,
                  #d4b87a 15%,
                  #c19a5a 30%,
                  #d8c088 45%,
                  #b8944c 60%,
                  #c9a86c 75%,
                  #d4b87a 90%,
                  #b89050 100%
                )
              `,
            }}
         />

          {/* Parchment texture */}
          <div
            className="absolute inset-0"
            style={{
              background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
              opacity: 0.12,
              mixBlendMode: 'multiply',
            }}
         />

          {/* Map illustration layer - coastlines, islands, compass */}
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 500 250"
            preserveAspectRatio="xMidYMid slice"
            style={{ opacity: 0.35 }}
          >
            {/* Coastline paths */}
            <path d="M0,180 Q60,150 100,170 T200,155 T300,175 T400,150 T500,170" fill="none" stroke="#5c3d1e" strokeWidth="2" />
            <path d="M0,50 Q80,70 120,45 T240,65 T360,40 T480,60 L500,55" fill="none" stroke="#5c3d1e" strokeWidth="1.5" />

            {/* Island masses */}
            <ellipse cx="400" cy="120" rx="45" ry="28" fill="#a08050" fillOpacity="0.4" stroke="#5c3d1e" strokeWidth="1" />
            <ellipse cx="80" cy="110" rx="35" ry="22" fill="#a08050" fillOpacity="0.3" stroke="#5c3d1e" strokeWidth="1" />

            {/* Mountain symbols on islands */}
            <path d="M390,115 L400,100 L410,115" fill="none" stroke="#5c3d1e" strokeWidth="1" />
            <path d="M395,118 L402,107 L409,118" fill="none" stroke="#5c3d1e" strokeWidth="0.8" />

            {/* Palm trees */}
            <path d="M75,105 L75,115 M72,105 Q75,100 78,105 M70,107 Q75,102 80,107" fill="none" stroke="#5c3d1e" strokeWidth="0.8" />

            {/* Compass rose */}
            <g transform="translate(440, 45)">
              <circle cx="0" cy="0" r="18" fill="none" stroke="#5c3d1e" strokeWidth="1" />
              <path d="M0,-15 L3,0 L0,15 L-3,0 Z" fill="#5c3d1e" fillOpacity="0.5" />
              <path d="M-15,0 L0,3 L15,0 L0,-3 Z" fill="#5c3d1e" fillOpacity="0.3" />
              <text x="0" y="-22" textAnchor="middle" fontSize="8" fill="#5c3d1e" fontFamily="serif">N</text>
            </g>

            {/* Dotted trail path */}
            <path d="M50,140 Q150,100 250,130 T400,110" fill="none" stroke="#8b4513" strokeWidth="2" strokeDasharray="8,6" strokeOpacity="0.6" />

            {/* X marks the spot */}
            <g transform="translate(250, 125)">
              <path d="M-12,-12 L12,12 M12,-12 L-12,12" stroke="#8b2500" strokeWidth="3" strokeLinecap="round" />
            </g>

            {/* Sea waves */}
            <path d="M20,200 Q35,195 50,200 T80,200 T110,200" fill="none" stroke="#5c3d1e" strokeWidth="0.8" strokeOpacity="0.5" />
            <path d="M320,30 Q335,25 350,30 T380,30" fill="none" stroke="#5c3d1e" strokeWidth="0.8" strokeOpacity="0.5" />

            {/* Ship silhouette */}
            <g transform="translate(150, 200)" opacity="0.4">
              <path d="M0,0 L20,0 L25,-5 L-5,-5 Z" fill="#5c3d1e" />
              <path d="M10,-5 L10,-20 L20,-10 L10,-10" fill="#5c3d1e" />
            </g>

            {/* Sea serpent hint */}
            <path d="M480,180 Q470,170 475,160 Q480,150 485,160" fill="none" stroke="#5c3d1e" strokeWidth="1.5" strokeOpacity="0.4" />
          </svg>

          {/* Aged stain marks */}
          <div className="absolute" style={{ top: '15%', left: '5%', width: '100px', height: '70px', background: 'radial-gradient(ellipse, rgba(120, 80, 30, 0.2) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div className="absolute" style={{ bottom: '20%', right: '10%', width: '80px', height: '80px', background: 'radial-gradient(ellipse, rgba(100, 70, 30, 0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />

          {/* Vignette overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, transparent 40%, rgba(60, 40, 20, 0.4) 100%)',
            }}
         />

          {/* Glow overlay when discovery */}
          {mapGlow && (
            <div
              className="absolute inset-0 pointer-events-none animate-pulse"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(255, 215, 0, 0.2) 0%, transparent 60%)',
              }}
           />
          )}

          {/* Content layer with pinned card overlays */}
          <div className="relative z-10 p-4">
            {/* Header row */}
            <div className="flex items-center justify-between mb-4">
              {/* Title card */}
              <div
                className="relative px-4 py-2"
                style={{
                  background: 'linear-gradient(180deg, rgba(232, 220, 196, 0.92) 0%, rgba(212, 196, 160, 0.88) 100%)',
                  border: '1px solid #8b7355',
                  borderRadius: '3px',
                  boxShadow: '2px 3px 6px rgba(0,0,0,0.3)',
                }}
              >
                {/* Brass tack */}
                <div className="absolute -top-1 left-3 w-2 h-2 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #d4a840 0%, #8b6914 100%)', boxShadow: '0 1px 2px rgba(0,0,0,0.4)' }} />
                <h2 className="font-pirata text-xl flex items-center gap-2" style={{ color: '#3d3210' }}>
                  ◇ The Cartographer's Map
                  <CartographerNote noteKey="map" />
                  {mapPriceTick === 'up' && <span className="text-emerald-700 animate-pulse">▲</span>}
                  {huntSupplyTick && <span className="font-fell text-amber-700 text-xs ml-1 italic">(tightening)</span>}
                </h2>
              </div>

            </div>

            {/* Stat cards row */}
            <div className="grid grid-cols-4 gap-3">
              {/* Pinned Card Component inline */}
              {[
                { label: 'Yer MAP', value: mapBalance.toFixed(2), sub: `≈ $${(mapBalance * currentMapPrice).toFixed(2)}`, noteKey: 'map' },
                { label: 'Price', value: `$${currentMapPrice.toFixed(4)}`, tick: mapPriceTick, noteKey: 'mapPrice' },
                { label: 'Total Supply', value: mapSupply.toFixed(0), noteKey: 'mapSupply' },
                { label: 'Map State', value: mapTier.name, icon: mapTier.icon, noteKey: 'mapState' },
              ].map((item, i) => (
                <div
                  key={i}
                  className="relative p-3 text-center"
                  style={{
                    background: 'linear-gradient(180deg, rgba(240, 232, 216, 0.9) 0%, rgba(220, 208, 184, 0.85) 100%)',
                    border: '1px solid #a08060',
                    borderRadius: '3px',
                    boxShadow: '2px 3px 8px rgba(0,0,0,0.25)',
                    transform: `rotate(${(i % 2 === 0 ? -0.5 : 0.5)}deg)`,
                  }}
                >
                  {/* Brass tack pin */}
                  <div
                    className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full"
                    style={{
                      background: 'radial-gradient(circle at 30% 30%, #e8c860 0%, #a08020 60%, #705810 100%)',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
                      border: '1px solid #6b5010',
                    }}
                 />
                  <div className="font-fell text-xs" style={{ color: '#6b5c47' }}>
                    {item.label}
                    {item.noteKey && <CartographerNote noteKey={item.noteKey} />}
                  </div>
                  <div className="font-pirata text-lg flex items-center justify-center gap-1 mt-1" style={{ color: '#3d3210' }}>
                    {item.icon && <span className="mr-1">{item.icon}</span>}
                    {item.value}
                    {item.tick === 'up' && <span className="text-emerald-700 text-sm">▲</span>}
                    {item.tick === 'down' && <span className="text-red-700 text-sm">▼</span>}
                  </div>
                  {item.sub && <div className="font-fell text-xs italic mt-0.5" style={{ color: '#8b7355' }}>{item.sub}</div>}
                </div>
              ))}
            </div>

            {/* Footer inscription */}
            <div
              className="mt-4 text-center"
              style={{
                background: 'linear-gradient(180deg, rgba(240, 232, 216, 0.8) 0%, rgba(220, 208, 184, 0.75) 100%)',
                border: '1px solid #a08060',
                borderRadius: '3px',
                padding: '6px 12px',
                boxShadow: '1px 2px 4px rgba(0,0,0,0.2)',
                display: 'inline-block',
                marginLeft: '50%',
                transform: 'translateX(-50%)',
              }}
            >
              <p className="font-fell text-sm italic" style={{ color: mapGlow ? '#8b6914' : '#5c4a32' }}>
                {mapGlow ? "✦ The map blazes with newfound glory! ✦" : "The map reveals itself slowly."}
              </p>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════════
              MAP TABLE — Buy/Sell tabs, calm and deterministic
          ═══════════════════════════════════════════════════════════════════════ */}
          <div
            className="relative border-t"
            style={{ borderColor: 'rgba(92, 74, 50, 0.4)' }}
          >
            {/* Action Card with Tabs */}
            <div className="relative z-10 p-4">
              <div
                className="relative max-w-md mx-auto"
                style={{
                  background: (mapPurchaseSuccess || mapSellSuccess)
                    ? 'linear-gradient(180deg, rgba(220, 235, 220, 0.95) 0%, rgba(205, 225, 205, 0.92) 100%)'
                    : 'linear-gradient(180deg, rgba(240, 232, 216, 0.95) 0%, rgba(220, 208, 184, 0.92) 100%)',
                  border: (mapPurchaseSuccess || mapSellSuccess) ? '1px solid rgba(90, 140, 90, 0.5)' : '1px solid #a08060',
                  borderRadius: '4px',
                  boxShadow: '3px 4px 12px rgba(0,0,0,0.25)',
                  transition: 'background 0.3s ease, border-color 0.3s ease',
                  overflow: 'hidden',
                }}
              >
                {/* Buy/Sell Tabs */}
                <div className="flex border-b" style={{ borderColor: 'rgba(92, 74, 50, 0.3)' }}>
                  <button
                    onClick={() => setMapTradeMode('buy')}
                    className="flex-1 py-3 font-pirata text-lg transition-all"
                    style={{
                      background: mapTradeMode === 'buy' ? 'rgba(92, 74, 50, 0.15)' : 'transparent',
                      color: mapTradeMode === 'buy' ? '#3d3210' : '#8b7355',
                      borderBottom: mapTradeMode === 'buy' ? '2px solid #5c4a32' : '2px solid transparent',
                    }}
                  >
                    Acquire
                  </button>
                  <button
                    onClick={() => setMapTradeMode('sell')}
                    className="flex-1 py-3 font-pirata text-lg transition-all"
                    style={{
                      background: mapTradeMode === 'sell' ? 'rgba(139, 34, 34, 0.1)' : 'transparent',
                      color: mapTradeMode === 'sell' ? '#6b3030' : '#8b7355',
                      borderBottom: mapTradeMode === 'sell' ? '2px solid #8b4040' : '2px solid transparent',
                    }}
                  >
                    Return
                  </button>
                </div>

                <div className="p-5">
                  {/* Price info */}
                  <div className="text-center mb-4">
                    <p className="font-fell text-xs italic" style={{ color: '#6b5c47' }}>
                      Current price: ${currentMapPrice.toFixed(4)} per MAP
                    </p>
                  </div>

                  {/* ═══ BUY TAB ═══ */}
                  {mapTradeMode === 'buy' && (
                    <>
                      {/* Error */}
                      {mapPurchaseError && (
                        <div className="mb-3 p-2 rounded text-center" style={{ background: 'rgba(139, 34, 34, 0.1)', border: '1px solid rgba(139, 34, 34, 0.2)' }}>
                          <span className="font-fell text-sm" style={{ color: '#8b2222' }}>{mapPurchaseError}</span>
                        </div>
                      )}

                      {/* Quick buttons */}
                      <div className="flex gap-2 mb-2">
                        {[25, 50, 75].map(pct => (
                          <button
                            key={pct}
                            onClick={() => setMapAmountPercent(pct)}
                            className="flex-1 py-1 rounded font-fell text-xs"
                            style={{
                              background: 'rgba(92, 74, 50, 0.1)',
                              color: '#5c4a32',
                              border: '1px solid rgba(92, 74, 50, 0.3)',
                            }}
                          >
                            {pct}%
                          </button>
                        ))}
                        <button
                          onClick={() => setMapAmountPercent(100)}
                          className="flex-1 py-1 rounded font-fell text-xs font-medium"
                          style={{
                            background: 'rgba(92, 74, 50, 0.15)',
                            color: '#5c4a32',
                            border: '1px solid rgba(92, 74, 50, 0.4)',
                          }}
                        >
                          MAX
                        </button>
                      </div>

                      {/* Input */}
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={mapPurchaseAmount}
                        onChange={(e) => {
                          setMapPurchaseAmount(e.target.value);
                          setMapPurchaseError(null);
                        }}
                        placeholder="USDC amount"
                        disabled={mapPurchasing || !interactionsEnabled || txBusy}
                        className="w-full rounded p-3 font-fell text-lg text-center mb-2"
                        style={{
                          background: '#faf6f0',
                          border: '1px solid #a08060',
                          color: '#3d3210',
                          opacity: mapPurchasing || !interactionsEnabled || txBusy ? 0.6 : 1,
                        }}
                      />
                      <div className="flex justify-between mb-3 font-fell text-xs" style={{ color: '#6b5c47' }}>
                        <span>Available: ${balance.toFixed(2)}</span>
                        {parseFloat(mapPurchaseAmount) > 0 && (
                          <span style={{ color: '#3d3210' }}>
                            ≈ {getEstimatedMapOut().toFixed(4)} MAP
                          </span>
                        )}
                      </div>

                      {readEnabled && needsMapApproval && (
                        <button
                          onClick={approveUsdcForMap}
                          disabled={mapPurchasing || mapPurchaseRaw === 0n || txBusy}
                          className="w-full py-2 rounded font-fell mb-2"
                          style={{
                            background: '#8b7355',
                            color: '#f5ece0',
                            opacity: (mapPurchasing || mapPurchaseRaw === 0n || txBusy) ? 0.6 : 1,
                            cursor: (mapPurchasing || mapPurchaseRaw === 0n || txBusy) ? 'not-allowed' : 'pointer',
                          }}
                        >
                          Approve USDC
                        </button>
                      )}

                      {/* Buy button */}
                      <button
                        onClick={handleMapPurchase}
                        disabled={mapPurchasing || !mapPurchaseAmount || parseFloat(mapPurchaseAmount) <= 0 || !interactionsEnabled || (needsMapApproval && readEnabled) || txBusy}
                        className="w-full py-3 rounded font-fell transition-opacity"
                        style={{
                          background: mapPurchasing ? '#8b7355' : '#5c4a32',
                          color: '#f5ece0',
                          opacity: (!mapPurchaseAmount || parseFloat(mapPurchaseAmount) <= 0 || !interactionsEnabled || (needsMapApproval && readEnabled) || txBusy) ? 0.5 : 1,
                          cursor: (mapPurchasing || !mapPurchaseAmount || parseFloat(mapPurchaseAmount) <= 0 || !interactionsEnabled || (needsMapApproval && readEnabled) || txBusy) ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {mapPurchasing ? 'Confirming...' : mapPurchaseSuccess ? '✓ Acquired' : 'Acquire MAP'}
                      </button>
                    </>
                  )}

                  {/* ═══ SELL TAB ═══ */}
                  {mapTradeMode === 'sell' && (
                    <>
                      {/* Error */}
                      {mapSellError && (
                        <div className="mb-3 p-2 rounded text-center" style={{ background: 'rgba(139, 34, 34, 0.1)', border: '1px solid rgba(139, 34, 34, 0.2)' }}>
                          <span className="font-fell text-sm" style={{ color: '#8b2222' }}>{mapSellError}</span>
                        </div>
                      )}

                      {/* Quick buttons */}
                      <div className="flex gap-2 mb-2">
                        {[25, 50, 75].map(pct => (
                          <button
                            key={pct}
                            onClick={() => setMapSellPercent(pct)}
                            className="flex-1 py-1 rounded font-fell text-xs"
                            style={{
                              background: 'rgba(139, 34, 34, 0.08)',
                              color: '#6b3030',
                              border: '1px solid rgba(139, 34, 34, 0.2)',
                            }}
                          >
                            {pct}%
                          </button>
                        ))}
                        <button
                          onClick={() => setMapSellPercent(100)}
                          className="flex-1 py-1 rounded font-fell text-xs font-medium"
                          style={{
                            background: 'rgba(139, 34, 34, 0.12)',
                            color: '#6b3030',
                            border: '1px solid rgba(139, 34, 34, 0.3)',
                          }}
                        >
                          MAX
                        </button>
                      </div>

                      {/* Input */}
                      <input
                        type="number"
                        min="0.0001"
                        step="0.0001"
                        value={mapSellAmount}
                        onChange={(e) => {
                          setMapSellAmount(e.target.value);
                          setMapSellError(null);
                        }}
                        placeholder="MAP amount"
                        disabled={mapSelling || !interactionsEnabled || txBusy}
                        className="w-full rounded p-3 font-fell text-lg text-center mb-2"
                        style={{
                          background: '#faf6f0',
                          border: '1px solid #a08060',
                          color: '#3d3210',
                          opacity: mapSelling || !interactionsEnabled || txBusy ? 0.6 : 1,
                        }}
                      />
                      <div className="flex justify-between mb-3 font-fell text-xs" style={{ color: '#6b5c47' }}>
                        <span>Your MAP: {mapBalance.toFixed(4)}</span>
                        {parseFloat(mapSellAmount) > 0 && (
                          <span style={{ color: '#3d3210' }}>
                            ≈ ${getEstimatedUsdcOut().toFixed(2)} USDC
                          </span>
                        )}
                      </div>

                      {/* Preview */}
                      {getSellPreview() && (
                        <div className="mb-3 p-3 rounded" style={{ background: 'rgba(92, 74, 50, 0.08)', border: '1px solid rgba(92, 74, 50, 0.15)' }}>
                          <div className="font-fell text-xs" style={{ color: '#6b5c47' }}>
                            <div className="flex justify-between mb-1">
                              <span>You return:</span>
                              <span style={{ color: '#5c4a32' }}>{getSellPreview().mapIn.toFixed(4)} MAP</span>
                            </div>
                            <div className="flex justify-between mb-1">
                              <span>You receive:</span>
                              <span style={{ color: '#3d3210' }}>${getSellPreview().usdcOut.toFixed(2)} USDC</span>
                            </div>
                            <div className="flex justify-between text-xs opacity-75">
                              <span>Price after:</span>
                              <span>${getSellPreview().priceAfter.toFixed(4)}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Sell button */}
                      <button
                        onClick={handleMapSell}
                        disabled={mapSelling || !mapSellAmount || parseFloat(mapSellAmount) <= 0 || parseFloat(mapSellAmount) > mapBalance || !interactionsEnabled || txBusy}
                        className="w-full py-3 rounded font-fell transition-opacity"
                        style={{
                          background: mapSelling ? '#8b5555' : '#8b4040',
                          color: '#f5ece0',
                          opacity: (!mapSellAmount || parseFloat(mapSellAmount) <= 0 || parseFloat(mapSellAmount) > mapBalance || !interactionsEnabled || txBusy) ? 0.5 : 1,
                          cursor: (mapSelling || !mapSellAmount || parseFloat(mapSellAmount) <= 0 || parseFloat(mapSellAmount) > mapBalance || !interactionsEnabled || txBusy) ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {mapSelling ? 'Confirming...' : mapSellSuccess ? '✓ Returned' : 'Return MAP to the Sea'}
                      </button>

                      {/* Warning */}
                      <p className="font-fell text-xs italic text-center mt-3" style={{ color: '#8b5c47' }}>
                        Returning MAP burns it from the supply.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* The Tides of Fortune - Matching Reference Image Exactly */}
        <div
          className="relative mb-6 overflow-hidden"
          style={{
            borderRadius: '6px',
            border: '3px solid #1a5a8a',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            minHeight: '220px',
          }}
        >
          {/* SVG Definitions */}
          <svg className="absolute" width="0" height="0">
            <defs>
              {/* Hull wood gradient - warm brown */}
              <linearGradient id="hullGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#C4A882" />
                <stop offset="25%" stopColor="#A8895C" />
                <stop offset="50%" stopColor="#8B7348" />
                <stop offset="75%" stopColor="#6B5538" />
                <stop offset="100%" stopColor="#5A4830" />
              </linearGradient>

              {/* Mast wood */}
              <linearGradient id="mastGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#7A6045" />
                <stop offset="50%" stopColor="#9A7855" />
                <stop offset="100%" stopColor="#6A5038" />
              </linearGradient>

              {/* Sail gradient - cream/off-white */}
              <linearGradient id="sailGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#F5EDE0" />
                <stop offset="100%" stopColor="#E0D4C0" />
              </linearGradient>
            </defs>
          </svg>

          {/* Sky - Vibrant cyan/turquoise matching reference */}
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg,
                #4DC8F0 0%,
                #45C0E8 20%,
                #3DB8E0 40%,
                #35B0D8 60%,
                #2DA8D0 80%,
                #28A0C8 100%
              )`,
            }}
         />

          {/* Cloud layer - wispy horizontal streaks like reference */}
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 600 260"
            preserveAspectRatio="xMidYMid slice"
          >
            {/* Wispy cloud streaks - horizontal flowing shapes */}
            {/* Left side streaks */}
            <path d="M-20,70 Q80,65 180,75 Q280,85 350,70"
                  fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="18" strokeLinecap="round" />
            <path d="M-40,90 Q60,85 150,95 Q240,105 320,88"
                  fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="14" strokeLinecap="round" />
            <path d="M-10,55 Q100,50 200,60 Q280,68 340,55"
                  fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="10" strokeLinecap="round" />

            {/* Center wispy streak */}
            <path d="M200,100 Q300,95 400,105 Q480,112 550,100"
                  fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="12" strokeLinecap="round" />

            {/* Ghostly skull in top right - clearly visible like reference */}
            <g transform="translate(520, 50)">
              {/* Skull cloud mass */}
              <ellipse cx="0" cy="0" rx="55" ry="45" fill="rgba(255,255,255,0.5)" />
              <ellipse cx="-5" cy="5" rx="48" ry="40" fill="rgba(255,255,255,0.6)" />

              {/* Left eye socket */}
              <ellipse cx="-18" cy="-8" rx="12" ry="14" fill="#4DC8F0" />
              <ellipse cx="-18" cy="-8" rx="10" ry="12" fill="#45C0E8" />

              {/* Right eye socket */}
              <ellipse cx="18" cy="-8" rx="12" ry="14" fill="#4DC8F0" />
              <ellipse cx="18" cy="-8" rx="10" ry="12" fill="#45C0E8" />

              {/* Nose cavity */}
              <ellipse cx="0" cy="12" rx="6" ry="10" fill="#4DC8F0" />
              <ellipse cx="0" cy="12" rx="5" ry="8" fill="#45C0E8" />

              {/* Subtle mouth area */}
              <path d="M-12,28 Q0,32 12,28" fill="none" stroke="rgba(69,192,232,0.4)" strokeWidth="3" />
            </g>

            {/* Additional wispy trails near skull */}
            <path d="M450,35 Q500,30 560,40 Q610,48 650,38"
                  fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="8" strokeLinecap="round" />
            <path d="M480,75 Q530,70 580,78 Q620,85 660,75"
                  fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="10" strokeLinecap="round" />
          </svg>

          {/* Ocean - Deep saturated blue matching reference */}
          <div
            className="absolute bottom-0 left-0 right-0"
            style={{
              height: '42%',
              background: `linear-gradient(180deg,
                #1565A0 0%,
                #1258A0 15%,
                #0E4A98 35%,
                #0A3C90 55%,
                #062E88 75%,
                #042080 100%
              )`,
            }}
         />

          {/* Ocean wave lines - horizontal like reference */}
          <svg
            className="absolute bottom-0 left-0 right-0"
            style={{ height: '42%' }}
            viewBox="0 0 600 110"
            preserveAspectRatio="none"
          >
            {/* Multiple horizontal wave highlight lines */}
            <path d="M0,8 L600,8" fill="none" stroke="rgba(80,160,220,0.4)" strokeWidth="1.5" />
            <path d="M0,16 L600,16" fill="none" stroke="rgba(70,150,210,0.35)" strokeWidth="1.2" />
            <path d="M0,24 L600,24" fill="none" stroke="rgba(60,140,200,0.3)" strokeWidth="1" />
            <path d="M0,32 L600,32" fill="none" stroke="rgba(50,130,190,0.25)" strokeWidth="1" />
            <path d="M0,42 L600,42" fill="none" stroke="rgba(45,120,180,0.2)" strokeWidth="1" />
            <path d="M0,52 L600,52" fill="none" stroke="rgba(40,110,170,0.18)" strokeWidth="1" />
            <path d="M0,64 L600,64" fill="none" stroke="rgba(35,100,160,0.15)" strokeWidth="1" />
            <path d="M0,78 L600,78" fill="none" stroke="rgba(30,90,150,0.12)" strokeWidth="1" />
            <path d="M0,94 L600,94" fill="none" stroke="rgba(25,80,140,0.1)" strokeWidth="1" />

            {/* Subtle wave variations */}
            <path d="M0,12 Q150,8 300,12 T600,12" fill="none" stroke="rgba(100,180,240,0.2)" strokeWidth="2" />
            <path d="M0,28 Q200,24 400,28 T600,28" fill="none" stroke="rgba(90,170,230,0.15)" strokeWidth="1.5" />
          </svg>

          {/* Subtle vignette */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center 60%, transparent 50%, rgba(0, 40, 80, 0.15) 100%)',
            }}
         />

          {/* Content overlay */}
          <div className="relative z-10 p-4">
            {/* Title card */}
            <div className="flex justify-center mb-3">
              <div
                className="relative px-5 py-2"
                style={{
                  background: 'linear-gradient(180deg, rgba(232, 220, 196, 0.95) 0%, rgba(212, 196, 160, 0.9) 100%)',
                  border: '1px solid #8b7355',
                  borderRadius: '3px',
                  boxShadow: '2px 3px 8px rgba(0,0,0,0.4)',
                }}
              >
                <div className="absolute -top-1 left-4 w-2 h-2 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #d4a840 0%, #8b6914 100%)', boxShadow: '0 1px 2px rgba(0,0,0,0.4)' }} />
                <div className="absolute -top-1 right-4 w-2 h-2 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #d4a840 0%, #8b6914 100%)', boxShadow: '0 1px 2px rgba(0,0,0,0.4)' }} />
                <h2 className="font-pirata text-xl text-center" style={{ color: '#3d3210' }}>
                  ⚓ The Tides of Fortune ⚓
                  <CartographerNote noteKey="tidesOfFortune" />
                </h2>
              </div>
            </div>

            {/* Fate cards */}
            <div className="grid grid-cols-7 gap-2 text-center">
              {outcomes.map((o, i) => (
                <div
                  key={i}
                  className={`relative p-2 ${lastOutcome?.name === o.name ? 'ring-2 ring-amber-400' : ''}`}
                  style={{
                    background: o.multiplier === 0
                      ? 'linear-gradient(180deg, rgba(196, 154, 154, 0.92) 0%, rgba(180, 140, 140, 0.88) 100%)'
                      : o.multiplier < 1
                        ? 'linear-gradient(180deg, rgba(196, 184, 154, 0.92) 0%, rgba(180, 168, 140, 0.88) 100%)'
                        : o.multiplier === 1
                          ? 'linear-gradient(180deg, rgba(201, 184, 150, 0.92) 0%, rgba(185, 168, 135, 0.88) 100%)'
                          : 'linear-gradient(180deg, rgba(154, 196, 168, 0.92) 0%, rgba(140, 180, 155, 0.88) 100%)',
                    border: '1px solid #8b7355',
                    borderRadius: '3px',
                    boxShadow: '1px 2px 4px rgba(0,0,0,0.3)',
                    transform: `rotate(${(i % 2 === 0 ? -0.5 : 0.5)}deg)`,
                  }}
                >
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #d4a840 0%, #8b6914 100%)', boxShadow: '0 1px 1px rgba(0,0,0,0.3)' }} />
                  <div className="font-pirata text-lg" style={{ color: '#3d3210' }}>{o.name}</div>
                  <div className="font-fell text-xs" style={{ color: '#5c4a32' }}>{(o.probability * 100).toFixed(0)}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Captain's Log — Physical Open Book Artifact */}
        <div
          className="relative mb-6"
          style={{
            perspective: '1200px',
          }}
        >
          {/* Open Book Container */}
          <div
            className="relative mx-auto"
            style={{
              maxWidth: '800px',
              minHeight: '280px',
            }}
          >
            {/* Leather Cover Background (visible at edges) */}
            <div
              className="absolute inset-0 rounded"
              style={{
                background: 'linear-gradient(135deg, #3d2817 0%, #2a1a0f 50%, #1f1409 100%)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
                border: '3px solid #1a0f08',
              }}
           />

            {/* Gold corner decorations */}
            <div className="absolute top-2 left-2 w-6 h-6 opacity-40" style={{ borderTop: '2px solid #c9a227', borderLeft: '2px solid #c9a227' }} />
            <div className="absolute top-2 right-2 w-6 h-6 opacity-40" style={{ borderTop: '2px solid #c9a227', borderRight: '2px solid #c9a227' }} />
            <div className="absolute bottom-2 left-2 w-6 h-6 opacity-40" style={{ borderBottom: '2px solid #c9a227', borderLeft: '2px solid #c9a227' }} />
            <div className="absolute bottom-2 right-2 w-6 h-6 opacity-40" style={{ borderBottom: '2px solid #c9a227', borderRight: '2px solid #c9a227' }} />

            {/* Book Interior - Two Pages */}
            <div className="relative flex mx-3 my-3" style={{ minHeight: '260px' }}>
              {/* Center Spine / Binding */}
              <div
                className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 z-10"
                style={{
                  width: '20px',
                  background: 'linear-gradient(90deg, #2a1a0f 0%, #4a3020 20%, #3d2518 50%, #4a3020 80%, #2a1a0f 100%)',
                  boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)',
                }}
              >
                {/* Binding stitches */}
                <div className="absolute inset-x-0 top-4 flex flex-col items-center gap-8">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="w-1 h-3 rounded-full" style={{ background: '#8b7355', opacity: 0.6 }} />
                  ))}
                </div>
              </div>

              {/* Left Page */}
              <div
                className="flex-1 relative mr-2.5"
                style={{
                  background: `linear-gradient(135deg, #e8dcc4 0%, #ddd0b8 30%, #d4c4a0 70%, #cbb890 100%)`,
                  borderRadius: '2px 0 0 2px',
                  boxShadow: 'inset -5px 0 15px rgba(0,0,0,0.1), inset 0 0 30px rgba(139, 115, 85, 0.15)',
                }}
              >
                {/* Page texture overlay */}
                <div
                  className="absolute inset-0 opacity-10 pointer-events-none"
                  style={{
                    background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                  }}
               />

                {/* Age stains */}
                <div className="absolute top-4 left-4 w-16 h-12 rounded-full opacity-20" style={{ background: 'radial-gradient(ellipse, #8b7355 0%, transparent 70%)' }} />
                <div className="absolute bottom-8 right-8 w-20 h-16 rounded-full opacity-15" style={{ background: 'radial-gradient(ellipse, #a08060 0%, transparent 70%)' }} />

                {/* Page Header */}
                <div className="relative p-4 pb-2">
                  <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'rgba(93, 74, 50, 0.3)' }}>
                    <span className="font-pirata text-lg" style={{ color: '#4a3828' }}>
                      Captain's Log
                      <CartographerNote noteKey="captainsLog" />
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setShowFullLog(true)}
                        className="font-fell text-xs px-2 py-1 rounded transition-all hover:opacity-80"
                        style={{
                          color: '#5c4a32',
                          background: 'linear-gradient(180deg, rgba(139, 115, 85, 0.15) 0%, rgba(93, 74, 50, 0.25) 100%)',
                          border: '1px solid rgba(93, 74, 50, 0.3)',
                        }}
                      >
                        View Full Log
                      </button>
                      <span className="font-fell text-xs italic" style={{ color: '#6b5c47' }}>Expedition № {epochId}</span>
                    </div>
                  </div>

                  {/* Decorative quill sketch */}
                  <div className="absolute top-3 right-16 opacity-30" style={{ color: '#5c4a32', fontSize: '14px' }}>✎</div>
                </div>

                {/* Left Page Entries */}
                <div className="relative px-4 pb-4 font-fell text-sm leading-relaxed" style={{ color: '#3d2818' }}>
                  {orderedLog.length === 0 ? (
                    <p className="italic text-center pt-8" style={{ color: '#6b5c47' }}>
                      The sea is calm… for now.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {orderedLog.slice(0, Math.ceil(orderedLog.length / 2)).map((entry, i) => (
                        <div key={i} className="relative" style={{ marginLeft: `${(i % 3) * 2}px` }}>
                          {/* Occasional marginalia */}
                          {i === 0 && <span className="absolute -left-3 top-0 text-xs opacity-40">⚓</span>}
                          {entry.type === 'discovery' && <span className="absolute -left-3 top-0 text-xs opacity-50">☠</span>}

                          <span className="italic text-xs opacity-60" style={{ color: '#6b5c47' }}>
                            {i % 2 === 0 ? 'By dawn light' : 'Near dusk'}
                          </span>
                          <span className="mx-2 opacity-40">—</span>
                          <span style={{
                            color: entry.type === 'discovery' ? '#3d2818' : '#4a3828',
                            opacity: 0.85 + (i * 0.03),
                          }}>
                            {entry.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Page number */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 font-fell text-xs italic" style={{ color: '#8b7355' }}>
                  — {Math.max(1, epochId * 2 - 1)} —
                </div>
              </div>

              {/* Right Page */}
              <div
                className="flex-1 relative ml-2.5"
                style={{
                  background: `linear-gradient(225deg, #e8dcc4 0%, #ddd0b8 30%, #d4c4a0 70%, #cbb890 100%)`,
                  borderRadius: '0 2px 2px 0',
                  boxShadow: 'inset 5px 0 15px rgba(0,0,0,0.1), inset 0 0 30px rgba(139, 115, 85, 0.15)',
                }}
              >
                {/* Page texture */}
                <div
                  className="absolute inset-0 opacity-10 pointer-events-none"
                  style={{
                    background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                  }}
               />

                {/* Age stains */}
                <div className="absolute top-12 right-6 w-14 h-10 rounded-full opacity-15" style={{ background: 'radial-gradient(ellipse, #8b7355 0%, transparent 70%)' }} />

                {/* Right page header line */}
                <div className="relative p-4 pb-2">
                  <div className="border-b pb-2" style={{ borderColor: 'rgba(93, 74, 50, 0.3)' }}>
                    <span className="font-fell text-xs italic" style={{ color: '#6b5c47' }}>Continued...</span>
                  </div>

                  {/* Decorative compass sketch */}
                  <div className="absolute top-3 right-4 opacity-25" style={{ color: '#5c4a32', fontSize: '12px' }}>✦</div>
                </div>

                {/* Right Page Entries */}
                <div className="relative px-4 pb-4 font-fell text-sm leading-relaxed" style={{ color: '#3d2818' }}>
                  {orderedLog.length > Math.ceil(orderedLog.length / 2) ? (
                    <div className="space-y-2">
                      {orderedLog.slice(Math.ceil(orderedLog.length / 2)).map((entry, i) => (
                        <div key={i} className="relative" style={{ marginLeft: `${((i + 1) % 3) * 2}px` }}>
                          {/* Occasional marginalia */}
                          {entry.type === 'reward' && <span className="absolute -left-3 top-0 text-xs opacity-40">●</span>}
                          {entry.type === 'map' && <span className="absolute -left-3 top-0 text-xs opacity-40">◇</span>}

                          <span className="italic text-xs opacity-60" style={{ color: '#6b5c47' }}>
                            {i % 2 === 0 ? 'By lantern light' : 'At the bell'}
                          </span>
                          <span className="mx-2 opacity-40">—</span>
                          <span style={{
                            color: entry.type === 'discovery' ? '#3d2818' : '#4a3828',
                            opacity: 0.85 + (i * 0.03),
                          }}>
                            {entry.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : log.length === 0 ? (
                    <div className="pt-8 text-center">
                      {/* Small sketch when empty */}
                      <div className="opacity-20 mb-2" style={{ fontSize: '24px', color: '#5c4a32' }}>⚓</div>
                      <p className="italic text-xs" style={{ color: '#8b7355' }}>
                        — awaiting first entry —
                      </p>
                    </div>
                  ) : (
                    <p className="italic text-center pt-8" style={{ color: '#8b7355' }}>
                      The page lies blank, ready for the next tale...
                    </p>
                  )}
                </div>

                {/* Ink smudge decoration */}
                <div className="absolute bottom-16 right-12 w-8 h-2 opacity-10 rotate-12" style={{ background: '#3d2818', borderRadius: '50%' }} />

                {/* Page number */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 font-fell text-xs italic" style={{ color: '#8b7355' }}>
                  — {Math.max(2, epochId * 2)} —
                </div>
              </div>
            </div>

            {/* Book title embossed on spine (visible at top) */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 font-pirata text-xs tracking-widest px-3 py-1"
              style={{ color: '#c9a227', textShadow: '0 1px 2px rgba(0,0,0,0.5)', opacity: 0.7 }}
            >
              LOG
            </div>
          </div>
        </div>

        {/* Footer (canonical final line) */}
        <div className="text-center mt-8">
          <InkDivider />
          <p className="font-pirata text-lg" style={{ color: '#5c4a32' }}>
            The chest resets. The map expands. The expedition continues.
          </p>
          <p className="font-fell text-sm italic mt-2" style={{ color: '#3d3210' }}>
            Treasure Hunt v2.2 — Ephemeral Notes + Log Outcomes
          </p>
        </div>
      </div>

      {(!isConnected || isWrongNetwork || !configReady || !walletConnectProjectId) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(0, 0, 0, 0.75)' }}
        >
          <div
            className="relative w-full max-w-lg p-6 rounded"
            style={{
              background: 'linear-gradient(180deg, #f0e6d2 0%, #e8dcc4 60%, #dfd2b8 100%)',
              border: '3px solid #8b7355',
              boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
            }}
          >
            <h3 className="font-pirata text-2xl mb-2" style={{ color: '#3d3210' }}>
              ⚓ Connect to Continue
            </h3>
            <p className="font-fell text-sm italic" style={{ color: '#6b5c47' }}>
              The control deck is read-only. A wallet on {SUPPORTED_CHAIN_NAME} is required.
            </p>
            <div className="flex flex-wrap gap-3 mt-4 items-center">
              <ConnectButton showBalance={false} chainStatus="icon" />
              {isWrongNetwork && switchChain ? (
                <button
                  onClick={() => switchChain({ chainId: SUPPORTED_CHAIN_ID })}
                  className="px-3 py-1.5 rounded font-fell text-sm"
                  style={{
                    background: '#5c3030',
                    color: '#ffdddd',
                    border: '1px solid #8b4040',
                  }}
                >
                  Switch to {SUPPORTED_CHAIN_NAME}
                </button>
              ) : null}
            </div>
            {!walletConnectProjectId ? (
              <p className="font-fell text-xs mt-3" style={{ color: '#8b4040' }}>
                Missing {REQUIRED_ENV.walletConnect} in .env
              </p>
            ) : null}
            {!CHAIN_ENV_VALID ? (
              <p className="font-fell text-xs mt-2" style={{ color: '#8b4040' }}>
                Invalid {REQUIRED_ENV.chainEnv} (use mainnet or sepolia)
              </p>
            ) : null}
            {!configReady ? (
              <p className="font-fell text-xs mt-2" style={{ color: '#8b4040' }}>
                Missing addresses: {addressIssues.map((key) => REQUIRED_ENV[key]).join(', ')}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
    </CartographerNotesContext.Provider>
  );
};

export default TreasureHuntMockup;
