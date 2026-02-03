import { useCallback, useEffect, useMemo, useRef, useState, createContext, useContext } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  useAccount,
  useChainId,
  useReadContracts,
  useSwitchChain,
  useWatchContractEvent,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from 'wagmi';
import { formatUnits, parseUnits, isAddress, maxUint256 } from 'viem';
import { erc20Abi } from 'viem';

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
import { treasureEngineAbi, mapTokenAbi, huntStakingAbi, mockUsdcAbi } from './abi/index.js';
import { useTxCenter, TxStatus } from './hooks/useTxCenter.js';
import { usePendingBets } from './hooks/usePendingBets.js';
import { useLogger } from './hooks/useLogger.js';
import { useStakingData } from './components/StakingPanel.jsx';

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

// ============================================================================
// UTILITIES
// ============================================================================
const EXPLORER_BASE = SUPPORTED_CHAIN_ID === 84532
  ? 'https://sepolia.basescan.org'
  : 'https://basescan.org';

const formatWithCommas = (value) => value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const formatToken = (value, decimals, maxFrac = 4) => {
  if (value === null || value === undefined) return '--';
  const raw = formatUnits(value, decimals);
  const [whole, frac = ''] = raw.split('.');
  const clipped = frac.slice(0, maxFrac).replace(/0+$/, '');
  const wholeFormatted = formatWithCommas(whole);
  return clipped.length ? `${wholeFormatted}.${clipped}` : wholeFormatted;
};

const shortAddress = (value) => {
  if (!value || !isAddress(value)) return '--';
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};

const formatTime = () =>
  new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// Canonical Tides of Fortune outcomes
const outcomes = [
  { name: "0×", label: "The Sea Claims Its Due", probability: 0.40, multiplier: 0 },
  { name: "½×", label: "A Modest Return", probability: 0.22, multiplier: 0.5 },
  { name: "1×", label: "Safe Harbor", probability: 0.18, multiplier: 1.0 },
  { name: "1½×", label: "Favorable Winds", probability: 0.10, multiplier: 1.5 },
  { name: "2×", label: "Strong Tides", probability: 0.06, multiplier: 2.0 },
  { name: "4×", label: "A Rare Surge", probability: 0.03, multiplier: 4.0 },
  { name: "10×", label: "Legendary Fortune", probability: 0.01, multiplier: 10.0 },
];

const getMapTier = (price) => {
  if (!price) return { name: "Unknown", icon: "?" };
  const p = Number(formatUnits(price, DECIMALS.usdc));
  if (p < 0.02) return { name: "Blank Parchment", icon: "◇" };
  if (p < 0.05) return { name: "Rough Coastlines", icon: "◆" };
  if (p < 0.15) return { name: "Trade Routes", icon: "⚓" };
  if (p < 0.50) return { name: "Interior Charted", icon: "⛰" };
  if (p < 1.00) return { name: "Known World", icon: "◉" };
  return { name: "Myth Made Real", icon: "✦" };
};

// ============================================================================
// UI COMPONENTS — Canonical styling
// ============================================================================
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
      cursor: disabled ? 'not-allowed' : 'pointer',
    }}
  >
    {children}
  </button>
);

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

const InkDivider = () => (
  <div className="my-4 flex items-center justify-center gap-3">
    <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, #5c4a32, #5c4a32)' }} />
    <span style={{ color: '#5c4a32' }}>✦</span>
    <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, #5c4a32, #5c4a32, transparent)' }} />
  </div>
);

// ============================================================================
// MAIN APP
// ============================================================================
export default function App() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();

  // Custom hooks
  const { txHistory, addTx, updateTx, clearHistory } = useTxCenter();
  const { pendingBetsArray, addPendingBet, resolveBet } = usePendingBets();
  const { logTx, logEvent, logError } = useLogger(chainId);
  const stakingData = useStakingData(address);

  // UI state
  const [log, setLog] = useState([]);
  const [showFullLog, setShowFullLog] = useState(false);
  const [treasureGlow, setTreasureGlow] = useState(false);
  const [mapPriceTick, setMapPriceTick] = useState(null);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [discovery, setDiscovery] = useState(null);
  const [lastOutcome, setLastOutcome] = useState(null);
  const discoveryTimeoutRef = useRef(null);
  const [walletDropdownOpen, setWalletDropdownOpen] = useState(false);

  // Input states
  const [betAmount, setBetAmount] = useState('');
  const [stakeAmount, setStakeAmount] = useState('');
  const [mapBuyAmount, setMapBuyAmount] = useState('');
  const [mapSellAmount, setMapSellAmount] = useState('');
  const [mapTradeMode, setMapTradeMode] = useState('buy');

  // Cartographer's Notes state
  const [activeNote, setActiveNote] = useState(null);
  const [noteAnchorRect, setNoteAnchorRect] = useState(null);
  const anchorRectRef = useRef(null);

  const noteClose = () => {
    setActiveNote(null);
    setNoteAnchorRect(null);
    anchorRectRef.current = null;
  };

  useEffect(() => {
    if (!activeNote || !anchorRectRef.current) return;
    const rect = anchorRectRef.current;
    const pad = 8;
    const onPointerMove = (e) => {
      const x = e.clientX;
      const y = e.clientY;
      const inside = x >= (rect.left - pad) && x <= (rect.right + pad) &&
                     y >= (rect.top - pad) && y <= (rect.bottom + pad);
      if (!inside) noteClose();
    };
    const onScroll = () => noteClose();
    const onResize = () => noteClose();
    const onKeyDown = (e) => { if (e.key === 'Escape') noteClose(); };
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
      anchorRectRef.current = rect;
      setActiveNote(noteKey);
      setNoteAnchorRect(rect);
    },
    forceClose: noteClose,
  };

  const notePosition = computePosition(noteAnchorRect);

  const isWrongNetwork = isConnected && chainId !== SUPPORTED_CHAIN_ID;
  const readEnabled = isConnected && !isWrongNetwork && configReady;

  // Write contract hooks
  const { writeContract: approveUsdc, data: approveUsdcHash, isPending: isApprovingUsdc } = useWriteContract();
  const { writeContract: approveHunt, data: approveHuntHash, isPending: isApprovingHunt } = useWriteContract();
  const { writeContract: placeBet, data: placeBetHash, isPending: isPlacingBet } = useWriteContract();
  const { writeContract: buyMap, data: buyMapHash, isPending: isBuyingMap } = useWriteContract();
  const { writeContract: sellMap, data: sellMapHash, isPending: isSellingMap } = useWriteContract();
  const { writeContract: stakeHunt, data: stakeHuntHash, isPending: isStaking } = useWriteContract();
  const { writeContract: initiateWithdraw, isPending: isInitiatingWithdraw } = useWriteContract();
  const { writeContract: cancelWithdraw, isPending: isCancellingWithdraw } = useWriteContract();
  const { writeContract: withdrawHunt, isPending: isWithdrawing } = useWriteContract();
  const { writeContract: mintFaucet, data: mintFaucetHash, isPending: isMinting } = useWriteContract();

  const { isLoading: isWaitingMint } = useWaitForTransactionReceipt({ hash: mintFaucetHash });
  const { isLoading: isWaitingApproveUsdc, isSuccess: approveUsdcSuccess } = useWaitForTransactionReceipt({ hash: approveUsdcHash });
  const { isLoading: isWaitingApproveHunt } = useWaitForTransactionReceipt({ hash: approveHuntHash });
  const { isLoading: isWaitingBet, isSuccess: betSuccess, data: betReceipt } = useWaitForTransactionReceipt({ hash: placeBetHash });
  const { isLoading: isWaitingMap } = useWaitForTransactionReceipt({ hash: buyMapHash });
  const { isLoading: isWaitingSellMap } = useWaitForTransactionReceipt({ hash: sellMapHash });
  const { isLoading: isWaitingStake } = useWaitForTransactionReceipt({ hash: stakeHuntHash });

  const addLog = useCallback((message, type = 'info') => {
    setLog(prev => [...prev.slice(-19), { message, type, time: formatTime() }]);
  }, []);

  const triggerTreasureGlow = useCallback(() => {
    setTreasureGlow(true);
    window.setTimeout(() => setTreasureGlow(false), 2600);
  }, []);

  const triggerDiscovery = useCallback((payload) => {
    setDiscovery(payload);
    setShowDiscovery(true);
    triggerTreasureGlow();
    if (discoveryTimeoutRef.current) window.clearTimeout(discoveryTimeoutRef.current);
    discoveryTimeoutRef.current = window.setTimeout(() => setShowDiscovery(false), 5000);
  }, [triggerTreasureGlow]);

  useEffect(() => {
    return () => { if (discoveryTimeoutRef.current) window.clearTimeout(discoveryTimeoutRef.current); };
  }, []);

  // Contract reads
  const globalReads = useReadContracts({
    allowFailure: true,
    contracts: readEnabled ? [
      { address: addresses.treasureEngine, abi: treasureEngineAbi, functionName: 'J' },
      { address: addresses.treasureEngine, abi: treasureEngineAbi, functionName: 'M' },
      { address: addresses.treasureEngine, abi: treasureEngineAbi, functionName: 'epochId' },
      { address: addresses.treasureEngine, abi: treasureEngineAbi, functionName: 'N0' },
      { address: addresses.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [addresses.treasureEngine] },
      { address: addresses.mapToken, abi: mapTokenAbi, functionName: 'currentPrice' },
      { address: addresses.mapToken, abi: mapTokenAbi, functionName: 'totalSupply' },
    ] : [],
    query: { enabled: readEnabled, refetchInterval: 10000 },
  });

  const userReads = useReadContracts({
    allowFailure: true,
    contracts: readEnabled && address ? [
      { address: addresses.huntToken, abi: erc20Abi, functionName: 'balanceOf', args: [address] },
      { address: addresses.mapToken, abi: mapTokenAbi, functionName: 'balanceOf', args: [address] },
      { address: addresses.huntStaking, abi: huntStakingAbi, functionName: 'stakedBalance', args: [address] },
      { address: addresses.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [address] },
      { address: addresses.usdc, abi: erc20Abi, functionName: 'allowance', args: [address, addresses.treasureEngine] },
      { address: addresses.usdc, abi: erc20Abi, functionName: 'allowance', args: [address, addresses.mapToken] },
      { address: addresses.huntToken, abi: erc20Abi, functionName: 'allowance', args: [address, addresses.huntStaking] },
    ] : [],
    query: { enabled: readEnabled && !!address, refetchInterval: 5000 },
  });

  const [jBalance, mValue, epochId, n0Value, usdcBalance, mapPrice, mapSupply] = useMemo(() => {
    const results = globalReads.data || [];
    return results.map((entry) => entry?.result ?? null);
  }, [globalReads.data]);

  const [huntBalance, mapBalance, stakedBalance, userUsdcBalance, engineAllowance, mapAllowance, stakingAllowance] = useMemo(() => {
    const results = userReads.data || [];
    return results.map((entry) => entry?.result ?? null);
  }, [userReads.data]);

  const chestProgress = useMemo(() => {
    if (!jBalance || !mValue || mValue === 0n) return 0;
    const basisPoints = (jBalance * 10000n) / mValue;
    return clamp(Number(basisPoints) / 100, 0, 100);
  }, [jBalance, mValue]);

  const maxBet = useMemo(() => mValue ? mValue / 100n : 0n, [mValue]);
  const minBet = 100_000n;

  // Approval checks
  const needsEngineApproval = useMemo(() => {
    if (engineAllowance === null || !betAmount) return false;
    try { return engineAllowance < parseUnits(betAmount || '0', DECIMALS.usdc); } catch { return false; }
  }, [engineAllowance, betAmount]);

  const needsMapApproval = useMemo(() => {
    if (mapAllowance === null || !mapBuyAmount) return false;
    try { return mapAllowance < parseUnits(mapBuyAmount || '0', DECIMALS.usdc); } catch { return false; }
  }, [mapAllowance, mapBuyAmount]);

  const needsStakingApproval = useMemo(() => {
    if (stakingAllowance === null || !stakeAmount) return false;
    try { return stakingAllowance < parseUnits(stakeAmount || '0', DECIMALS.hunt); } catch { return false; }
  }, [stakingAllowance, stakeAmount]);

  // Action handlers
  const handleApproveUsdcForEngine = useCallback(() => {
    if (!addresses.usdc || !addresses.treasureEngine) return;
    approveUsdc({ address: addresses.usdc, abi: erc20Abi, functionName: 'approve', args: [addresses.treasureEngine, maxUint256] });
    addLog("Approving USDC for the expedition...", 'tx');
  }, [approveUsdc, addLog]);

  const handleApproveUsdcForMap = useCallback(() => {
    if (!addresses.usdc || !addresses.mapToken) return;
    approveUsdc({ address: addresses.usdc, abi: erc20Abi, functionName: 'approve', args: [addresses.mapToken, maxUint256] });
    addLog("Approving USDC for the cartographer...", 'tx');
  }, [approveUsdc, addLog]);

  const handleApproveHuntForStaking = useCallback(() => {
    if (!addresses.huntToken || !addresses.huntStaking) return;
    approveHunt({ address: addresses.huntToken, abi: erc20Abi, functionName: 'approve', args: [addresses.huntStaking, maxUint256] });
    addLog("Approving HUNT for the ship's hold...", 'tx');
  }, [approveHunt, addLog]);

  const handlePlaceBet = useCallback(() => {
    if (!betAmount || !addresses.treasureEngine) return;
    try {
      const amount = parseUnits(betAmount, DECIMALS.usdc);
      if (amount < minBet || amount > maxBet) {
        addLog("The sea refuses the command.", 'error');
        return;
      }
      placeBet({ address: addresses.treasureEngine, abi: treasureEngineAbi, functionName: 'placeBet', args: [amount] });
      addLog(`Contributing ${betAmount} USDC to the expedition...`, 'expedition');
      setBetAmount('');
    } catch (e) { logError('place-bet-parse', e); }
  }, [betAmount, placeBet, addLog, maxBet, logError]);

  const handleBuyMap = useCallback(() => {
    if (!mapBuyAmount || !addresses.mapToken) return;
    try {
      const amount = parseUnits(mapBuyAmount, DECIMALS.usdc);
      buyMap({ address: addresses.mapToken, abi: mapTokenAbi, functionName: 'buy', args: [amount] });
      addLog(`Acquiring MAP for ${mapBuyAmount} USDC...`, 'map');
      setMapBuyAmount('');
    } catch (e) { logError('buy-map-parse', e); }
  }, [mapBuyAmount, buyMap, addLog, logError]);

  const handleSellMap = useCallback(() => {
    if (!mapSellAmount || !addresses.mapToken) return;
    try {
      const amount = parseUnits(mapSellAmount, DECIMALS.map);
      sellMap({ address: addresses.mapToken, abi: mapTokenAbi, functionName: 'sell', args: [amount] });
      addLog(`Returning ${mapSellAmount} MAP to the sea...`, 'map');
      setMapSellAmount('');
    } catch (e) { logError('sell-map-parse', e); }
  }, [mapSellAmount, sellMap, addLog, logError]);

  const handleStake = useCallback(() => {
    if (!stakeAmount || !addresses.huntStaking) return;
    try {
      const amount = parseUnits(stakeAmount, DECIMALS.hunt);
      stakeHunt({ address: addresses.huntStaking, abi: huntStakingAbi, functionName: 'stake', args: [amount] });
      addLog("HUNT stowed below deck.", 'stake');
      setStakeAmount('');
    } catch (e) { logError('stake-parse', e); }
  }, [stakeAmount, stakeHunt, addLog, logError]);

  const handleInitiateWithdraw = useCallback(() => {
    if (!addresses.huntStaking) return;
    initiateWithdraw({ address: addresses.huntStaking, abi: huntStakingAbi, functionName: 'initiateWithdraw' });
    addLog("The gangplank lowers in seven days.", 'stake');
  }, [initiateWithdraw, addLog]);

  const handleCancelWithdraw = useCallback(() => {
    if (!addresses.huntStaking) return;
    cancelWithdraw({ address: addresses.huntStaking, abi: huntStakingAbi, functionName: 'cancelWithdraw' });
    addLog("No sailor leaves mid-watch.", 'stake');
  }, [cancelWithdraw, addLog]);

  const handleWithdraw = useCallback(() => {
    if (!addresses.huntStaking || !stakingData.stakedBalance) return;
    withdrawHunt({ address: addresses.huntStaking, abi: huntStakingAbi, functionName: 'withdraw', args: [stakingData.stakedBalance] });
    addLog("HUNT returned to the hold.", 'stake');
  }, [withdrawHunt, addLog, stakingData.stakedBalance]);

  const handleMintFaucet = useCallback(() => {
    if (!addresses.usdc || !address) return;
    const amount = parseUnits('1000', DECIMALS.usdc);
    mintFaucet({ address: addresses.usdc, abi: mockUsdcAbi, functionName: 'mint', args: [address, amount] });
    addLog("Minting 1000 test USDC from faucet...", 'tx');
  }, [mintFaucet, address, addLog]);

  // Max buttons
  const handleMaxBet = useCallback(() => {
    if (!userUsdcBalance || !maxBet) return;
    const max = userUsdcBalance < maxBet ? userUsdcBalance : maxBet;
    setBetAmount(formatUnits(max, DECIMALS.usdc));
  }, [userUsdcBalance, maxBet]);

  const handleMaxStake = useCallback(() => {
    if (!huntBalance) return;
    setStakeAmount(formatUnits(huntBalance, DECIMALS.hunt));
  }, [huntBalance]);

  const handleMaxMapBuy = useCallback(() => {
    if (!userUsdcBalance) return;
    const maxBuyVal = 50_000_000_000n;
    const max = userUsdcBalance < maxBuyVal ? userUsdcBalance : maxBuyVal;
    setMapBuyAmount(formatUnits(max, DECIMALS.usdc));
  }, [userUsdcBalance]);

  const handleMaxMapSell = useCallback(() => {
    if (!mapBalance || !mapSupply) return;
    const maxSell = mapSupply / 100n;
    const max = mapBalance < maxSell ? mapBalance : maxSell;
    setMapSellAmount(formatUnits(max, DECIMALS.map));
  }, [mapBalance, mapSupply]);

  // Event watchers
  useWatchContractEvent({
    address: readEnabled ? addresses.treasureEngine : undefined,
    abi: treasureEngineAbi,
    eventName: 'TreasureDiscovered',
    enabled: readEnabled && !!addresses.treasureEngine,
    onLogs: (logs) => {
      logs.forEach((lg) => {
        const { discoverer, amount, epochId: epoch } = lg.args || {};
        logEvent('TreasureDiscovered', { discoverer, amount: amount?.toString(), epoch: epoch?.toString() });
        addLog(`⚓ TREASURE FOUND! ${formatToken(amount, DECIMALS.usdc, 2)} USDC discovered.`, 'discovery');
        triggerDiscovery({ amount, epoch, discoverer });
      });
    },
  });

  useWatchContractEvent({
    address: readEnabled ? addresses.treasureEngine : undefined,
    abi: treasureEngineAbi,
    eventName: 'BetPlaced',
    enabled: readEnabled && !!addresses.treasureEngine,
    onLogs: (logs) => {
      logs.forEach((lg) => {
        const { participant, amount, requestId } = lg.args || {};
        logEvent('BetPlaced', { participant, amount: amount?.toString(), requestId: requestId?.toString() });
        if (participant?.toLowerCase() === address?.toLowerCase()) {
          addPendingBet(requestId, { amount, bettor: participant, txHash: lg.transactionHash });
          addLog(`Contribution confirmed. Awaiting the oracle's wisdom...`, 'expedition');
        }
      });
    },
  });

  useWatchContractEvent({
    address: readEnabled ? addresses.treasureEngine : undefined,
    abi: treasureEngineAbi,
    eventName: 'BetResolved',
    enabled: readEnabled && !!addresses.treasureEngine,
    onLogs: (logs) => {
      logs.forEach((lg) => {
        const { participant, amount, payout, outcomeIndex } = lg.args || {};
        logEvent('BetResolved', { participant, amount: amount?.toString(), payout: payout?.toString(), outcomeIndex });
        if (participant?.toLowerCase() === address?.toLowerCase()) {
          const isWin = payout > 0n;
          const outcomeData = outcomes[outcomeIndex] || outcomes[0];
          setLastOutcome(outcomeData);
          pendingBetsArray.forEach(bet => {
            if (bet.bettor?.toLowerCase() === participant?.toLowerCase()) {
              resolveBet(bet.requestId, { payout, outcomeIndex, isWin });
            }
          });
          if (isWin) {
            addLog(`${outcomeData.label} — Won ${formatToken(payout, DECIMALS.usdc, 2)} USDC`, 'fortune');
            setMapPriceTick('up');
            setTimeout(() => setMapPriceTick(null), 2000);
          } else {
            addLog(`The sea claims its due. ${formatToken(amount, DECIMALS.usdc, 2)} USDC added to the chest.`, 'contribution');
            triggerTreasureGlow();
          }
        }
      });
    },
  });

  useWatchContractEvent({
    address: readEnabled ? addresses.mapToken : undefined,
    abi: mapTokenAbi,
    eventName: 'MapBought',
    enabled: readEnabled && !!addresses.mapToken,
    onLogs: (logs) => {
      logs.forEach((lg) => {
        const { buyer, usdcIn, mapOut } = lg.args || {};
        logEvent('MapBought', { buyer, usdcIn: usdcIn?.toString(), mapOut: mapOut?.toString() });
        if (buyer?.toLowerCase() === address?.toLowerCase()) {
          addLog(`Acquired ${formatToken(mapOut, DECIMALS.map, 3)} MAP for ${formatToken(usdcIn, DECIMALS.usdc, 2)} USDC`, 'map');
        }
      });
    },
  });

  const mapTier = getMapTier(mapPrice);
  const isBusy = isApprovingUsdc || isApprovingHunt || isPlacingBet || isBuyingMap || isSellingMap || isStaking ||
    isWaitingApproveUsdc || isWaitingApproveHunt || isWaitingBet || isWaitingMap || isWaitingSellMap || isWaitingStake ||
    isInitiatingWithdraw || isCancellingWithdraw || isWithdrawing || isMinting || isWaitingMint;

  const formatCooldown = (ms) => {
    if (!ms) return '--';
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    return `${days}d ${hours}h remaining`;
  };

  const getLogStyle = (type) => {
    const styles = {
      discovery: { borderColor: '#c9a227', fontWeight: '600' },
      fortune: { borderColor: '#2d6b4a' },
      contribution: { borderColor: '#c97a27' },
      expedition: { borderColor: '#8b7355' },
      stake: { borderColor: '#6b5c87' },
      map: { borderColor: '#5c6b8b' },
      tx: { borderColor: '#5c5c5c' },
      error: { borderColor: '#8b3030' },
      info: { borderColor: '#6b5c47' },
    };
    return styles[type] || styles.info;
  };

  // Demo trigger
  const triggerDemoDiscovery = useCallback(() => {
    if (!DEMO_MODE) return;
    addLog("⚓ TREASURE FOUND! The chest bursts open — the map expands.", 'discovery');
    triggerDiscovery({ amount: 123_450_000n, epoch: epochId, discoverer: address, isDemo: true });
  }, [addLog, triggerDiscovery, epochId, address]);

  return (
    <CartographerNotesContext.Provider value={noteManager}>
      <CartographerNotesOverlay activeNote={activeNote} position={notePosition} />
      <div className="min-h-screen p-4 relative overflow-hidden" style={{
        background: 'linear-gradient(180deg, #1a1510 0%, #0f0d0a 100%)',
        fontFamily: "'IM Fell English', 'Times New Roman', serif",
      }}>
        {/* Google Fonts & Animations */}
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Pirata+One&family=IM+Fell+English:ital@0;1&display=swap');
          .font-pirata { font-family: 'Pirata One', cursive; }
          .font-fell { font-family: 'IM Fell English', serif; }
          @keyframes noteSlideDown { 0% { opacity: 0; transform: translateY(-4px); } 100% { opacity: 1; transform: translateY(0); } }
          @keyframes noteSlideUp { 0% { opacity: 0; transform: translateY(4px); } 100% { opacity: 1; transform: translateY(0); } }
          @keyframes flicker { 0%, 100% { opacity: 1; } 50% { opacity: 0.8; } }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          input[type="number"] { font-family: 'IM Fell English', serif; }
        `}</style>

        {/* Discovery Celebration Overlay */}
        {showDiscovery && (
          <div className="pointer-events-none" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'grid', placeItems: 'center' }}>
            <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(201, 162, 39, 0.5) 0%, rgba(0, 0, 0, 0.6) 70%)', animation: 'flicker 0.5s ease-in-out infinite' }} />
            <div className="relative text-center px-8 py-6 rounded animate-bounce" style={{
              background: 'linear-gradient(180deg, rgba(61, 50, 16, 0.95) 0%, rgba(45, 36, 12, 0.95) 100%)',
              border: '3px solid #c9a227',
              boxShadow: '0 0 60px rgba(255, 215, 0, 0.4), 0 0 120px rgba(201, 162, 39, 0.2)',
            }}>
              <div className="font-pirata text-6xl mb-4" style={{ color: '#ffd700', textShadow: '0 0 20px rgba(255, 215, 0, 0.8), 2px 2px 0 #5c4a12' }}>☠ ✦ ⚓</div>
              <h1 className="font-pirata text-5xl mb-2" style={{ color: '#ffd700', textShadow: '0 0 20px rgba(255, 215, 0, 0.8), 3px 3px 0 #3d3210' }}>TREASURE DISCOVERED!</h1>
              <p className="font-fell text-xl italic" style={{ color: '#f5e6c8' }}>{formatToken(discovery?.amount, DECIMALS.usdc, 2)} USDC</p>
            </div>
          </div>
        )}

        {/* Full Log Modal */}
        {showFullLog && (
          <div className="fixed inset-0 z-50" style={{ background: 'rgba(0, 0, 0, 0.85)' }} onClick={() => setShowFullLog(false)}>
            <div className="fixed inset-0 flex items-center justify-center p-6" onClick={(e) => e.stopPropagation()}>
              <div className="relative w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-sm" style={{
                background: 'linear-gradient(180deg, #f0e6d2 0%, #e8dcc4 30%, #ddd0b8 70%, #d4c4a0 100%)',
                boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
                border: '3px solid #8b7355',
              }}>
                <div className="p-4 border-b" style={{ borderColor: 'rgba(93, 74, 50, 0.3)' }}>
                  <div className="flex items-center justify-between">
                    <h2 className="font-pirata text-2xl" style={{ color: '#3d3210' }}>⚓ Captain's Log — Complete Record</h2>
                    <button onClick={() => setShowFullLog(false)} className="font-fell text-xl px-3 py-1 rounded hover:opacity-70" style={{ color: '#5c4a32' }}>✕</button>
                  </div>
                  <p className="font-fell text-sm italic mt-1" style={{ color: '#6b5c47' }}>Expedition № {epochId?.toString() ?? '--'} — {log.length} entries</p>
                </div>
                <div className="overflow-y-auto p-4 font-fell" style={{ maxHeight: 'calc(80vh - 100px)', color: '#3d2818' }}>
                  {log.length === 0 ? (
                    <p className="text-center italic py-8" style={{ color: '#6b5c47' }}>The pages remain blank… for now.</p>
                  ) : (
                    <div className="space-y-3">
                      {log.slice().reverse().map((entry, i) => (
                        <div key={i} className="relative pl-4 py-2 border-l-2" style={{ borderColor: getLogStyle(entry.type).borderColor }}>
                          <span className="text-xs italic block mb-1" style={{ color: '#8b7355' }}>{entry.time}</span>
                          <span style={{ color: entry.type === 'discovery' ? '#3d3210' : '#4a3828', fontWeight: entry.type === 'discovery' ? '600' : 'normal' }}>{entry.message}</span>
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
          {/* Header */}
          <div className="mb-6 pb-4">
            <div className="flex justify-end items-center gap-3 mb-4">
              <div className="px-3 py-1.5 rounded flex items-center gap-2" style={{
                background: isWrongNetwork ? 'linear-gradient(180deg, #5c3030 0%, #4a2020 100%)' : 'linear-gradient(180deg, #1a3a5c 0%, #0f2840 100%)',
                border: isWrongNetwork ? '1px solid #8b4040' : '1px solid #2a5a8c',
              }}>
                {isWrongNetwork ? (
                  <>
                    <span style={{ color: '#ff8888' }}>⚠</span>
                    <span className="font-fell text-sm" style={{ color: '#ffaaaa' }}>Wrong Network</span>
                    {switchChain && <button onClick={() => switchChain({ chainId: SUPPORTED_CHAIN_ID })} className="ml-1 px-2 py-0.5 rounded text-xs font-fell" style={{ background: '#5c3030', color: '#ffcccc', border: '1px solid #8b4040' }}>Switch</button>}
                  </>
                ) : (
                  <>
                    <span style={{ color: '#60a5fa' }}>◆</span>
                    <span className="font-fell text-sm" style={{ color: '#93c5fd' }}>{SUPPORTED_CHAIN_NAME}</span>
                  </>
                )}
              </div>
              <ConnectButton showBalance={false} chainStatus="none" />
            </div>

            <div className="text-center">
              <h1 className="font-pirata text-5xl mb-2" style={{ color: '#c9a227', textShadow: '3px 3px 0 #3d3210, 0 0 20px rgba(201, 162, 39, 0.3)' }}>⚓ TREASURE HUNT ⚓</h1>
              <p className="font-fell italic" style={{ color: '#8b7355' }}>An Autonomous Economic Game of Discovery</p>
            </div>
            <InkDivider />
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            <BrassPlaque label="Expedition" value={`№ ${epochId?.toString() ?? '--'}`} noteKey="expedition" />
            <BrassPlaque label="Map Size" value={`$${formatToken(mValue, DECIMALS.usdc, 0)}`} noteKey="mapSize" />
            <BrassPlaque label="Contributions" value={n0Value?.toString() ?? '--'} noteKey="contributions" />
            <BrassPlaque label="Your USDC" value={`$${formatToken(userUsdcBalance, DECIMALS.usdc, 2)}`} />
          </div>

          {/* Faucet Row */}
          {SUPPORTED_CHAIN_ID === 84532 && (
            <div className="mb-4 text-center">
              <WoodButton onClick={handleMintFaucet} disabled={!readEnabled || isBusy} className="px-4 py-2">
                {isMinting || isWaitingMint ? 'Minting...' : '🪙 Faucet: Mint 1000 Test USDC'}
              </WoodButton>
            </div>
          )}

          {/* Treasure Chest */}
          <ParchmentPanel className="p-4 mb-6" glow={treasureGlow || showDiscovery}>
            <div className="flex justify-between mb-2">
              <span className="font-pirata text-xl" style={{ color: '#3d3210' }}>⚓ The Treasure Chest<CartographerNote noteKey="treasureChest" /></span>
              <span className="font-pirata text-xl" style={{ color: '#5c4a12' }}>${formatToken(jBalance, DECIMALS.usdc, 2)} / ${formatToken(mValue, DECIMALS.usdc, 0)}</span>
            </div>
            <div className="h-8 rounded overflow-hidden relative" style={{ background: '#c9b896', border: '2px solid #8b7355', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }}>
              <div className="h-full transition-all duration-500 flex items-center justify-end pr-2" style={{
                width: `${Math.min(chestProgress, 100)}%`,
                background: treasureGlow ? 'linear-gradient(90deg, #ffd700 0%, #ffec8b 50%, #ffd700 100%)' : 'linear-gradient(90deg, #8b6914 0%, #c9a227 50%, #8b6914 100%)',
                boxShadow: treasureGlow ? '0 0 15px rgba(255, 215, 0, 0.6)' : 'none',
              }}>
                {chestProgress > 15 && <span className="font-pirata text-sm" style={{ color: '#3d3210', textShadow: '0 1px 0 rgba(255,255,255,0.3)' }}>{chestProgress.toFixed(1)}%</span>}
              </div>
            </div>
            <p className="font-fell text-sm text-center mt-2 italic" style={{ color: '#6b5c47' }}>
              {treasureGlow ? "The chest rattles as it fills…" : "The closer we draw, the quieter the sea becomes."}
            </p>
          </ParchmentPanel>

          {/* Main Grid: 3 columns */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {/* Left: Exploration */}
            <ParchmentPanel className="p-4">
              <h2 className="font-pirata text-xl mb-3 text-center" style={{ color: '#3d3210' }}>🧭 Exploration<CartographerNote noteKey="beginExploration" /></h2>
              <div className="mb-3">
                <label className="font-fell text-sm" style={{ color: '#5c4a32' }}>Contribution (USDC)</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="number"
                    min="0.10"
                    step="0.10"
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    className="flex-1 rounded p-2"
                    style={{ background: '#f5e6c8', border: '2px solid #8b7355', color: '#3d3210', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)' }}
                    disabled={!readEnabled || isBusy}
                    placeholder={`${formatToken(minBet, DECIMALS.usdc, 2)} - ${formatToken(maxBet, DECIMALS.usdc, 2)}`}
                  />
                  <button onClick={handleMaxBet} disabled={!readEnabled || isBusy} className="px-2 py-1 rounded font-fell text-xs" style={{ background: 'rgba(92, 74, 50, 0.2)', color: '#5c4a32', border: '1px solid #8b7355' }}>MAX</button>
                </div>
                <div className="font-fell text-xs mt-1 italic" style={{ color: '#6b5c47' }}>Every expedition welcomes at least one step.</div>
              </div>
              {needsEngineApproval ? (
                <WoodButton onClick={handleApproveUsdcForEngine} disabled={!readEnabled || isBusy} className="w-full py-3 text-lg">
                  {isApprovingUsdc || isWaitingApproveUsdc ? '⏳ Approving...' : '🔓 Approve USDC'}
                </WoodButton>
              ) : (
                <WoodButton onClick={handlePlaceBet} disabled={!readEnabled || isBusy || !betAmount} className="w-full py-3 text-lg">
                  {isPlacingBet || isWaitingBet ? '🧭 The oracle peers into the deep…' : '🧭 Begin Exploration'}
                </WoodButton>
              )}
              {lastOutcome && (
                <div className="mt-3 p-3 rounded" style={{ background: '#d4c4a8', border: '2px solid #8b7355' }}>
                  <div className="font-pirata text-center mb-1" style={{ color: '#3d3210' }}>{lastOutcome.label}</div>
                  <div className="font-fell text-sm italic text-center" style={{ color: '#5c4a32' }}>{lastOutcome.name}</div>
                </div>
              )}
              {DEMO_MODE && (
                <button onClick={triggerDemoDiscovery} className="w-full mt-3 py-1 rounded font-fell text-xs opacity-50 hover:opacity-100 transition-opacity" style={{ background: 'transparent', color: '#6b5c47', border: '1px dashed #8b7355' }}>[Demo: Trigger Discovery]</button>
              )}
            </ParchmentPanel>

            {/* Center: Holdings */}
            <ParchmentPanel className="p-4">
              <h2 className="font-pirata text-xl mb-3 text-center" style={{ color: '#3d3210' }}>☠ Holdings</h2>
              <div className="space-y-2">
                <div className="flex justify-between items-center p-2 rounded" style={{ background: '#c9b896', border: '1px solid #8b7355' }}>
                  <span className="font-pirata" style={{ color: '#5c4a32' }}>● Doubloons</span>
                  <span className="font-pirata text-lg" style={{ color: '#3d3210' }}>${formatToken(userUsdcBalance, DECIMALS.usdc, 2)}</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded" style={{ background: '#c9b896', border: '1px solid #8b7355' }}>
                  <div>
                    <span className="font-pirata" style={{ color: '#5c4a32' }}>⊕ Yer HUNT<CartographerNote noteKey="huntWallet" /></span>
                    <div className="font-fell text-xs italic" style={{ color: '#8b7355' }}>Earned through exploration</div>
                  </div>
                  <span className="font-pirata" style={{ color: '#3d3210' }}>{formatToken(huntBalance, DECIMALS.hunt, 2)}</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded" style={{ background: '#b8a886', border: '1px solid #8b7355' }}>
                  <span className="font-pirata" style={{ color: '#5c4a32' }}>⚓ HUNT Aboard Ship<CartographerNote noteKey="huntStaked" /></span>
                  <span className="font-pirata" style={{ color: '#3d3210' }}>{formatToken(stakingData.stakedBalance, DECIMALS.hunt, 2)}</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded transition-all duration-500" style={{ background: mapPriceTick ? '#a8c4b8' : '#c9b896', border: mapPriceTick ? '2px solid #5c8b6b' : '1px solid #8b7355' }}>
                  <span className="font-pirata" style={{ color: '#5c4a32' }}>◇ MAP<CartographerNote noteKey="map" /></span>
                  <div className="text-right flex items-center gap-2">
                    <span className="font-pirata" style={{ color: '#3d3210' }}>{formatToken(mapBalance, DECIMALS.map, 2)}</span>
                    {mapPriceTick === 'up' && <span className="font-pirata text-emerald-700 animate-pulse">▲</span>}
                  </div>
                </div>
              </div>
            </ParchmentPanel>

            {/* Right: Ship's Hold (Staking) */}
            <ParchmentPanel className="p-4">
              <h2 className="font-pirata text-xl mb-3 text-center" style={{ color: '#3d3210' }}>⚓ Ship's Hold<CartographerNote noteKey="huntStaked" /></h2>
              <p className="font-fell text-sm text-center italic mb-3" style={{ color: '#6b5c47' }}>One exploration per expedition earns a seat at the table.</p>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between font-fell" style={{ color: '#5c4a32' }}>
                  <span>Below Deck</span>
                  <span className="font-pirata" style={{ color: '#3d3210' }}>{formatToken(stakingData.stakedBalance, DECIMALS.hunt, 2)} HUNT</span>
                </div>
                <div className="flex justify-between font-fell" style={{ color: '#5c4a32' }}>
                  <span>Available</span>
                  <span className="font-pirata" style={{ color: '#3d3210' }}>{formatToken(huntBalance, DECIMALS.hunt, 2)} HUNT</span>
                </div>
              </div>

              {/* Cooldown Status */}
              {stakingData.cooldownStatus?.status === 'active' && (
                <div className="p-2 rounded mb-3 text-center" style={{ background: '#d4c4a0', border: '2px solid #8b7355' }}>
                  <div className="font-pirata" style={{ color: '#8b6914' }}>Gangplank Lowering<CartographerNote noteKey="stakingCooldown" /></div>
                  <div className="font-fell text-xs italic" style={{ color: '#6b5c47' }}>{formatCooldown(stakingData.cooldownStatus.remaining)}</div>
                </div>
              )}

              {/* Qualification Status */}
              <div className="p-2 rounded mb-3 text-center" style={{
                background: stakingData.isQualified && stakingData.stakedBalance > 0n ? '#a8c4a8' : '#d4c4a0',
                border: stakingData.isQualified && stakingData.stakedBalance > 0n ? '2px solid #5c8b5c' : '1px solid #8b7355',
              }}>
                {stakingData.isQualified && stakingData.stakedBalance > 0n ? (
                  <span className="font-fell italic" style={{ color: '#2d4a2d' }}>✓ Seat earned for this expedition</span>
                ) : stakingData.stakedBalance > 0n ? (
                  <span className="font-fell italic" style={{ color: '#6b5c47' }}>Explore once to earn a seat</span>
                ) : (
                  <span className="font-fell italic" style={{ color: '#6b5c47' }}>Stow HUNT to join the crew's share</span>
                )}
              </div>

              {/* Stake Input */}
              {huntBalance > 0n && !stakingData.cooldownStatus?.status && (
                <div className="mb-3">
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)}
                      placeholder="Amount to stow"
                      className="flex-1 rounded p-2 text-sm"
                      style={{ background: '#f5e6c8', border: '2px solid #8b7355', color: '#3d3210', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)' }}
                      disabled={!readEnabled || isBusy}
                    />
                    <button onClick={handleMaxStake} disabled={!readEnabled || isBusy} className="px-2 py-1 rounded font-fell text-xs" style={{ background: 'rgba(92, 74, 50, 0.2)', color: '#5c4a32', border: '1px solid #8b7355' }}>MAX</button>
                  </div>
                  {needsStakingApproval ? (
                    <WoodButton onClick={handleApproveHuntForStaking} disabled={!readEnabled || isBusy} className="w-full mt-2 py-2">
                      {isApprovingHunt || isWaitingApproveHunt ? 'Approving...' : 'Approve HUNT'}
                    </WoodButton>
                  ) : (
                    <WoodButton onClick={handleStake} disabled={!readEnabled || isBusy || !stakeAmount} className="w-full mt-2 py-2">
                      {isStaking || isWaitingStake ? 'Stowing...' : 'Stow HUNT Below Deck'}
                    </WoodButton>
                  )}
                </div>
              )}

              {/* Withdraw Controls */}
              {stakingData.stakedBalance > 0n && stakingData.cooldownStatus?.status === 'none' && (
                <WoodButton onClick={handleInitiateWithdraw} variant="secondary" disabled={isBusy} className="w-full py-2">Prepare to Disembark</WoodButton>
              )}
              {stakingData.cooldownStatus?.status === 'active' && (
                <WoodButton onClick={handleCancelWithdraw} variant="secondary" disabled={isBusy} className="w-full py-2">Cancel Disembarkation</WoodButton>
              )}
              {stakingData.cooldownStatus?.status === 'ready' && (
                <WoodButton onClick={handleWithdraw} disabled={isBusy} className="w-full py-2">Complete Withdrawal</WoodButton>
              )}
            </ParchmentPanel>
          </div>

          {/* The Cartographer's Map */}
          <div className="relative mb-6 overflow-hidden" style={{
            borderRadius: '6px',
            border: '3px solid #5c4a32',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            minHeight: '220px',
          }}>
            <div className="absolute inset-0" style={{
              background: 'linear-gradient(135deg, #c9a86c 0%, #d4b87a 15%, #c19a5a 30%, #d8c088 45%, #b8944c 60%, #c9a86c 75%, #d4b87a 90%, #b89050 100%)',
            }} />
            <div className="absolute inset-0" style={{
              background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
              opacity: 0.12,
              mixBlendMode: 'multiply',
            }} />
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(60, 40, 20, 0.4) 100%)' }} />

            <div className="relative z-10 p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="relative px-4 py-2" style={{
                  background: 'linear-gradient(180deg, rgba(232, 220, 196, 0.92) 0%, rgba(212, 196, 160, 0.88) 100%)',
                  border: '1px solid #8b7355',
                  borderRadius: '3px',
                  boxShadow: '2px 3px 6px rgba(0,0,0,0.3)',
                }}>
                  <div className="absolute -top-1 left-3 w-2 h-2 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #d4a840 0%, #8b6914 100%)', boxShadow: '0 1px 2px rgba(0,0,0,0.4)' }} />
                  <h2 className="font-pirata text-xl flex items-center gap-2" style={{ color: '#3d3210' }}>
                    ◇ The Cartographer's Map<CartographerNote noteKey="map" />
                    {mapPriceTick === 'up' && <span className="text-emerald-700 animate-pulse">▲</span>}
                  </h2>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Yer MAP', value: formatToken(mapBalance, DECIMALS.map, 2), noteKey: 'map' },
                  { label: 'Price', value: `$${formatToken(mapPrice, DECIMALS.usdc, 4)}`, tick: mapPriceTick, noteKey: 'mapPrice' },
                  { label: 'Total Supply', value: formatToken(mapSupply, DECIMALS.map, 0), noteKey: 'mapSupply' },
                  { label: 'Map State', value: mapTier.name, icon: mapTier.icon, noteKey: 'mapState' },
                ].map((item, i) => (
                  <div key={i} className="relative p-3 text-center" style={{
                    background: 'linear-gradient(180deg, rgba(240, 232, 216, 0.9) 0%, rgba(220, 208, 184, 0.85) 100%)',
                    border: '1px solid #a08060',
                    borderRadius: '3px',
                    boxShadow: '2px 3px 8px rgba(0,0,0,0.25)',
                    transform: `rotate(${(i % 2 === 0 ? -0.5 : 0.5)}deg)`,
                  }}>
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full" style={{
                      background: 'radial-gradient(circle at 30% 30%, #e8c860 0%, #a08020 60%, #705810 100%)',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
                      border: '1px solid #6b5010',
                    }} />
                    <div className="font-fell text-xs" style={{ color: '#6b5c47' }}>{item.label}{item.noteKey && <CartographerNote noteKey={item.noteKey} />}</div>
                    <div className="font-pirata text-lg flex items-center justify-center gap-1 mt-1" style={{ color: '#3d3210' }}>
                      {item.icon && <span className="mr-1">{item.icon}</span>}
                      {item.value}
                      {item.tick === 'up' && <span className="text-emerald-700 text-sm">▲</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* MAP Buy/Sell Section */}
            <div className="relative border-t" style={{ borderColor: 'rgba(92, 74, 50, 0.4)' }}>
              <div className="relative z-10 p-4">
                <div className="relative max-w-md mx-auto" style={{
                  background: 'linear-gradient(180deg, rgba(240, 232, 216, 0.95) 0%, rgba(220, 208, 184, 0.92) 100%)',
                  border: '1px solid #a08060',
                  borderRadius: '4px',
                  boxShadow: '3px 4px 12px rgba(0,0,0,0.25)',
                  overflow: 'hidden',
                }}>
                  <div className="flex border-b" style={{ borderColor: 'rgba(92, 74, 50, 0.3)' }}>
                    <button onClick={() => setMapTradeMode('buy')} className="flex-1 py-3 font-pirata text-lg transition-all" style={{
                      background: mapTradeMode === 'buy' ? 'rgba(92, 74, 50, 0.15)' : 'transparent',
                      color: mapTradeMode === 'buy' ? '#3d3210' : '#8b7355',
                      borderBottom: mapTradeMode === 'buy' ? '2px solid #5c4a32' : '2px solid transparent',
                    }}>Acquire</button>
                    <button onClick={() => setMapTradeMode('sell')} className="flex-1 py-3 font-pirata text-lg transition-all" style={{
                      background: mapTradeMode === 'sell' ? 'rgba(139, 34, 34, 0.1)' : 'transparent',
                      color: mapTradeMode === 'sell' ? '#6b3030' : '#8b7355',
                      borderBottom: mapTradeMode === 'sell' ? '2px solid #8b4040' : '2px solid transparent',
                    }}>Return</button>
                  </div>

                  <div className="p-5">
                    <div className="text-center mb-4">
                      <p className="font-fell text-xs italic" style={{ color: '#6b5c47' }}>Current price: ${formatToken(mapPrice, DECIMALS.usdc, 4)} per MAP</p>
                    </div>

                    {mapTradeMode === 'buy' && (
                      <>
                        <div className="flex gap-2 mb-2">
                          {[25, 50, 75].map(pct => (
                            <button key={pct} onClick={() => {
                              if (userUsdcBalance) setMapBuyAmount(formatUnits(userUsdcBalance * BigInt(pct) / 100n, DECIMALS.usdc));
                            }} className="flex-1 py-1 rounded font-fell text-xs" style={{ background: 'rgba(92, 74, 50, 0.1)', color: '#5c4a32', border: '1px solid rgba(92, 74, 50, 0.3)' }}>{pct}%</button>
                          ))}
                          <button onClick={handleMaxMapBuy} className="flex-1 py-1 rounded font-fell text-xs font-medium" style={{ background: 'rgba(92, 74, 50, 0.15)', color: '#5c4a32', border: '1px solid rgba(92, 74, 50, 0.4)' }}>MAX</button>
                        </div>
                        <input type="number" min="0.01" step="0.01" value={mapBuyAmount} onChange={(e) => setMapBuyAmount(e.target.value)} placeholder="USDC amount" disabled={!readEnabled || isBusy} className="w-full rounded p-3 font-fell text-lg text-center mb-2" style={{ background: '#faf6f0', border: '1px solid #a08060', color: '#3d3210' }} />
                        <div className="flex justify-between mb-3 font-fell text-xs" style={{ color: '#6b5c47' }}>
                          <span>Available: ${formatToken(userUsdcBalance, DECIMALS.usdc, 2)}</span>
                        </div>
                        {needsMapApproval ? (
                          <button onClick={handleApproveUsdcForMap} disabled={!readEnabled || isBusy} className="w-full py-3 rounded font-fell transition-opacity" style={{ background: '#5c4a32', color: '#f5ece0' }}>
                            {isApprovingUsdc || isWaitingApproveUsdc ? 'Approving...' : 'Approve USDC'}
                          </button>
                        ) : (
                          <button onClick={handleBuyMap} disabled={!readEnabled || isBusy || !mapBuyAmount} className="w-full py-3 rounded font-fell transition-opacity" style={{ background: isBusy ? '#8b7355' : '#5c4a32', color: '#f5ece0', opacity: !mapBuyAmount ? 0.5 : 1, cursor: (!mapBuyAmount || isBusy) ? 'not-allowed' : 'pointer' }}>
                            {isBuyingMap || isWaitingMap ? 'Confirming...' : 'Acquire MAP'}
                          </button>
                        )}
                      </>
                    )}

                    {mapTradeMode === 'sell' && (
                      <>
                        <div className="flex gap-2 mb-2">
                          {[25, 50, 75].map(pct => (
                            <button key={pct} onClick={() => {
                              if (mapBalance) setMapSellAmount(formatUnits(mapBalance * BigInt(pct) / 100n, DECIMALS.map));
                            }} className="flex-1 py-1 rounded font-fell text-xs" style={{ background: 'rgba(139, 34, 34, 0.08)', color: '#6b3030', border: '1px solid rgba(139, 34, 34, 0.2)' }}>{pct}%</button>
                          ))}
                          <button onClick={handleMaxMapSell} className="flex-1 py-1 rounded font-fell text-xs font-medium" style={{ background: 'rgba(139, 34, 34, 0.12)', color: '#6b3030', border: '1px solid rgba(139, 34, 34, 0.3)' }}>MAX</button>
                        </div>
                        <input type="number" min="0.0001" step="0.0001" value={mapSellAmount} onChange={(e) => setMapSellAmount(e.target.value)} placeholder="MAP amount" disabled={!readEnabled || isBusy} className="w-full rounded p-3 font-fell text-lg text-center mb-2" style={{ background: '#faf6f0', border: '1px solid #a08060', color: '#3d3210' }} />
                        <div className="flex justify-between mb-3 font-fell text-xs" style={{ color: '#6b5c47' }}>
                          <span>Your MAP: {formatToken(mapBalance, DECIMALS.map, 4)}</span>
                        </div>
                        <button onClick={handleSellMap} disabled={!readEnabled || isBusy || !mapSellAmount} className="w-full py-3 rounded font-fell transition-opacity" style={{ background: isBusy ? '#8b5555' : '#8b4040', color: '#f5ece0', opacity: !mapSellAmount ? 0.5 : 1, cursor: (!mapSellAmount || isBusy) ? 'not-allowed' : 'pointer' }}>
                          {isSellingMap || isWaitingSellMap ? 'Confirming...' : 'Return MAP to the Sea'}
                        </button>
                        <p className="font-fell text-xs italic text-center mt-3" style={{ color: '#8b5c47' }}>Returning MAP burns it from the supply.</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* The Tides of Fortune */}
          <ParchmentPanel className="p-4 mb-6">
            <h2 className="font-pirata text-xl mb-3 text-center" style={{ color: '#3d3210' }}>⚓ The Tides of Fortune ⚓<CartographerNote noteKey="tidesOfFortune" /></h2>
            <div className="grid grid-cols-7 gap-2 text-center">
              {outcomes.map((o, i) => (
                <div key={i} className={`relative p-2 ${lastOutcome?.name === o.name ? 'ring-2 ring-amber-400' : ''}`} style={{
                  background: o.multiplier === 0 ? 'linear-gradient(180deg, rgba(196, 154, 154, 0.92) 0%, rgba(180, 140, 140, 0.88) 100%)'
                    : o.multiplier < 1 ? 'linear-gradient(180deg, rgba(196, 184, 154, 0.92) 0%, rgba(180, 168, 140, 0.88) 100%)'
                    : o.multiplier === 1 ? 'linear-gradient(180deg, rgba(201, 184, 150, 0.92) 0%, rgba(185, 168, 135, 0.88) 100%)'
                    : 'linear-gradient(180deg, rgba(154, 196, 168, 0.92) 0%, rgba(140, 180, 155, 0.88) 100%)',
                  border: '1px solid #8b7355',
                  borderRadius: '3px',
                  boxShadow: '1px 2px 4px rgba(0,0,0,0.3)',
                }}>
                  <div className="font-pirata text-lg" style={{ color: '#3d3210' }}>{o.name}</div>
                  <div className="font-fell text-xs" style={{ color: '#5c4a32' }}>{(o.probability * 100).toFixed(0)}%</div>
                </div>
              ))}
            </div>
          </ParchmentPanel>

          {/* Captain's Log */}
          <ParchmentPanel className="p-4 mb-6">
            <div className="flex items-center justify-between border-b pb-2 mb-3" style={{ borderColor: 'rgba(93, 74, 50, 0.3)' }}>
              <span className="font-pirata text-lg" style={{ color: '#4a3828' }}>Captain's Log<CartographerNote noteKey="captainsLog" /></span>
              <div className="flex items-center gap-3">
                <button onClick={() => setShowFullLog(true)} className="font-fell text-xs px-2 py-1 rounded transition-all hover:opacity-80" style={{
                  color: '#5c4a32',
                  background: 'linear-gradient(180deg, rgba(139, 115, 85, 0.15) 0%, rgba(93, 74, 50, 0.25) 100%)',
                  border: '1px solid rgba(93, 74, 50, 0.3)',
                }}>View Full Log</button>
                <span className="font-fell text-xs italic" style={{ color: '#6b5c47' }}>Expedition № {epochId?.toString() ?? '--'}</span>
              </div>
            </div>
            <div className="font-fell text-sm leading-relaxed" style={{ color: '#3d2818', maxHeight: '200px', overflowY: 'auto' }}>
              {log.length === 0 ? (
                <p className="italic text-center py-4" style={{ color: '#6b5c47' }}>The sea is calm… for now.</p>
              ) : (
                <div className="space-y-2">
                  {log.slice(-5).reverse().map((entry, i) => (
                    <div key={i} className="relative pl-3 py-1 border-l-2" style={{ borderColor: getLogStyle(entry.type).borderColor }}>
                      <span className="italic text-xs opacity-60 mr-2" style={{ color: '#6b5c47' }}>{entry.time}</span>
                      <span style={{ color: entry.type === 'discovery' ? '#3d3210' : '#4a3828', fontWeight: getLogStyle(entry.type).fontWeight || 'normal' }}>{entry.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ParchmentPanel>

          {/* Footer */}
          <div className="text-center mt-8">
            <InkDivider />
            <p className="font-pirata text-lg" style={{ color: '#5c4a32' }}>The chest resets. The map expands. The expedition continues.</p>
            <p className="font-fell text-sm italic mt-2" style={{ color: '#3d3210' }}>Treasure Hunt — Live on {SUPPORTED_CHAIN_NAME}</p>
          </div>
        </div>

        {/* Connection Gate */}
        {!DEMO_MODE && (!isConnected || isWrongNetwork || !configReady || !walletConnectProjectId) && (
          <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(15, 13, 10, 0.95)' }}>
            <ParchmentPanel className="p-8 max-w-md text-center">
              <h3 className="font-pirata text-2xl mb-4" style={{ color: '#3d3210' }}>⚓ Connect to Continue</h3>
              <p className="font-fell mb-4" style={{ color: '#5c4a32' }}>The expedition awaits a wallet on {SUPPORTED_CHAIN_NAME}.</p>
              {isWrongNetwork && <p className="font-fell text-sm mb-4" style={{ color: '#8b3030' }}>Wrong network detected.</p>}
              <div className="flex justify-center gap-3">
                <ConnectButton showBalance={false} chainStatus="icon" />
                {isWrongNetwork && switchChain && (
                  <WoodButton onClick={() => switchChain({ chainId: SUPPORTED_CHAIN_ID })} className="px-4 py-2">Switch Network</WoodButton>
                )}
              </div>
              {!walletConnectProjectId && <p className="font-fell text-xs mt-4" style={{ color: '#8b5c47' }}>Missing {REQUIRED_ENV.walletConnect}</p>}
              {!configReady && <p className="font-fell text-xs mt-2" style={{ color: '#8b5c47' }}>Missing addresses: {addressIssues.map(k => REQUIRED_ENV[k]).join(', ')}</p>}
            </ParchmentPanel>
          </div>
        )}
      </div>
    </CartographerNotesContext.Provider>
  );
}
