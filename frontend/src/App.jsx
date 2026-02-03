import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import TxCenter from './components/TxCenter.jsx';
import { MapBuyQuote } from './components/MapQuote.jsx';
import { useStakingData, CooldownStatus, QualificationStatus } from './components/StakingPanel.jsx';

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
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const formatTime = () =>
  new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export default function App() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();

  // Custom hooks
  const { txHistory, addTx, updateTx, clearHistory } = useTxCenter();
  const { pendingBetsArray, addPendingBet, resolveBet } = usePendingBets();
  const { logTx, logEvent, logError } = useLogger(chainId);

  const [eventFeed, setEventFeed] = useState([]);
  const [treasurePulse, setTreasurePulse] = useState(false);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [discovery, setDiscovery] = useState(null);
  const [showTxCenter, setShowTxCenter] = useState(false);
  const discoveryTimeoutRef = useRef(null);

  // Input states
  const [betAmount, setBetAmount] = useState('');
  const [stakeAmount, setStakeAmount] = useState('');
  const [mapBuyAmount, setMapBuyAmount] = useState('');
  const [mapSellAmount, setMapSellAmount] = useState('');
  const [slippage, setSlippage] = useState(1); // 1%

  const isWrongNetwork = isConnected && chainId !== SUPPORTED_CHAIN_ID;
  const readEnabled = isConnected && !isWrongNetwork && configReady;

  // Staking data with cooldown
  const stakingData = useStakingData(address);

  // Write contract hooks with error handling
  const {
    writeContract: approveUsdc,
    data: approveUsdcHash,
    isPending: isApprovingUsdc,
    error: approveUsdcError,
  } = useWriteContract();

  const {
    writeContract: approveHunt,
    data: approveHuntHash,
    isPending: isApprovingHunt,
    error: approveHuntError,
  } = useWriteContract();

  const {
    writeContract: placeBet,
    data: placeBetHash,
    isPending: isPlacingBet,
    error: placeBetError,
  } = useWriteContract();

  const {
    writeContract: buyMap,
    data: buyMapHash,
    isPending: isBuyingMap,
    error: buyMapError,
  } = useWriteContract();

  const {
    writeContract: sellMap,
    data: sellMapHash,
    isPending: isSellingMap,
    error: sellMapError,
  } = useWriteContract();

  const {
    writeContract: stakeHunt,
    data: stakeHuntHash,
    isPending: isStaking,
    error: stakeError,
  } = useWriteContract();

  const {
    writeContract: initiateWithdraw,
    isPending: isInitiatingWithdraw,
  } = useWriteContract();

  const {
    writeContract: cancelWithdraw,
    isPending: isCancellingWithdraw,
  } = useWriteContract();

  const {
    writeContract: withdrawHunt,
    isPending: isWithdrawing,
  } = useWriteContract();

  const {
    writeContract: mintFaucet,
    data: mintFaucetHash,
    isPending: isMinting,
  } = useWriteContract();

  const { isLoading: isWaitingMint, isSuccess: mintSuccess } = useWaitForTransactionReceipt({ hash: mintFaucetHash });

  // Wait for transaction receipts
  const { isLoading: isWaitingApproveUsdc, isSuccess: approveUsdcSuccess } = useWaitForTransactionReceipt({ hash: approveUsdcHash });
  const { isLoading: isWaitingApproveHunt, isSuccess: approveHuntSuccess } = useWaitForTransactionReceipt({ hash: approveHuntHash });
  const { isLoading: isWaitingBet, isSuccess: betSuccess, data: betReceipt } = useWaitForTransactionReceipt({ hash: placeBetHash });
  const { isLoading: isWaitingMap, isSuccess: mapBuySuccess } = useWaitForTransactionReceipt({ hash: buyMapHash });
  const { isLoading: isWaitingSellMap, isSuccess: mapSellSuccess } = useWaitForTransactionReceipt({ hash: sellMapHash });
  const { isLoading: isWaitingStake, isSuccess: stakeSuccess } = useWaitForTransactionReceipt({ hash: stakeHuntHash });

  const pushEvent = useCallback((entry) => {
    const time = entry.time ?? formatTime();
    const stamped = {
      ...entry,
      time,
      id: entry.id ?? `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    };
    setEventFeed((prev) => [stamped, ...prev].slice(0, 20));
  }, []);

  // Log transaction results
  useEffect(() => {
    if (approveUsdcHash) {
      addTx({ hash: approveUsdcHash, action: 'Approve USDC', status: TxStatus.PENDING, chainId });
      logTx('approve-usdc', { hash: approveUsdcHash, status: 'pending' });
    }
  }, [approveUsdcHash, addTx, chainId, logTx]);

  useEffect(() => {
    if (approveUsdcSuccess && approveUsdcHash) {
      updateTx(approveUsdcHash, { status: TxStatus.SUCCESS });
      logTx('approve-usdc', { hash: approveUsdcHash, status: 'success' });
    }
  }, [approveUsdcSuccess, approveUsdcHash, updateTx, logTx]);

  useEffect(() => {
    if (approveUsdcError) {
      logError('approve-usdc', approveUsdcError);
      pushEvent({
        type: 'error',
        title: 'Approval failed',
        detail: approveUsdcError.shortMessage || approveUsdcError.message,
        meta: 'User rejected or tx failed',
        timestamp: Date.now(),
      });
    }
  }, [approveUsdcError, logError, pushEvent]);

  useEffect(() => {
    if (placeBetHash) {
      addTx({ hash: placeBetHash, action: 'Place Bet', status: TxStatus.PENDING, chainId });
      logTx('place-bet', { hash: placeBetHash, status: 'pending' });
    }
  }, [placeBetHash, addTx, chainId, logTx]);

  useEffect(() => {
    if (betSuccess && placeBetHash) {
      updateTx(placeBetHash, { status: TxStatus.SUCCESS, blockNumber: betReceipt?.blockNumber });
      logTx('place-bet', { hash: placeBetHash, status: 'success', receipt: betReceipt });
    }
  }, [betSuccess, placeBetHash, betReceipt, updateTx, logTx]);

  useEffect(() => {
    if (placeBetError) {
      logError('place-bet', placeBetError);
      pushEvent({
        type: 'error',
        title: 'Bet failed',
        detail: placeBetError.shortMessage || placeBetError.message,
        meta: 'Transaction reverted or rejected',
        timestamp: Date.now(),
      });
    }
  }, [placeBetError, logError, pushEvent]);

  const triggerTreasurePulse = useCallback(() => {
    setTreasurePulse(true);
    window.setTimeout(() => setTreasurePulse(false), 2600);
  }, []);

  const triggerDiscovery = useCallback(
    (payload) => {
      setDiscovery(payload);
      setShowDiscovery(true);
      triggerTreasurePulse();
      if (discoveryTimeoutRef.current) {
        window.clearTimeout(discoveryTimeoutRef.current);
      }
      discoveryTimeoutRef.current = window.setTimeout(() => {
        setShowDiscovery(false);
      }, 4500);
    },
    [triggerTreasurePulse]
  );

  useEffect(() => {
    return () => {
      if (discoveryTimeoutRef.current) {
        window.clearTimeout(discoveryTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!DEMO_MODE) return;
    pushEvent({
      type: 'demo',
      title: 'Demo mode armed',
      detail: 'Use the trigger below to simulate a treasure discovery.',
      meta: 'No transactions - read-only',
      timestamp: Date.now(),
    });
  }, [pushEvent]);

  // Load past events on mount
  useEffect(() => {
    if (!readEnabled || !publicClient || !addresses.treasureEngine) return;

    const loadPastEvents = async () => {
      try {
        const currentBlock = await publicClient.getBlockNumber();
        const fromBlock = currentBlock - 5000n; // ~17 hours of blocks

        // Load recent TreasureDiscovered events
        const treasureEvents = await publicClient.getLogs({
          address: addresses.treasureEngine,
          event: {
            type: 'event',
            name: 'TreasureDiscovered',
            inputs: [
              { indexed: true, name: 'discoverer', type: 'address' },
              { indexed: false, name: 'amount', type: 'uint256' },
              { indexed: false, name: 'epochId', type: 'uint256' },
            ],
          },
          fromBlock: fromBlock > 0n ? fromBlock : 0n,
          toBlock: currentBlock,
        });

        treasureEvents.forEach((log) => {
          const { discoverer, amount, epochId: epoch } = log.args || {};
          pushEvent({
            type: 'treasure',
            title: 'Treasure discovered (past)',
            detail: `${formatToken(amount, DECIMALS.usdc, 2)} USDC`,
            meta: `Epoch ${epoch?.toString() ?? '--'} - ${shortAddress(discoverer)}`,
            timestamp: Date.now(),
            id: `past-${log.transactionHash}-${log.logIndex}`,
          });
        });

        logEvent('loaded-past-events', { count: treasureEvents.length });
      } catch (e) {
        logError('load-past-events', e);
      }
    };

    loadPastEvents();
  }, [readEnabled, publicClient, logEvent, logError, pushEvent]);

  const globalReads = useReadContracts({
    allowFailure: true,
    contracts: readEnabled
      ? [
          { address: addresses.treasureEngine, abi: treasureEngineAbi, functionName: 'J' },
          { address: addresses.treasureEngine, abi: treasureEngineAbi, functionName: 'M' },
          { address: addresses.treasureEngine, abi: treasureEngineAbi, functionName: 'epochId' },
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
      refetchInterval: 10000,
    },
  });

  const userReads = useReadContracts({
    allowFailure: true,
    contracts:
      readEnabled && address
        ? [
            { address: addresses.huntToken, abi: erc20Abi, functionName: 'balanceOf', args: [address] },
            { address: addresses.mapToken, abi: mapTokenAbi, functionName: 'balanceOf', args: [address] },
            { address: addresses.huntStaking, abi: huntStakingAbi, functionName: 'stakedBalance', args: [address] },
            { address: addresses.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [address] },
            { address: addresses.usdc, abi: erc20Abi, functionName: 'allowance', args: [address, addresses.treasureEngine] },
            { address: addresses.usdc, abi: erc20Abi, functionName: 'allowance', args: [address, addresses.mapToken] },
            { address: addresses.huntToken, abi: erc20Abi, functionName: 'allowance', args: [address, addresses.huntStaking] },
          ]
        : [],
    query: {
      enabled: readEnabled && !!address,
      refetchInterval: 5000,
    },
  });

  const [jBalance, mValue, epochId, usdcBalance, mapPrice, mapSupply] = useMemo(() => {
    const results = globalReads.data || [];
    return results.map((entry) => entry?.result ?? null);
  }, [globalReads.data]);

  const [huntBalance, mapBalance, stakedBalance, userUsdcBalance, engineAllowance, mapAllowance, stakingAllowance] = useMemo(() => {
    const results = userReads.data || [];
    return results.map((entry) => entry?.result ?? null);
  }, [userReads.data]);

  const freeUSDC = useMemo(() => {
    if (usdcBalance === null || usdcBalance === undefined) return null;
    if (jBalance === null || jBalance === undefined) return null;
    return usdcBalance > jBalance ? usdcBalance - jBalance : 0n;
  }, [usdcBalance, jBalance]);

  const chestProgress = useMemo(() => {
    if (!jBalance || !mValue || mValue === 0n) return 0;
    const basisPoints = (jBalance * 10000n) / mValue;
    return clamp(Number(basisPoints) / 100, 0, 100);
  }, [jBalance, mValue]);

  const triggerDemoTreasure = useCallback(() => {
    const demoAmount = 123_450_000n;
    pushEvent({
      type: 'expedition',
      title: 'The chest trembles',
      detail: 'The crew holds its breath as the vault swells.',
      meta: 'Demo signal',
      timestamp: Date.now(),
    });
    window.setTimeout(() => {
      pushEvent({
        type: 'treasure',
        title: 'Treasure discovered (demo)',
        detail: `${formatToken(demoAmount, DECIMALS.usdc, 2)} USDC`,
        meta: `Epoch ${epochId ?? '--'} - Demo trigger`,
        timestamp: Date.now(),
      });
      triggerDiscovery({
        amount: demoAmount,
        epoch: epochId,
        discoverer: address ?? null,
        isDemo: true,
      });
    }, 700);
  }, [address, epochId, pushEvent, triggerDiscovery]);

  // Calculate max bet (1% of M)
  const maxBet = useMemo(() => {
    if (!mValue) return 0n;
    return mValue / 100n; // 1% of M
  }, [mValue]);

  const minBet = 100_000n; // 0.10 USDC

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
    // Cap at 50k USDC per contract limit
    const maxBuy = 50_000_000_000n; // 50k USDC
    const max = userUsdcBalance < maxBuy ? userUsdcBalance : maxBuy;
    setMapBuyAmount(formatUnits(max, DECIMALS.usdc));
  }, [userUsdcBalance]);

  const handleMaxMapSell = useCallback(() => {
    if (!mapBalance || !mapSupply) return;
    // 1% of supply max per contract
    const maxSell = mapSupply / 100n;
    const max = mapBalance < maxSell ? mapBalance : maxSell;
    setMapSellAmount(formatUnits(max, DECIMALS.map));
  }, [mapBalance, mapSupply]);

  // Action handlers
  const handleApproveUsdcForEngine = useCallback(() => {
    if (!addresses.usdc || !addresses.treasureEngine) return;
    approveUsdc({
      address: addresses.usdc,
      abi: erc20Abi,
      functionName: 'approve',
      args: [addresses.treasureEngine, maxUint256],
    });
    pushEvent({
      type: 'tx',
      title: 'Approving USDC for betting',
      detail: 'Transaction submitted...',
      meta: 'Awaiting confirmation',
      timestamp: Date.now(),
    });
  }, [approveUsdc, pushEvent]);

  const handleApproveUsdcForMap = useCallback(() => {
    if (!addresses.usdc || !addresses.mapToken) return;
    approveUsdc({
      address: addresses.usdc,
      abi: erc20Abi,
      functionName: 'approve',
      args: [addresses.mapToken, maxUint256],
    });
    pushEvent({
      type: 'tx',
      title: 'Approving USDC for MAP',
      detail: 'Transaction submitted...',
      meta: 'Awaiting confirmation',
      timestamp: Date.now(),
    });
  }, [approveUsdc, pushEvent]);

  const handleApproveHuntForStaking = useCallback(() => {
    if (!addresses.huntToken || !addresses.huntStaking) return;
    approveHunt({
      address: addresses.huntToken,
      abi: erc20Abi,
      functionName: 'approve',
      args: [addresses.huntStaking, maxUint256],
    });
    pushEvent({
      type: 'tx',
      title: 'Approving HUNT for staking',
      detail: 'Transaction submitted...',
      meta: 'Awaiting confirmation',
      timestamp: Date.now(),
    });
  }, [approveHunt, pushEvent]);

  const handlePlaceBet = useCallback(() => {
    if (!betAmount || !addresses.treasureEngine) return;
    try {
      const amount = parseUnits(betAmount, DECIMALS.usdc);
      if (amount < minBet) {
        pushEvent({
          type: 'error',
          title: 'Bet too small',
          detail: `Minimum bet is ${formatToken(minBet, DECIMALS.usdc, 2)} USDC`,
          meta: 'Try a larger amount',
          timestamp: Date.now(),
        });
        return;
      }
      if (amount > maxBet) {
        pushEvent({
          type: 'error',
          title: 'Bet too large',
          detail: `Maximum bet is ${formatToken(maxBet, DECIMALS.usdc, 2)} USDC (1% of M)`,
          meta: 'Try a smaller amount',
          timestamp: Date.now(),
        });
        return;
      }
      placeBet({
        address: addresses.treasureEngine,
        abi: treasureEngineAbi,
        functionName: 'placeBet',
        args: [amount],
      });
      pushEvent({
        type: 'expedition',
        title: 'Exploring...',
        detail: `Betting ${betAmount} USDC`,
        meta: 'Transaction submitted',
        timestamp: Date.now(),
      });
      setBetAmount('');
    } catch (e) {
      logError('place-bet-parse', e);
    }
  }, [betAmount, placeBet, pushEvent, maxBet, logError]);

  const handleBuyMap = useCallback(() => {
    if (!mapBuyAmount || !addresses.mapToken) return;
    try {
      const amount = parseUnits(mapBuyAmount, DECIMALS.usdc);
      buyMap({
        address: addresses.mapToken,
        abi: mapTokenAbi,
        functionName: 'buy',
        args: [amount],
      });
      pushEvent({
        type: 'map',
        title: 'Buying MAP...',
        detail: `Spending ${mapBuyAmount} USDC`,
        meta: 'Transaction submitted',
        timestamp: Date.now(),
      });
      setMapBuyAmount('');
    } catch (e) {
      logError('buy-map-parse', e);
    }
  }, [mapBuyAmount, buyMap, pushEvent, logError]);

  const handleSellMap = useCallback(() => {
    if (!mapSellAmount || !addresses.mapToken) return;
    try {
      const amount = parseUnits(mapSellAmount, DECIMALS.map);
      sellMap({
        address: addresses.mapToken,
        abi: mapTokenAbi,
        functionName: 'sell',
        args: [amount],
      });
      pushEvent({
        type: 'map',
        title: 'Selling MAP...',
        detail: `Selling ${mapSellAmount} MAP`,
        meta: 'Transaction submitted',
        timestamp: Date.now(),
      });
      setMapSellAmount('');
    } catch (e) {
      logError('sell-map-parse', e);
    }
  }, [mapSellAmount, sellMap, pushEvent, logError]);

  const handleStake = useCallback(() => {
    if (!stakeAmount || !addresses.huntStaking) return;
    try {
      const amount = parseUnits(stakeAmount, DECIMALS.hunt);
      stakeHunt({
        address: addresses.huntStaking,
        abi: huntStakingAbi,
        functionName: 'stake',
        args: [amount],
      });
      pushEvent({
        type: 'stake',
        title: 'Staking HUNT...',
        detail: `Staking ${stakeAmount} HUNT`,
        meta: 'Transaction submitted',
        timestamp: Date.now(),
      });
      setStakeAmount('');
    } catch (e) {
      logError('stake-parse', e);
    }
  }, [stakeAmount, stakeHunt, pushEvent, logError]);

  const handleInitiateWithdraw = useCallback(() => {
    if (!addresses.huntStaking) return;
    initiateWithdraw({
      address: addresses.huntStaking,
      abi: huntStakingAbi,
      functionName: 'initiateWithdraw',
    });
    pushEvent({
      type: 'stake',
      title: 'Starting cooldown...',
      detail: '7-day cooldown period begins',
      meta: 'Transaction submitted',
      timestamp: Date.now(),
    });
  }, [initiateWithdraw, pushEvent]);

  const handleCancelWithdraw = useCallback(() => {
    if (!addresses.huntStaking) return;
    cancelWithdraw({
      address: addresses.huntStaking,
      abi: huntStakingAbi,
      functionName: 'cancelWithdraw',
    });
    pushEvent({
      type: 'stake',
      title: 'Cancelling cooldown...',
      detail: 'Returning to active staking',
      meta: 'Transaction submitted',
      timestamp: Date.now(),
    });
  }, [cancelWithdraw, pushEvent]);

  const handleWithdraw = useCallback(() => {
    if (!addresses.huntStaking || !stakingData.stakedBalance) return;
    withdrawHunt({
      address: addresses.huntStaking,
      abi: huntStakingAbi,
      functionName: 'withdraw',
      args: [stakingData.stakedBalance],
    });
    pushEvent({
      type: 'stake',
      title: 'Withdrawing HUNT...',
      detail: `Withdrawing ${formatToken(stakingData.stakedBalance, DECIMALS.hunt, 2)} HUNT`,
      meta: 'Transaction submitted',
      timestamp: Date.now(),
    });
  }, [withdrawHunt, pushEvent, stakingData.stakedBalance]);

  // Faucet - mint 1000 USDC for testing
  const handleMintFaucet = useCallback(() => {
    if (!addresses.usdc || !address) return;
    const amount = parseUnits('1000', DECIMALS.usdc); // 1000 USDC
    mintFaucet({
      address: addresses.usdc,
      abi: mockUsdcAbi,
      functionName: 'mint',
      args: [address, amount],
    });
    pushEvent({
      type: 'tx',
      title: 'Minting test USDC...',
      detail: '1000 USDC from faucet',
      meta: 'Transaction submitted',
      timestamp: Date.now(),
    });
  }, [mintFaucet, address, pushEvent]);

  // Check if approvals are needed
  const needsEngineApproval = useMemo(() => {
    if (engineAllowance === null || engineAllowance === undefined || !betAmount) return false;
    try {
      const amount = parseUnits(betAmount || '0', DECIMALS.usdc);
      return engineAllowance < amount;
    } catch {
      return false;
    }
  }, [engineAllowance, betAmount]);

  const needsMapApproval = useMemo(() => {
    if (mapAllowance === null || mapAllowance === undefined || !mapBuyAmount) return false;
    try {
      const amount = parseUnits(mapBuyAmount || '0', DECIMALS.usdc);
      return mapAllowance < amount;
    } catch {
      return false;
    }
  }, [mapAllowance, mapBuyAmount]);

  const needsStakingApproval = useMemo(() => {
    if (stakingAllowance === null || stakingAllowance === undefined || !stakeAmount) return false;
    try {
      const amount = parseUnits(stakeAmount || '0', DECIMALS.hunt);
      return stakingAllowance < amount;
    } catch {
      return false;
    }
  }, [stakingAllowance, stakeAmount]);

  // Event watchers
  useWatchContractEvent({
    address: readEnabled ? addresses.treasureEngine : undefined,
    abi: treasureEngineAbi,
    eventName: 'TreasureDiscovered',
    enabled: readEnabled && !!addresses.treasureEngine,
    onLogs: (logs) => {
      logs.forEach((log) => {
        const { discoverer, amount, epochId: epoch } = log.args || {};
        logEvent('TreasureDiscovered', { discoverer, amount: amount?.toString(), epoch: epoch?.toString() });
        pushEvent({
          type: 'treasure',
          title: 'Treasure discovered',
          detail: `${formatToken(amount, DECIMALS.usdc, 2)} USDC`,
          meta: `Epoch ${epoch?.toString() ?? '--'} - ${shortAddress(discoverer)}`,
          timestamp: Date.now(),
        });
        triggerDiscovery({
          amount,
          epoch,
          discoverer,
        });
      });
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
        logEvent('ExpeditionStarted', { epoch: epoch?.toString(), newM: newM?.toString() });
        pushEvent({
          type: 'expedition',
          title: 'New expedition',
          detail: `M is now ${formatToken(newM, DECIMALS.usdc, 2)} USDC`,
          meta: `Epoch ${epoch?.toString() ?? '--'}`,
          timestamp: Date.now(),
        });
      });
    },
  });

  useWatchContractEvent({
    address: readEnabled ? addresses.treasureEngine : undefined,
    abi: treasureEngineAbi,
    eventName: 'BetPlaced',
    enabled: readEnabled && !!addresses.treasureEngine,
    onLogs: (logs) => {
      logs.forEach((log) => {
        const { participant, amount, requestId } = log.args || {};
        logEvent('BetPlaced', { participant, amount: amount?.toString(), requestId: requestId?.toString() });
        if (participant?.toLowerCase() === address?.toLowerCase()) {
          // Track pending bet for VRF
          addPendingBet(requestId, {
            amount,
            bettor: participant,
            txHash: log.transactionHash,
          });
          pushEvent({
            type: 'expedition',
            title: 'Bet confirmed',
            detail: `${formatToken(amount, DECIMALS.usdc, 2)} USDC`,
            meta: `Request #${requestId?.toString().slice(-8)} - Awaiting VRF`,
            timestamp: Date.now(),
          });
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
      logs.forEach((log) => {
        const { participant, amount, payout, outcomeIndex } = log.args || {};
        logEvent('BetResolved', { participant, amount: amount?.toString(), payout: payout?.toString(), outcomeIndex });
        if (participant?.toLowerCase() === address?.toLowerCase()) {
          const isWin = payout > 0n;

          // Resolve pending bet
          pendingBetsArray.forEach(bet => {
            if (bet.bettor?.toLowerCase() === participant?.toLowerCase()) {
              resolveBet(bet.requestId, { payout, outcomeIndex, isWin });
            }
          });

          pushEvent({
            type: isWin ? 'treasure' : 'expedition',
            title: isWin ? 'You won!' : 'Lost - Contributing to treasure',
            detail: isWin
              ? `Won ${formatToken(payout, DECIMALS.usdc, 2)} USDC`
              : `${formatToken(amount, DECIMALS.usdc, 2)} USDC added to chest`,
            meta: isWin ? 'Congratulations!' : 'The hunt continues...',
            timestamp: Date.now(),
          });
          if (isWin) {
            triggerTreasurePulse();
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
      logs.forEach((log) => {
        const { buyer, usdcIn, mapOut } = log.args || {};
        logEvent('MapBought', { buyer, usdcIn: usdcIn?.toString(), mapOut: mapOut?.toString() });
        pushEvent({
          type: 'map',
          title: 'MAP bought',
          detail: `${formatToken(mapOut, DECIMALS.map, 3)} MAP`,
          meta: `${shortAddress(buyer)} - ${formatToken(usdcIn, DECIMALS.usdc, 2)} USDC`,
          timestamp: Date.now(),
        });
      });
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
        logEvent('MapSold', { seller, mapIn: mapIn?.toString(), usdcOut: usdcOut?.toString() });
        pushEvent({
          type: 'map',
          title: 'MAP sold',
          detail: `${formatToken(mapIn, DECIMALS.map, 3)} MAP`,
          meta: `${shortAddress(seller)} - ${formatToken(usdcOut, DECIMALS.usdc, 2)} USDC`,
          timestamp: Date.now(),
        });
      });
    },
  });

  const connectionStatus = !walletConnectProjectId
    ? `Missing ${REQUIRED_ENV.walletConnect}`
    : isWrongNetwork
      ? `Wrong network - switch to ${SUPPORTED_CHAIN_NAME}`
      : !isConnected
        ? 'Wallet disconnected'
        : configReady
          ? `Connected to ${SUPPORTED_CHAIN_NAME}`
          : 'Missing contract addresses';

  const isBusy = isApprovingUsdc || isApprovingHunt || isPlacingBet || isBuyingMap || isSellingMap || isStaking ||
                 isWaitingApproveUsdc || isWaitingApproveHunt || isWaitingBet || isWaitingMap || isWaitingSellMap || isWaitingStake ||
                 isInitiatingWithdraw || isCancellingWithdraw || isWithdrawing || isMinting || isWaitingMint;

  return (
    <div className="app">
      {showDiscovery ? (
        <div className="discovery-overlay" aria-live="polite">
          <div className="discovery-glow" />
          <div className="discovery-card">
            <div className="discovery-title">Treasure discovered</div>
            <div className="discovery-amount">
              {formatToken(discovery?.amount, DECIMALS.usdc, 2)} USDC
            </div>
            <div className="discovery-meta">
              <span>Epoch {discovery?.epoch?.toString() ?? '--'}</span>
              <span>
                Discoverer {discovery?.discoverer ? shortAddress(discovery.discoverer) : 'Crew'}
              </span>
            </div>
            <p className="discovery-note">
              The chest has opened. The crew cheers. The next expedition begins.
            </p>
          </div>
        </div>
      ) : null}

      <header className="app-header">
        <div className="brand">
          <p className="eyebrow">Treasure Hunt</p>
          <h1>Captain's Control Deck</h1>
          <p className="subhead">
            Live chain telemetry for the hunt. Watch the chest, mind the map, and log every omen.
          </p>
        </div>
        <div className="header-actions">
          <button
            className={`tx-center-toggle ${pendingBetsArray.length > 0 ? 'has-pending' : ''}`}
            onClick={() => setShowTxCenter(!showTxCenter)}
          >
            Txs {txHistory.length > 0 && `(${txHistory.length})`}
            {pendingBetsArray.length > 0 && <span className="pending-dot" />}
          </button>
          <span className={`status-pill ${isWrongNetwork ? 'status-warn' : 'status-ok'}`}>{connectionStatus}</span>
          <ConnectButton showBalance={false} chainStatus="icon" />
        </div>
      </header>

      {showTxCenter && (
        <div className="tx-center-panel">
          <TxCenter
            txHistory={txHistory}
            pendingBets={pendingBetsArray}
            onClear={clearHistory}
          />
        </div>
      )}

      <main className="deck-grid">
        <section className={`panel treasure-panel ${treasurePulse ? 'pulse' : ''}`}>
          <div className="panel-header">
            <h2>Treasure</h2>
            <span className="tag">J Vault</span>
          </div>
          <div className="meter">
            <div className="meter-track">
              <div className="meter-fill" style={{ width: `${chestProgress}%` }} />
            </div>
            <div className="meter-label">Chest fill {chestProgress.toFixed(2)}% of M</div>
          </div>
          <div className="stat-grid">
            <div className="stat">
              <span>J (Treasure)</span>
              <strong>{formatToken(jBalance, DECIMALS.usdc, 2)} USDC</strong>
            </div>
            <div className="stat">
              <span>freeUSDC</span>
              <strong>{formatToken(freeUSDC, DECIMALS.usdc, 2)} USDC</strong>
            </div>
            <div className="stat">
              <span>Total USDC</span>
              <strong>{formatToken(usdcBalance, DECIMALS.usdc, 2)} USDC</strong>
            </div>
          </div>
        </section>

        <section className="panel expedition-panel">
          <div className="panel-header">
            <h2>Expedition State</h2>
            <span className="tag">Epoch Log</span>
          </div>
          <div className="stat-grid">
            <div className="stat">
              <span>Epoch</span>
              <strong>{epochId?.toString() ?? '--'}</strong>
            </div>
            <div className="stat">
              <span>Max map size (M)</span>
              <strong>{formatToken(mValue, DECIMALS.usdc, 2)} USDC</strong>
            </div>
            <div className="stat">
              <span>Your USDC</span>
              <strong>{formatToken(userUsdcBalance, DECIMALS.usdc, 2)} USDC</strong>
            </div>
          </div>
          <div className="faucet-row">
            <button
              className="secondary"
              type="button"
              onClick={handleMintFaucet}
              disabled={!readEnabled || isBusy}
            >
              {isMinting || isWaitingMint ? 'Minting...' : 'Faucet (1000 USDC)'}
            </button>
          </div>
          <div className="action-row">
            <div className="input-group">
              <input
                type="number"
                placeholder={`Bet (${formatToken(minBet, DECIMALS.usdc, 2)} - ${formatToken(maxBet, DECIMALS.usdc, 2)})`}
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                disabled={!readEnabled || isBusy}
                min="0.1"
                step="0.1"
              />
              <button className="max-btn" onClick={handleMaxBet} disabled={!readEnabled || isBusy}>
                Max
              </button>
              {needsEngineApproval ? (
                <button
                  className="primary"
                  type="button"
                  onClick={handleApproveUsdcForEngine}
                  disabled={!readEnabled || isBusy}
                >
                  {isApprovingUsdc || isWaitingApproveUsdc ? 'Approving...' : 'Approve USDC'}
                </button>
              ) : (
                <button
                  className="primary"
                  type="button"
                  onClick={handlePlaceBet}
                  disabled={!readEnabled || isBusy || !betAmount}
                >
                  {isPlacingBet || isWaitingBet ? 'Exploring...' : 'Explore'}
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="panel map-panel">
          <div className="panel-header">
            <h2>MAP Market</h2>
            <span className="tag">Bonding curve</span>
          </div>
          <div className="stat-grid">
            <div className="stat">
              <span>Spot price</span>
              <strong>{formatToken(mapPrice, DECIMALS.usdc, 4)} USDC</strong>
            </div>
            <div className="stat">
              <span>Total supply</span>
              <strong>{formatToken(mapSupply, DECIMALS.map, 3)} MAP</strong>
            </div>
            <div className="stat">
              <span>Your MAP</span>
              <strong>{formatToken(mapBalance, DECIMALS.map, 3)} MAP</strong>
            </div>
          </div>

          <div className="action-row">
            <div className="input-group">
              <input
                type="number"
                placeholder="USDC to spend"
                value={mapBuyAmount}
                onChange={(e) => setMapBuyAmount(e.target.value)}
                disabled={!readEnabled || isBusy}
                min="0.01"
                step="0.01"
              />
              <button className="max-btn" onClick={handleMaxMapBuy} disabled={!readEnabled || isBusy}>
                Max
              </button>
              {needsMapApproval ? (
                <button
                  className="primary"
                  type="button"
                  onClick={handleApproveUsdcForMap}
                  disabled={!readEnabled || isBusy}
                >
                  {isApprovingUsdc || isWaitingApproveUsdc ? 'Approving...' : 'Approve'}
                </button>
              ) : (
                <button
                  className="primary"
                  type="button"
                  onClick={handleBuyMap}
                  disabled={!readEnabled || isBusy || !mapBuyAmount}
                >
                  {isBuyingMap || isWaitingMap ? 'Buying...' : 'Buy MAP'}
                </button>
              )}
            </div>
            <MapBuyQuote usdcAmount={mapBuyAmount} slippage={slippage} />
          </div>

          <div className="action-row">
            <div className="input-group">
              <input
                type="number"
                placeholder="MAP to sell"
                value={mapSellAmount}
                onChange={(e) => setMapSellAmount(e.target.value)}
                disabled={!readEnabled || isBusy}
                min="0.001"
                step="0.001"
              />
              <button className="max-btn" onClick={handleMaxMapSell} disabled={!readEnabled || isBusy}>
                Max
              </button>
              <button
                className="secondary"
                type="button"
                onClick={handleSellMap}
                disabled={!readEnabled || isBusy || !mapSellAmount}
              >
                {isSellingMap || isWaitingSellMap ? 'Selling...' : 'Sell MAP'}
              </button>
            </div>
          </div>

          <div className="slippage-row">
            <span>Slippage:</span>
            {[0.5, 1, 2].map(s => (
              <button
                key={s}
                className={`slippage-btn ${slippage === s ? 'active' : ''}`}
                onClick={() => setSlippage(s)}
              >
                {s}%
              </button>
            ))}
          </div>
        </section>

        <section className="panel hunt-panel">
          <div className="panel-header">
            <h2>HUNT Crew</h2>
            <span className="tag">Staking</span>
          </div>
          <div className="stat-grid">
            <div className="stat">
              <span>HUNT balance</span>
              <strong>{formatToken(huntBalance, DECIMALS.hunt, 3)} HUNT</strong>
            </div>
            <div className="stat">
              <span>Staked HUNT</span>
              <strong>{formatToken(stakingData.stakedBalance, DECIMALS.hunt, 3)} HUNT</strong>
            </div>
          </div>

          <QualificationStatus
            isQualified={stakingData.isQualified}
            stakedBalance={stakingData.stakedBalance}
          />

          <CooldownStatus cooldownStatus={stakingData.cooldownStatus} />

          <div className="action-row">
            <div className="input-group">
              <input
                type="number"
                placeholder="HUNT to stake"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                disabled={!readEnabled || isBusy}
                min="1"
                step="1"
              />
              <button className="max-btn" onClick={handleMaxStake} disabled={!readEnabled || isBusy}>
                Max
              </button>
              {needsStakingApproval ? (
                <button
                  className="primary"
                  type="button"
                  onClick={handleApproveHuntForStaking}
                  disabled={!readEnabled || isBusy}
                >
                  {isApprovingHunt || isWaitingApproveHunt ? 'Approving...' : 'Approve'}
                </button>
              ) : (
                <button
                  className="primary"
                  type="button"
                  onClick={handleStake}
                  disabled={!readEnabled || isBusy || !stakeAmount}
                >
                  {isStaking || isWaitingStake ? 'Staking...' : 'Stake'}
                </button>
              )}
            </div>
          </div>

          {stakingData.stakedBalance && stakingData.stakedBalance > 0n && (
            <div className="withdraw-actions">
              {stakingData.cooldownStatus.status === 'none' && (
                <button
                  className="secondary"
                  onClick={handleInitiateWithdraw}
                  disabled={isBusy}
                >
                  Start Cooldown
                </button>
              )}
              {stakingData.cooldownStatus.status === 'active' && (
                <button
                  className="secondary"
                  onClick={handleCancelWithdraw}
                  disabled={isBusy}
                >
                  Cancel Cooldown
                </button>
              )}
              {stakingData.cooldownStatus.status === 'ready' && (
                <button
                  className="primary"
                  onClick={handleWithdraw}
                  disabled={isBusy}
                >
                  Withdraw All
                </button>
              )}
            </div>
          )}
        </section>

        <section className="panel log-panel">
          <div className="panel-header">
            <h2>Captain's Log</h2>
            <span className="tag">Event-driven</span>
          </div>
          <div className="event-list">
            {eventFeed.length === 0 ? (
              <div className="event empty">Waiting for the next omen...</div>
            ) : (
              eventFeed.map((event) => (
                <div className={`event ${event.type}`} key={event.id}>
                  <div>
                    <div className="event-title">
                      <strong>{event.title}</strong>
                      <span className="event-tag">{event.type}</span>
                    </div>
                    <p>{event.detail}</p>
                  </div>
                  <div className="event-meta">
                    <span>{event.meta}</span>
                    <span>{event.time}</span>
                  </div>
                </div>
              ))
            )}
          </div>
          {DEMO_MODE ? (
            <div className="demo-row">
              <button className="primary" type="button" onClick={triggerDemoTreasure}>
                Trigger Treasure Demo
              </button>
              <span>Demo mode enabled - no transactions.</span>
            </div>
          ) : null}
        </section>
      </main>

      {!DEMO_MODE && (!isConnected || isWrongNetwork || !configReady || !walletConnectProjectId) && (
        <div className="gate">
          <div className="gate-card">
            <h3>Connect to continue</h3>
            <p>
              The interface is read-only and requires a wallet on {SUPPORTED_CHAIN_NAME}.
              Configure addresses before enabling live state.
            </p>
            {isWrongNetwork ? (
              <p className="gate-note">Wrong network - switch to {SUPPORTED_CHAIN_NAME}</p>
            ) : null}
            <div className="gate-actions">
              <ConnectButton showBalance={false} chainStatus="icon" />
              {isWrongNetwork && switchChain ? (
                <button
                  className="primary"
                  type="button"
                  onClick={() => switchChain({ chainId: SUPPORTED_CHAIN_ID })}
                >
                  Switch to {SUPPORTED_CHAIN_NAME}
                </button>
              ) : null}
            </div>
            {!walletConnectProjectId ? (
              <p className="gate-note">Missing {REQUIRED_ENV.walletConnect} in .env</p>
            ) : null}
            {!CHAIN_ENV_VALID ? (
              <p className="gate-note">Invalid {REQUIRED_ENV.chainEnv} (use mainnet or sepolia)</p>
            ) : null}
            {!configReady ? (
              <p className="gate-note">
                Missing addresses: {addressIssues.map((key) => REQUIRED_ENV[key]).join(', ')}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
