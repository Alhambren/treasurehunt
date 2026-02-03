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
// DESIGN TOKENS — Card-based composition
// ============================================================================
const CARD_WIDTH = 320; // Fixed card width
const CARD_GAP = 16;
const CARD_PADDING = 20;

// ============================================================================
// CARTOGRAPHER'S NOTES — Floating ? Explainers
// Highest z-index, next to labels, dismiss on mouse leave
// ============================================================================
const NOTE_WIDTH = 260;

const cartographerNotes = {
  expedition: "The expedition advances each time the treasure is found. This is how far we've come.",
  mapSize: "The treasure chest can hold no more than this. When reached or found, the chest resets and doubles.",
  contributions: "Every explorer who gives to the sea is marked here. The more who contribute, the less HUNT is minted.",
  emissionRate: "HUNT flows freely at first, then slows as the map fills with names.",
  treasureChest: "Gold accumulates here until found. Anyone may discover it — the sea chooses.",
  beginExploration: "Contribute to the expedition. Losses fund the chest. Wins return multiplied.",
  huntWallet: "The token earned through exploration. Stake it to share in discoveries.",
  huntStaked: "HUNT stowed below deck. Stakers share discoveries — if they've explored this expedition.",
  stakingCooldown: "Seven days to leave the crew. This is the remaining time before withdrawal.",
  map: "A bonding-curve token. Bought with USDC. Rises as others contribute.",
  mapPrice: "The current cost to acquire one MAP. Increases as supply grows.",
  mapSupply: "Total MAP in existence. Minted through the bonding curve.",
  mapState: "The tier of the map, from Blank Parchment to Myth Made Real.",
  captainsLog: "The record of this voyage. Events, discoveries, and fortunes.",
  tidesOfFortune: "The possible fates of each exploration. The sea decides.",
};

const CartographerNotesContext = createContext(null);

const CartographerNotesOverlay = ({ activeNote, anchorRect }) => {
  if (!activeNote || !anchorRect) return null;
  const note = cartographerNotes[activeNote];
  if (!note) return null;

  // Position near the anchor, not at edges
  const top = anchorRect.bottom + 8;
  const left = Math.max(12, Math.min(anchorRect.left, window.innerWidth - NOTE_WIDTH - 12));

  return (
    <div style={{
      position: 'fixed',
      top,
      left,
      width: NOTE_WIDTH,
      zIndex: 99999, // Highest z-index
      pointerEvents: 'none',
      animation: 'fadeIn 0.15s ease-out',
    }}>
      <div style={{
        padding: '12px 14px',
        background: '#f5efe0',
        border: '1px solid #c9b896',
        borderRadius: '4px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        color: '#4a3a28',
        fontSize: '13px',
        fontStyle: 'italic',
        lineHeight: 1.5,
        fontFamily: "'IM Fell English', Georgia, serif",
      }}>
        {note}
      </div>
    </div>
  );
};

// Floating ? icon - sits next to labels, dismisses on leave
const NoteIcon = ({ noteKey }) => {
  const ctx = useContext(CartographerNotesContext);
  const ref = useRef(null);
  if (!cartographerNotes[noteKey]) return null;

  return (
    <span
      ref={ref}
      onMouseEnter={() => {
        if (ref.current && ctx) {
          ctx.show(noteKey, ref.current.getBoundingClientRect());
        }
      }}
      onMouseLeave={() => ctx?.hide()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 14,
        height: 14,
        marginLeft: 6,
        borderRadius: '50%',
        background: ctx?.activeNote === noteKey ? '#8b7355' : '#c9b896',
        color: ctx?.activeNote === noteKey ? '#fff' : '#5c4a32',
        fontSize: 10,
        fontWeight: 600,
        cursor: 'help',
        verticalAlign: 'middle',
        transition: 'all 0.15s',
        fontStyle: 'normal',
      }}
    >
      ?
    </span>
  );
};

// ============================================================================
// UTILITIES
// ============================================================================
const formatToken = (value, decimals, maxFrac = 4) => {
  if (value === null || value === undefined) return '--';
  const raw = formatUnits(value, decimals);
  const [whole, frac = ''] = raw.split('.');
  const clipped = frac.slice(0, maxFrac).replace(/0+$/, '');
  const wholeFormatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return clipped.length ? `${wholeFormatted}.${clipped}` : wholeFormatted;
};

const shortAddress = (value) => {
  if (!value || !isAddress(value)) return '--';
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};

const formatTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

const outcomes = [
  { name: "0×", label: "The Sea Claims Its Due", probability: 0.40, multiplier: 0 },
  { name: "½×", label: "A Modest Return", probability: 0.22, multiplier: 0.5 },
  { name: "1×", label: "Safe Harbor", probability: 0.18, multiplier: 1.0 },
  { name: "1½×", label: "Favorable Winds", probability: 0.10, multiplier: 1.5 },
  { name: "2×", label: "Strong Tides", probability: 0.06, multiplier: 2.0 },
  { name: "4×", label: "A Rare Surge", probability: 0.03, multiplier: 4.0 },
  { name: "10×", label: "Legendary Fortune", probability: 0.01, multiplier: 10.0 },
];

const mapBuyMessages = [
  "The gods favor us.",
  "New coastlines emerge.",
  "The winds are with us.",
  "The parchment grows wiser.",
  "Old ink finds new meaning.",
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
// CARD COMPONENT — Fixed width, consistent styling
// ============================================================================
const Card = ({ children, title, noteKey, width = CARD_WIDTH, glow = false, style = {} }) => (
  <div style={{
    width,
    background: '#f8f4eb',
    border: glow ? '2px solid #c9a227' : '1px solid #d4c4a0',
    borderRadius: 8,
    boxShadow: glow
      ? '0 0 20px rgba(201, 162, 39, 0.3), 0 4px 12px rgba(0,0,0,0.1)'
      : '0 2px 8px rgba(0,0,0,0.08)',
    overflow: 'hidden',
    ...style,
  }}>
    {title && (
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #e8dcc4',
        background: '#f0e6d2',
      }}>
        <span style={{
          fontFamily: "'Pirata One', cursive",
          fontSize: 18,
          color: '#3d3210',
        }}>
          {title}
          {noteKey && <NoteIcon noteKey={noteKey} />}
        </span>
      </div>
    )}
    <div style={{ padding: CARD_PADDING }}>
      {children}
    </div>
  </div>
);

// Small stat card for expedition state
const StatCard = ({ label, value, noteKey }) => (
  <div style={{
    background: '#f8f4eb',
    border: '1px solid #d4c4a0',
    borderRadius: 6,
    padding: '12px 16px',
    textAlign: 'center',
    minWidth: 140,
  }}>
    <div style={{
      fontSize: 12,
      color: '#6b5c47',
      marginBottom: 4,
      fontFamily: "'IM Fell English', Georgia, serif",
    }}>
      {label}
      {noteKey && <NoteIcon noteKey={noteKey} />}
    </div>
    <div style={{
      fontSize: 20,
      fontWeight: 600,
      color: '#3d3210',
      fontFamily: "'Pirata One', cursive",
    }}>
      {value}
    </div>
  </div>
);

// Row inside a card
const CardRow = ({ label, value, noteKey, highlight = false }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #e8dcc4',
  }}>
    <span style={{
      fontSize: 14,
      color: '#5c4a32',
      fontFamily: "'IM Fell English', Georgia, serif",
    }}>
      {label}
      {noteKey && <NoteIcon noteKey={noteKey} />}
    </span>
    <span style={{
      fontSize: 16,
      fontWeight: highlight ? 600 : 400,
      color: highlight ? '#3d3210' : '#4a3a28',
      fontFamily: "'Pirata One', cursive",
    }}>
      {value}
    </span>
  </div>
);

// Button
const Btn = ({ children, onClick, disabled, variant = 'primary', style = {} }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      width: '100%',
      padding: '12px 16px',
      border: 'none',
      borderRadius: 6,
      fontSize: 16,
      fontFamily: "'Pirata One', cursive",
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'all 0.15s',
      background: variant === 'primary'
        ? 'linear-gradient(180deg, #8b6914 0%, #5c4a12 100%)'
        : variant === 'danger'
          ? 'linear-gradient(180deg, #8b3030 0%, #5c2020 100%)'
          : '#e8dcc4',
      color: variant === 'primary' || variant === 'danger' ? '#f5e6c8' : '#5c4a32',
      boxShadow: disabled ? 'none' : '0 2px 4px rgba(0,0,0,0.2)',
      ...style,
    }}
  >
    {children}
  </button>
);

// Input
const Input = ({ value, onChange, placeholder, disabled, type = 'number', style = {} }) => (
  <input
    type={type}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    disabled={disabled}
    style={{
      width: '100%',
      padding: '10px 12px',
      border: '1px solid #c9b896',
      borderRadius: 6,
      fontSize: 16,
      background: disabled ? '#f0e6d2' : '#fff',
      color: '#3d3210',
      fontFamily: "'IM Fell English', Georgia, serif",
      ...style,
    }}
  />
);

// ============================================================================
// MAIN APP
// ============================================================================
export default function App() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();

  // Hooks
  const { txHistory, addTx, updateTx, clearHistory } = useTxCenter();
  const { pendingBetsArray, addPendingBet, resolveBet } = usePendingBets();
  const { logTx, logEvent, logError } = useLogger(chainId);
  const stakingData = useStakingData(address);

  // UI state
  const [log, setLog] = useState([]);
  const [showFullLog, setShowFullLog] = useState(false);
  const [treasureGlow, setTreasureGlow] = useState(false);
  const [mapMessage, setMapMessage] = useState(null);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [discovery, setDiscovery] = useState(null);
  const [lastOutcome, setLastOutcome] = useState(null);
  const discoveryTimeoutRef = useRef(null);

  // Inputs
  const [betAmount, setBetAmount] = useState('');
  const [stakeAmount, setStakeAmount] = useState('');
  const [mapBuyAmount, setMapBuyAmount] = useState('');
  const [mapSellAmount, setMapSellAmount] = useState('');
  const [mapTradeMode, setMapTradeMode] = useState('buy');

  // Notes state
  const [activeNote, setActiveNote] = useState(null);
  const [noteRect, setNoteRect] = useState(null);

  const noteManager = {
    activeNote,
    show: (key, rect) => { setActiveNote(key); setNoteRect(rect); },
    hide: () => { setActiveNote(null); setNoteRect(null); },
  };

  const isWrongNetwork = isConnected && chainId !== SUPPORTED_CHAIN_ID;
  const readEnabled = isConnected && !isWrongNetwork && configReady;

  // Write hooks
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
  const { isLoading: isWaitingApproveUsdc } = useWaitForTransactionReceipt({ hash: approveUsdcHash });
  const { isLoading: isWaitingApproveHunt } = useWaitForTransactionReceipt({ hash: approveHuntHash });
  const { isLoading: isWaitingBet } = useWaitForTransactionReceipt({ hash: placeBetHash });
  const { isLoading: isWaitingMap } = useWaitForTransactionReceipt({ hash: buyMapHash });
  const { isLoading: isWaitingSellMap } = useWaitForTransactionReceipt({ hash: sellMapHash });
  const { isLoading: isWaitingStake } = useWaitForTransactionReceipt({ hash: stakeHuntHash });

  const addLog = useCallback((message, type = 'info', detail = null) => {
    setLog(prev => [...prev.slice(-29), { message, type, detail, time: formatTime() }]);
  }, []);

  const triggerTreasureGlow = useCallback(() => {
    setTreasureGlow(true);
    setTimeout(() => setTreasureGlow(false), 2500);
  }, []);

  const triggerMapMessage = useCallback(() => {
    const msg = mapBuyMessages[Math.floor(Math.random() * mapBuyMessages.length)];
    setMapMessage(msg);
    setTimeout(() => setMapMessage(null), 3000);
  }, []);

  const triggerDiscovery = useCallback((payload) => {
    setDiscovery(payload);
    setShowDiscovery(true);
    triggerTreasureGlow();
    if (discoveryTimeoutRef.current) clearTimeout(discoveryTimeoutRef.current);
    discoveryTimeoutRef.current = setTimeout(() => setShowDiscovery(false), 5000);
  }, [triggerTreasureGlow]);

  useEffect(() => () => { if (discoveryTimeoutRef.current) clearTimeout(discoveryTimeoutRef.current); }, []);

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

  const [jBalance, mValue, epochId, n0Value, , mapPrice, mapSupply] = useMemo(() => {
    return (globalReads.data || []).map(e => e?.result ?? null);
  }, [globalReads.data]);

  const [huntBalance, mapBalance, stakedBalance, userUsdcBalance, engineAllowance, mapAllowance, stakingAllowance] = useMemo(() => {
    return (userReads.data || []).map(e => e?.result ?? null);
  }, [userReads.data]);

  const chestProgress = useMemo(() => {
    if (!jBalance || !mValue || mValue === 0n) return 0;
    return clamp(Number((jBalance * 10000n) / mValue) / 100, 0, 100);
  }, [jBalance, mValue]);

  const maxBet = useMemo(() => mValue ? mValue / 100n : 0n, [mValue]);
  const minBet = 100_000n;
  const mapTier = getMapTier(mapPrice);

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
    addLog("Approving USDC for exploration...", 'tx');
  }, [approveUsdc, addLog]);

  const handleApproveUsdcForMap = useCallback(() => {
    if (!addresses.usdc || !addresses.mapToken) return;
    approveUsdc({ address: addresses.usdc, abi: erc20Abi, functionName: 'approve', args: [addresses.mapToken, maxUint256] });
    addLog("Approving USDC for the cartographer...", 'tx');
  }, [approveUsdc, addLog]);

  const handleApproveHuntForStaking = useCallback(() => {
    if (!addresses.huntToken || !addresses.huntStaking) return;
    approveHunt({ address: addresses.huntToken, abi: erc20Abi, functionName: 'approve', args: [addresses.huntStaking, maxUint256] });
    addLog("Approving HUNT for staking...", 'tx');
  }, [approveHunt, addLog]);

  const handlePlaceBet = useCallback(() => {
    if (!betAmount || !addresses.treasureEngine) return;
    try {
      const amount = parseUnits(betAmount, DECIMALS.usdc);
      if (amount < minBet || amount > maxBet) {
        addLog("Amount out of range", 'error');
        return;
      }
      placeBet({ address: addresses.treasureEngine, abi: treasureEngineAbi, functionName: 'placeBet', args: [amount] });
      addLog(`Exploring with ${betAmount} USDC...`, 'expedition');
      setBetAmount('');
    } catch (e) { logError('place-bet', e); }
  }, [betAmount, placeBet, addLog, maxBet, logError]);

  const handleBuyMap = useCallback(() => {
    if (!mapBuyAmount || !addresses.mapToken) return;
    try {
      const amount = parseUnits(mapBuyAmount, DECIMALS.usdc);
      buyMap({ address: addresses.mapToken, abi: mapTokenAbi, functionName: 'buy', args: [amount] });
      addLog(`Acquiring MAP for ${mapBuyAmount} USDC...`, 'map');
      setMapBuyAmount('');
    } catch (e) { logError('buy-map', e); }
  }, [mapBuyAmount, buyMap, addLog, logError]);

  const handleSellMap = useCallback(() => {
    if (!mapSellAmount || !addresses.mapToken) return;
    try {
      const amount = parseUnits(mapSellAmount, DECIMALS.map);
      sellMap({ address: addresses.mapToken, abi: mapTokenAbi, functionName: 'sell', args: [amount] });
      addLog(`Returning ${mapSellAmount} MAP...`, 'map');
      setMapSellAmount('');
    } catch (e) { logError('sell-map', e); }
  }, [mapSellAmount, sellMap, addLog, logError]);

  const handleStake = useCallback(() => {
    if (!stakeAmount || !addresses.huntStaking) return;
    try {
      const amount = parseUnits(stakeAmount, DECIMALS.hunt);
      stakeHunt({ address: addresses.huntStaking, abi: huntStakingAbi, functionName: 'stake', args: [amount] });
      addLog("Stowing HUNT below deck...", 'stake');
      setStakeAmount('');
    } catch (e) { logError('stake', e); }
  }, [stakeAmount, stakeHunt, addLog, logError]);

  const handleInitiateWithdraw = useCallback(() => {
    if (!addresses.huntStaking) return;
    initiateWithdraw({ address: addresses.huntStaking, abi: huntStakingAbi, functionName: 'initiateWithdraw' });
    addLog("Starting 7-day cooldown...", 'stake');
  }, [initiateWithdraw, addLog]);

  const handleCancelWithdraw = useCallback(() => {
    if (!addresses.huntStaking) return;
    cancelWithdraw({ address: addresses.huntStaking, abi: huntStakingAbi, functionName: 'cancelWithdraw' });
    addLog("Cooldown cancelled.", 'stake');
  }, [cancelWithdraw, addLog]);

  const handleWithdraw = useCallback(() => {
    if (!addresses.huntStaking || !stakingData.stakedBalance) return;
    withdrawHunt({ address: addresses.huntStaking, abi: huntStakingAbi, functionName: 'withdraw', args: [stakingData.stakedBalance] });
    addLog("Withdrawing HUNT...", 'stake');
  }, [withdrawHunt, addLog, stakingData.stakedBalance]);

  const handleMintFaucet = useCallback(() => {
    if (!addresses.usdc || !address) return;
    mintFaucet({ address: addresses.usdc, abi: mockUsdcAbi, functionName: 'mint', args: [address, parseUnits('1000', DECIMALS.usdc)] });
    addLog("Minting 1000 test USDC...", 'tx');
  }, [mintFaucet, address, addLog]);

  // Max buttons
  const handleMaxBet = useCallback(() => {
    if (!userUsdcBalance || !maxBet) return;
    setBetAmount(formatUnits(userUsdcBalance < maxBet ? userUsdcBalance : maxBet, DECIMALS.usdc));
  }, [userUsdcBalance, maxBet]);

  const handleMaxStake = useCallback(() => {
    if (!huntBalance) return;
    setStakeAmount(formatUnits(huntBalance, DECIMALS.hunt));
  }, [huntBalance]);

  const handleMaxMapBuy = useCallback(() => {
    if (!userUsdcBalance) return;
    const max = 50_000_000_000n;
    setMapBuyAmount(formatUnits(userUsdcBalance < max ? userUsdcBalance : max, DECIMALS.usdc));
  }, [userUsdcBalance]);

  const handleMaxMapSell = useCallback(() => {
    if (!mapBalance || !mapSupply) return;
    const max = mapSupply / 100n;
    setMapSellAmount(formatUnits(mapBalance < max ? mapBalance : max, DECIMALS.map));
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
        logEvent('TreasureDiscovered', { discoverer, amount: amount?.toString() });
        addLog(`⚓ TREASURE FOUND!`, 'discovery', `${formatToken(amount, DECIMALS.usdc, 2)} USDC`);
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
        if (participant?.toLowerCase() === address?.toLowerCase()) {
          addPendingBet(requestId, { amount, bettor: participant, txHash: lg.transactionHash });
          addLog(`Awaiting the oracle...`, 'expedition');
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
        if (participant?.toLowerCase() === address?.toLowerCase()) {
          const isWin = payout > 0n;
          const outcomeData = outcomes[outcomeIndex] || outcomes[0];
          setLastOutcome(outcomeData);
          pendingBetsArray.forEach(b => {
            if (b.bettor?.toLowerCase() === participant?.toLowerCase()) {
              resolveBet(b.requestId, { payout, outcomeIndex, isWin });
            }
          });
          if (isWin) {
            addLog(outcomeData.label, 'win', `+${formatToken(payout, DECIMALS.usdc, 2)} USDC`);
          } else {
            addLog("The sea claims its due.", 'loss', `${formatToken(amount, DECIMALS.usdc, 2)} to chest`);
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
        const { buyer, mapOut } = lg.args || {};
        if (buyer?.toLowerCase() === address?.toLowerCase()) {
          addLog("MAP acquired", 'map', `+${formatToken(mapOut, DECIMALS.map, 3)} MAP`);
          triggerMapMessage();
        }
      });
    },
  });

  const isBusy = isApprovingUsdc || isApprovingHunt || isPlacingBet || isBuyingMap || isSellingMap || isStaking ||
    isWaitingApproveUsdc || isWaitingApproveHunt || isWaitingBet || isWaitingMap || isWaitingSellMap || isWaitingStake ||
    isInitiatingWithdraw || isCancellingWithdraw || isWithdrawing || isMinting || isWaitingMint;

  const formatCooldown = (ms) => {
    if (!ms) return '--';
    const d = Math.floor(ms / (24 * 60 * 60 * 1000));
    const h = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    return `${d}d ${h}h`;
  };

  // Demo trigger
  const triggerDemo = useCallback(() => {
    if (!DEMO_MODE) return;
    addLog("⚓ TREASURE FOUND!", 'discovery', '123.45 USDC');
    triggerDiscovery({ amount: 123_450_000n, epoch: epochId, discoverer: address, isDemo: true });
  }, [addLog, triggerDiscovery, epochId, address]);

  // ==========================================================================
  // RENDER — Card-based grid layout
  // ==========================================================================
  return (
    <CartographerNotesContext.Provider value={noteManager}>
      <CartographerNotesOverlay activeNote={activeNote} anchorRect={noteRect} />

      {/* TREASURE DISCOVERY OVERLAY — Full screen, centered, blocks interaction */}
      {showDiscovery && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.85)',
        }}>
          <div style={{
            textAlign: 'center',
            padding: 48,
            background: 'radial-gradient(circle, #2a2210 0%, #1a1508 100%)',
            border: '3px solid #c9a227',
            borderRadius: 12,
            boxShadow: '0 0 80px rgba(201, 162, 39, 0.5)',
            animation: 'pulse 1s ease-in-out infinite',
          }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>💰⚓💰</div>
            <h1 style={{
              fontFamily: "'Pirata One', cursive",
              fontSize: 48,
              color: '#ffd700',
              textShadow: '0 0 20px rgba(255,215,0,0.8)',
              margin: 0,
            }}>
              TREASURE DISCOVERED!
            </h1>
            <p style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              fontSize: 24,
              color: '#f5e6c8',
              marginTop: 16,
            }}>
              {formatToken(discovery?.amount, DECIMALS.usdc, 2)} USDC
            </p>
            <p style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              fontSize: 16,
              color: '#8b7355',
              marginTop: 8,
              fontStyle: 'italic',
            }}>
              The chest has opened. The crew cheers.
            </p>
          </div>
        </div>
      )}

      {/* FULL LOG MODAL */}
      {showFullLog && (
        <div
          onClick={() => setShowFullLog(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 90000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.8)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 500,
              maxHeight: '80vh',
              background: '#f8f4eb',
              border: '2px solid #c9b896',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <div style={{
              padding: 16,
              borderBottom: '1px solid #e8dcc4',
              background: '#f0e6d2',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontFamily: "'Pirata One', cursive", fontSize: 20, color: '#3d3210' }}>
                Captain's Log
              </span>
              <button
                onClick={() => setShowFullLog(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 20,
                  cursor: 'pointer',
                  color: '#5c4a32',
                }}
              >×</button>
            </div>
            <div style={{ padding: 16, maxHeight: 'calc(80vh - 60px)', overflowY: 'auto' }}>
              {log.length === 0 ? (
                <p style={{ color: '#8b7355', fontStyle: 'italic', textAlign: 'center' }}>
                  The pages remain blank...
                </p>
              ) : (
                log.slice().reverse().map((entry, i) => (
                  <div key={i} style={{
                    padding: '12px 0',
                    borderBottom: '1px solid #e8dcc4',
                  }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 4,
                    }}>
                      <span style={{
                        fontFamily: "'IM Fell English', Georgia, serif",
                        fontStyle: 'italic',
                        color: entry.type === 'discovery' ? '#c9a227' : entry.type === 'win' ? '#2d6b4a' : '#4a3a28',
                      }}>
                        {entry.message}
                      </span>
                      <span style={{ fontSize: 12, color: '#8b7355' }}>{entry.time}</span>
                    </div>
                    {entry.detail && (
                      <span style={{
                        fontSize: 14,
                        color: '#5c4a32',
                        fontFamily: "'Pirata One', cursive",
                      }}>
                        {entry.detail}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #1a1510 0%, #0f0d0a 100%)',
        padding: 24,
      }}>
        {/* Fonts */}
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Pirata+One&family=IM+Fell+English:ital@0;1&display=swap');
          @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.02); } }
          * { box-sizing: border-box; }
        `}</style>

        {/* HEADER */}
        <div style={{
          maxWidth: 1100,
          margin: '0 auto 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h1 style={{
              fontFamily: "'Pirata One', cursive",
              fontSize: 36,
              color: '#c9a227',
              margin: 0,
              textShadow: '2px 2px 0 #3d3210',
            }}>
              ⚓ TREASURE HUNT
            </h1>
            <p style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              color: '#8b7355',
              margin: '4px 0 0',
              fontStyle: 'italic',
            }}>
              An Autonomous Economic Game
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isWrongNetwork && (
              <span style={{ color: '#ff6b6b', fontSize: 14 }}>Wrong Network</span>
            )}
            <ConnectButton showBalance={false} chainStatus="icon" />
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* EXPEDITION STATE — 4 small stat cards */}
          <div style={{
            display: 'flex',
            gap: CARD_GAP,
            marginBottom: 24,
            flexWrap: 'wrap',
          }}>
            <StatCard label="Expedition" value={`#${epochId?.toString() ?? '--'}`} noteKey="expedition" />
            <StatCard label="Map Size (M)" value={`$${formatToken(mValue, DECIMALS.usdc, 0)}`} noteKey="mapSize" />
            <StatCard label="Contributions" value={n0Value?.toString() ?? '--'} noteKey="contributions" />
            <StatCard label="Emission Rate" value={n0Value ? `${(1 / (1 + Number(n0Value) / 100000) * 100).toFixed(0)}%` : '--'} noteKey="emissionRate" />
          </div>

          {/* TREASURE CHEST CARD */}
          <Card
            title="⚓ The Treasure Chest"
            noteKey="treasureChest"
            width="100%"
            glow={treasureGlow}
            style={{ marginBottom: 24, maxWidth: 700 }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 12,
              fontFamily: "'Pirata One', cursive",
              fontSize: 20,
              color: '#3d3210',
            }}>
              <span>${formatToken(jBalance, DECIMALS.usdc, 2)}</span>
              <span style={{ color: '#8b7355' }}>/ ${formatToken(mValue, DECIMALS.usdc, 0)}</span>
            </div>
            <div style={{
              height: 24,
              background: '#e8dcc4',
              borderRadius: 12,
              overflow: 'hidden',
              border: '1px solid #c9b896',
            }}>
              <div style={{
                height: '100%',
                width: `${chestProgress}%`,
                background: treasureGlow
                  ? 'linear-gradient(90deg, #ffd700, #ffec8b, #ffd700)'
                  : 'linear-gradient(90deg, #8b6914, #c9a227, #8b6914)',
                borderRadius: 12,
                transition: 'width 0.5s, background 0.3s',
                boxShadow: treasureGlow ? '0 0 10px rgba(255,215,0,0.5)' : 'none',
              }} />
            </div>
            <p style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              fontStyle: 'italic',
              color: '#6b5c47',
              fontSize: 14,
              marginTop: 12,
              textAlign: 'center',
            }}>
              {treasureGlow ? "The chest rattles as it fills…" : "The closer we draw, the quieter the sea."}
            </p>
          </Card>

          {/* MAIN CARDS GRID — Exploration, Holdings, Ship's Hold */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(3, ${CARD_WIDTH}px)`,
            gap: CARD_GAP,
            marginBottom: 24,
          }}>

            {/* EXPLORATION CARD */}
            <Card title="🧭 Exploration" noteKey="beginExploration">
              <div style={{ marginBottom: 16 }}>
                <label style={{
                  display: 'block',
                  fontSize: 13,
                  color: '#6b5c47',
                  marginBottom: 6,
                  fontFamily: "'IM Fell English', Georgia, serif",
                }}>
                  Contribution (USDC)
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input
                    value={betAmount}
                    onChange={e => setBetAmount(e.target.value)}
                    placeholder={`${formatToken(minBet, DECIMALS.usdc, 2)} - ${formatToken(maxBet, DECIMALS.usdc, 2)}`}
                    disabled={!readEnabled || isBusy}
                    style={{ flex: 1 }}
                  />
                  <button
                    onClick={handleMaxBet}
                    disabled={!readEnabled || isBusy}
                    style={{
                      padding: '8px 12px',
                      background: '#e8dcc4',
                      border: '1px solid #c9b896',
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                      color: '#5c4a32',
                    }}
                  >MAX</button>
                </div>
              </div>

              {needsEngineApproval ? (
                <Btn onClick={handleApproveUsdcForEngine} disabled={!readEnabled || isBusy}>
                  {isApprovingUsdc || isWaitingApproveUsdc ? 'Approving...' : 'Approve USDC'}
                </Btn>
              ) : (
                <Btn onClick={handlePlaceBet} disabled={!readEnabled || isBusy || !betAmount}>
                  {isPlacingBet || isWaitingBet ? 'Exploring...' : 'Begin Exploration'}
                </Btn>
              )}

              {lastOutcome && (
                <div style={{
                  marginTop: 16,
                  padding: 12,
                  background: '#f0e6d2',
                  borderRadius: 6,
                  textAlign: 'center',
                }}>
                  <div style={{ fontFamily: "'Pirata One', cursive", color: '#3d3210', fontSize: 18 }}>
                    {lastOutcome.name}
                  </div>
                  <div style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: 'italic', color: '#5c4a32', fontSize: 13 }}>
                    {lastOutcome.label}
                  </div>
                </div>
              )}

              {DEMO_MODE && (
                <button
                  onClick={triggerDemo}
                  style={{
                    marginTop: 12,
                    width: '100%',
                    padding: 8,
                    background: 'transparent',
                    border: '1px dashed #8b7355',
                    borderRadius: 4,
                    fontSize: 12,
                    color: '#8b7355',
                    cursor: 'pointer',
                  }}
                >
                  [Demo: Trigger Discovery]
                </button>
              )}

              {SUPPORTED_CHAIN_ID === 84532 && (
                <button
                  onClick={handleMintFaucet}
                  disabled={!readEnabled || isBusy}
                  style={{
                    marginTop: 12,
                    width: '100%',
                    padding: 8,
                    background: '#e8dcc4',
                    border: '1px solid #c9b896',
                    borderRadius: 4,
                    fontSize: 12,
                    color: '#5c4a32',
                    cursor: 'pointer',
                  }}
                >
                  {isMinting || isWaitingMint ? 'Minting...' : '🪙 Faucet: 1000 USDC'}
                </button>
              )}
            </Card>

            {/* HOLDINGS CARD */}
            <Card title="☠ Holdings">
              <CardRow label="● Doubloons" value={`$${formatToken(userUsdcBalance, DECIMALS.usdc, 2)}`} highlight />
              <CardRow label="⊕ HUNT" value={formatToken(huntBalance, DECIMALS.hunt, 2)} noteKey="huntWallet" />
              <CardRow label="⚓ Staked HUNT" value={formatToken(stakingData.stakedBalance, DECIMALS.hunt, 2)} noteKey="huntStaked" />
              <CardRow label="◇ MAP" value={formatToken(mapBalance, DECIMALS.map, 2)} noteKey="map" />
            </Card>

            {/* SHIP'S HOLD (STAKING) CARD */}
            <Card title="⚓ Ship's Hold" noteKey="huntStaked">
              <p style={{
                fontFamily: "'IM Fell English', Georgia, serif",
                fontStyle: 'italic',
                color: '#6b5c47',
                fontSize: 13,
                marginBottom: 16,
              }}>
                Stake HUNT to share in discoveries.
              </p>

              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#5c4a32', marginBottom: 4 }}>
                  <span>Below Deck</span>
                  <span style={{ fontFamily: "'Pirata One', cursive" }}>{formatToken(stakingData.stakedBalance, DECIMALS.hunt, 2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#5c4a32' }}>
                  <span>Available</span>
                  <span style={{ fontFamily: "'Pirata One', cursive" }}>{formatToken(huntBalance, DECIMALS.hunt, 2)}</span>
                </div>
              </div>

              {/* Cooldown status */}
              {stakingData.cooldownStatus?.status === 'active' && (
                <div style={{
                  padding: 10,
                  background: '#f0e6d2',
                  borderRadius: 6,
                  marginBottom: 12,
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 13, color: '#8b6914' }}>
                    Cooldown: {formatCooldown(stakingData.cooldownStatus.remaining)}
                    <NoteIcon noteKey="stakingCooldown" />
                  </div>
                </div>
              )}

              {/* Qualification status */}
              <div style={{
                padding: 10,
                background: stakingData.isQualified && stakingData.stakedBalance > 0n ? '#e8f5e8' : '#f0e6d2',
                borderRadius: 6,
                marginBottom: 12,
                textAlign: 'center',
                fontSize: 13,
                color: stakingData.isQualified && stakingData.stakedBalance > 0n ? '#2d6b4a' : '#6b5c47',
                fontStyle: 'italic',
              }}>
                {stakingData.isQualified && stakingData.stakedBalance > 0n
                  ? '✓ Qualified for this expedition'
                  : stakingData.stakedBalance > 0n
                    ? 'Explore once to qualify'
                    : 'Stake HUNT to join the crew'}
              </div>

              {/* Stake input */}
              {huntBalance > 0n && !stakingData.cooldownStatus?.status && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <Input
                      value={stakeAmount}
                      onChange={e => setStakeAmount(e.target.value)}
                      placeholder="Amount"
                      disabled={!readEnabled || isBusy}
                      style={{ flex: 1 }}
                    />
                    <button
                      onClick={handleMaxStake}
                      disabled={!readEnabled || isBusy}
                      style={{
                        padding: '8px 12px',
                        background: '#e8dcc4',
                        border: '1px solid #c9b896',
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: 'pointer',
                        color: '#5c4a32',
                      }}
                    >MAX</button>
                  </div>
                  {needsStakingApproval ? (
                    <Btn onClick={handleApproveHuntForStaking} disabled={!readEnabled || isBusy}>
                      {isApprovingHunt || isWaitingApproveHunt ? 'Approving...' : 'Approve HUNT'}
                    </Btn>
                  ) : (
                    <Btn onClick={handleStake} disabled={!readEnabled || isBusy || !stakeAmount}>
                      {isStaking || isWaitingStake ? 'Staking...' : 'Stake'}
                    </Btn>
                  )}
                </div>
              )}

              {/* Withdraw controls */}
              {stakingData.stakedBalance > 0n && stakingData.cooldownStatus?.status === 'none' && (
                <Btn onClick={handleInitiateWithdraw} disabled={isBusy} variant="secondary">
                  Start Withdrawal
                </Btn>
              )}
              {stakingData.cooldownStatus?.status === 'active' && (
                <Btn onClick={handleCancelWithdraw} disabled={isBusy} variant="secondary">
                  Cancel
                </Btn>
              )}
              {stakingData.cooldownStatus?.status === 'ready' && (
                <Btn onClick={handleWithdraw} disabled={isBusy}>
                  Withdraw
                </Btn>
              )}
            </Card>
          </div>

          {/* CARTOGRAPHER'S MAP — Parchment background with pinned stat cards */}
          <div style={{
            position: 'relative',
            marginBottom: 24,
            padding: 24,
            borderRadius: 8,
            overflow: 'hidden',
            // Parchment map background
            background: `
              linear-gradient(135deg, #c9a86c 0%, #d4b87a 20%, #c19a5a 40%, #d8c088 60%, #b8944c 80%, #c9a86c 100%)
            `,
            border: '2px solid #8b7355',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          }}>
            {/* Texture overlay */}
            <div style={{
              position: 'absolute',
              inset: 0,
              background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
              opacity: 0.1,
              pointerEvents: 'none',
            }} />

            {/* Title */}
            <div style={{
              display: 'inline-block',
              padding: '8px 16px',
              background: '#f5efe0',
              border: '1px solid #c9b896',
              borderRadius: 4,
              marginBottom: 16,
            }}>
              <span style={{
                fontFamily: "'Pirata One', cursive",
                fontSize: 20,
                color: '#3d3210',
              }}>
                ◇ The Cartographer's Map
                <NoteIcon noteKey="map" />
              </span>
            </div>

            {/* Map message */}
            {mapMessage && (
              <div style={{
                position: 'absolute',
                top: 16,
                right: 16,
                padding: '8px 12px',
                background: '#f5efe0',
                border: '1px solid #c9b896',
                borderRadius: 4,
                fontFamily: "'IM Fell English', Georgia, serif",
                fontStyle: 'italic',
                color: '#5c4a32',
                animation: 'fadeIn 0.3s',
              }}>
                {mapMessage}
              </div>
            )}

            {/* Stat cards pinned on map */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 12,
              marginBottom: 20,
            }}>
              {[
                { label: 'Your MAP', value: formatToken(mapBalance, DECIMALS.map, 2), noteKey: 'map' },
                { label: 'Price', value: `$${formatToken(mapPrice, DECIMALS.usdc, 4)}`, noteKey: 'mapPrice' },
                { label: 'Supply', value: formatToken(mapSupply, DECIMALS.map, 0), noteKey: 'mapSupply' },
                { label: 'Map State', value: `${mapTier.icon} ${mapTier.name}`, noteKey: 'mapState' },
              ].map((item, i) => (
                <div key={i} style={{
                  background: '#f8f4eb',
                  border: '1px solid #c9b896',
                  borderRadius: 4,
                  padding: 12,
                  textAlign: 'center',
                  boxShadow: '2px 2px 4px rgba(0,0,0,0.1)',
                  transform: `rotate(${i % 2 === 0 ? -0.5 : 0.5}deg)`,
                }}>
                  <div style={{ fontSize: 12, color: '#6b5c47', marginBottom: 4 }}>
                    {item.label}
                    {item.noteKey && <NoteIcon noteKey={item.noteKey} />}
                  </div>
                  <div style={{ fontFamily: "'Pirata One', cursive", fontSize: 16, color: '#3d3210' }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Buy/Sell toggle and form */}
            <div style={{
              background: '#f8f4eb',
              border: '1px solid #c9b896',
              borderRadius: 6,
              overflow: 'hidden',
              maxWidth: 400,
              margin: '0 auto',
            }}>
              <div style={{ display: 'flex', borderBottom: '1px solid #e8dcc4' }}>
                <button
                  onClick={() => setMapTradeMode('buy')}
                  style={{
                    flex: 1,
                    padding: 12,
                    background: mapTradeMode === 'buy' ? '#f0e6d2' : 'transparent',
                    border: 'none',
                    borderBottom: mapTradeMode === 'buy' ? '2px solid #5c4a32' : '2px solid transparent',
                    fontFamily: "'Pirata One', cursive",
                    fontSize: 16,
                    color: mapTradeMode === 'buy' ? '#3d3210' : '#8b7355',
                    cursor: 'pointer',
                  }}
                >Acquire</button>
                <button
                  onClick={() => setMapTradeMode('sell')}
                  style={{
                    flex: 1,
                    padding: 12,
                    background: mapTradeMode === 'sell' ? '#f0e6d2' : 'transparent',
                    border: 'none',
                    borderBottom: mapTradeMode === 'sell' ? '2px solid #8b4040' : '2px solid transparent',
                    fontFamily: "'Pirata One', cursive",
                    fontSize: 16,
                    color: mapTradeMode === 'sell' ? '#6b3030' : '#8b7355',
                    cursor: 'pointer',
                  }}
                >Return</button>
              </div>
              <div style={{ padding: 16 }}>
                {mapTradeMode === 'buy' ? (
                  <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      {[25, 50, 75, 100].map(pct => (
                        <button
                          key={pct}
                          onClick={() => userUsdcBalance && setMapBuyAmount(formatUnits(userUsdcBalance * BigInt(pct) / 100n, DECIMALS.usdc))}
                          style={{
                            flex: 1,
                            padding: 6,
                            background: '#e8dcc4',
                            border: '1px solid #c9b896',
                            borderRadius: 4,
                            fontSize: 12,
                            cursor: 'pointer',
                            color: '#5c4a32',
                          }}
                        >{pct === 100 ? 'MAX' : `${pct}%`}</button>
                      ))}
                    </div>
                    <Input
                      value={mapBuyAmount}
                      onChange={e => setMapBuyAmount(e.target.value)}
                      placeholder="USDC amount"
                      disabled={!readEnabled || isBusy}
                      style={{ marginBottom: 8 }}
                    />
                    <div style={{ fontSize: 12, color: '#6b5c47', marginBottom: 12 }}>
                      Balance: ${formatToken(userUsdcBalance, DECIMALS.usdc, 2)}
                    </div>
                    {needsMapApproval ? (
                      <Btn onClick={handleApproveUsdcForMap} disabled={!readEnabled || isBusy}>
                        {isApprovingUsdc || isWaitingApproveUsdc ? 'Approving...' : 'Approve'}
                      </Btn>
                    ) : (
                      <Btn onClick={handleBuyMap} disabled={!readEnabled || isBusy || !mapBuyAmount}>
                        {isBuyingMap || isWaitingMap ? 'Acquiring...' : 'Acquire MAP'}
                      </Btn>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      {[25, 50, 75, 100].map(pct => (
                        <button
                          key={pct}
                          onClick={() => mapBalance && setMapSellAmount(formatUnits(mapBalance * BigInt(pct) / 100n, DECIMALS.map))}
                          style={{
                            flex: 1,
                            padding: 6,
                            background: 'rgba(139,48,48,0.1)',
                            border: '1px solid rgba(139,48,48,0.2)',
                            borderRadius: 4,
                            fontSize: 12,
                            cursor: 'pointer',
                            color: '#6b3030',
                          }}
                        >{pct === 100 ? 'MAX' : `${pct}%`}</button>
                      ))}
                    </div>
                    <Input
                      value={mapSellAmount}
                      onChange={e => setMapSellAmount(e.target.value)}
                      placeholder="MAP amount"
                      disabled={!readEnabled || isBusy}
                      style={{ marginBottom: 8 }}
                    />
                    <div style={{ fontSize: 12, color: '#6b5c47', marginBottom: 12 }}>
                      Your MAP: {formatToken(mapBalance, DECIMALS.map, 4)}
                    </div>
                    <Btn onClick={handleSellMap} disabled={!readEnabled || isBusy || !mapSellAmount} variant="danger">
                      {isSellingMap || isWaitingSellMap ? 'Returning...' : 'Return MAP'}
                    </Btn>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* TIDES OF FORTUNE */}
          <Card title="⚓ Tides of Fortune" noteKey="tidesOfFortune" width="100%" style={{ marginBottom: 24, maxWidth: 700 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 8,
            }}>
              {outcomes.map((o, i) => (
                <div key={i} style={{
                  padding: 8,
                  textAlign: 'center',
                  borderRadius: 4,
                  background: o.multiplier === 0 ? '#f5e0e0'
                    : o.multiplier < 1 ? '#f5f0e0'
                    : o.multiplier === 1 ? '#f5f5e0'
                    : '#e0f5e8',
                  border: lastOutcome?.name === o.name ? '2px solid #c9a227' : '1px solid #d4c4a0',
                }}>
                  <div style={{ fontFamily: "'Pirata One', cursive", fontSize: 18, color: '#3d3210' }}>
                    {o.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#6b5c47' }}>
                    {(o.probability * 100).toFixed(0)}%
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* CAPTAIN'S LOG */}
          <Card title="📜 Captain's Log" noteKey="captainsLog" width={CARD_WIDTH} style={{ marginBottom: 24 }}>
            <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
              {log.length === 0 ? (
                <p style={{
                  fontFamily: "'IM Fell English', Georgia, serif",
                  fontStyle: 'italic',
                  color: '#8b7355',
                  textAlign: 'center',
                  padding: 20,
                }}>
                  The sea is calm... for now.
                </p>
              ) : (
                log.slice(-5).reverse().map((entry, i) => (
                  <div key={i} style={{
                    padding: '8px 0',
                    borderBottom: '1px solid #e8dcc4',
                  }}>
                    <div style={{
                      fontFamily: "'IM Fell English', Georgia, serif",
                      fontStyle: 'italic',
                      color: entry.type === 'discovery' ? '#c9a227'
                        : entry.type === 'win' ? '#2d6b4a'
                        : entry.type === 'loss' ? '#8b4040'
                        : '#4a3a28',
                      fontSize: 14,
                    }}>
                      {entry.message}
                    </div>
                    {entry.detail && (
                      <div style={{
                        fontFamily: "'Pirata One', cursive",
                        color: '#5c4a32',
                        fontSize: 14,
                        marginTop: 2,
                      }}>
                        {entry.detail}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
            <button
              onClick={() => setShowFullLog(true)}
              style={{
                width: '100%',
                padding: 10,
                background: '#e8dcc4',
                border: '1px solid #c9b896',
                borderRadius: 4,
                fontFamily: "'IM Fell English', Georgia, serif",
                fontSize: 14,
                color: '#5c4a32',
                cursor: 'pointer',
              }}
            >
              View Full Log
            </button>
          </Card>

          {/* FOOTER */}
          <div style={{
            textAlign: 'center',
            padding: '24px 0',
            borderTop: '1px solid #3d3210',
          }}>
            <p style={{
              fontFamily: "'Pirata One', cursive",
              fontSize: 18,
              color: '#5c4a32',
            }}>
              The chest resets. The map expands. The expedition continues.
            </p>
            <p style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              fontSize: 13,
              color: '#6b5c47',
              marginTop: 8,
            }}>
              Treasure Hunt — Live on {SUPPORTED_CHAIN_NAME}
            </p>
          </div>
        </div>

        {/* CONNECTION GATE */}
        {!DEMO_MODE && (!isConnected || isWrongNetwork || !configReady) && (
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 13, 10, 0.95)',
          }}>
            <Card title="⚓ Connect to Continue" width={400}>
              <p style={{
                fontFamily: "'IM Fell English', Georgia, serif",
                color: '#5c4a32',
                marginBottom: 16,
              }}>
                Connect a wallet on {SUPPORTED_CHAIN_NAME} to join the expedition.
              </p>
              {isWrongNetwork && (
                <p style={{ color: '#8b3030', fontSize: 14, marginBottom: 12 }}>
                  Wrong network detected.
                </p>
              )}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <ConnectButton showBalance={false} chainStatus="icon" />
                {isWrongNetwork && switchChain && (
                  <Btn onClick={() => switchChain({ chainId: SUPPORTED_CHAIN_ID })} style={{ width: 'auto', padding: '12px 20px' }}>
                    Switch Network
                  </Btn>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </CartographerNotesContext.Provider>
  );
}
