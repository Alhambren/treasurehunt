import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useChainId, useReadContracts, useSwitchChain, useWatchContractEvent } from 'wagmi';
import { formatUnits, isAddress } from 'viem';
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
import { treasureEngineAbi, mapTokenAbi, huntStakingAbi } from './abi/index.js';

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

  const [eventFeed, setEventFeed] = useState([]);
  const [treasurePulse, setTreasurePulse] = useState(false);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [discovery, setDiscovery] = useState(null);
  const discoveryTimeoutRef = useRef(null);

  const isWrongNetwork = isConnected && chainId !== SUPPORTED_CHAIN_ID;
  const readEnabled = isConnected && !isWrongNetwork && configReady;

  const pushEvent = useCallback((entry) => {
    const time = entry.time ?? formatTime();
    const stamped = {
      ...entry,
      time,
      id: entry.id ?? `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    };
    setEventFeed((prev) => [stamped, ...prev].slice(0, 10));
  }, []);

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
  }, [DEMO_MODE, pushEvent]);

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
      refetchInterval: false,
      watch: true,
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
          ]
        : [],
    query: {
      enabled: readEnabled && !!address,
      refetchInterval: false,
      watch: true,
    },
  });

  const [jBalance, mValue, epochId, usdcBalance, mapPrice, mapSupply] = useMemo(() => {
    const results = globalReads.data || [];
    return results.map((entry) => entry?.result ?? null);
  }, [globalReads.data]);

  const [huntBalance, mapBalance, stakedBalance] = useMemo(() => {
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

  useWatchContractEvent({
    address: readEnabled ? addresses.treasureEngine : undefined,
    abi: treasureEngineAbi,
    eventName: 'TreasureDiscovered',
    enabled: readEnabled && !!addresses.treasureEngine,
    onLogs: (logs) => {
      logs.forEach((log) => {
        const { discoverer, amount, epochId: epoch } = log.args || {};
        pushEvent({
          type: 'treasure',
          title: 'Treasure discovered',
          detail: `${formatToken(amount, DECIMALS.usdc, 2)} USDC`,
          meta: `Epoch ${epoch ?? '--'} - ${shortAddress(discoverer)}`,
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
        pushEvent({
          type: 'expedition',
          title: 'New expedition',
          detail: `M is now ${formatToken(newM, DECIMALS.usdc, 2)} USDC`,
          meta: `Epoch ${epoch ?? '--'}`,
          timestamp: Date.now(),
        });
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
              <span>Epoch {discovery?.epoch ?? '--'}</span>
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
          <span className={`status-pill ${isWrongNetwork ? 'status-warn' : 'status-ok'}`}>{connectionStatus}</span>
          <ConnectButton showBalance={false} chainStatus="icon" />
        </div>
      </header>

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
              <strong>{epochId ?? '--'}</strong>
            </div>
            <div className="stat">
              <span>Max map size (M)</span>
              <strong>{formatToken(mValue, DECIMALS.usdc, 2)} USDC</strong>
            </div>
            <div className="stat">
              <span>Discovery rule</span>
              <strong>Forced when J >= M</strong>
            </div>
          </div>
          <div className="button-row">
            <button className="ghost" type="button" disabled>
              Explore (disabled)
            </button>
            <button className="ghost" type="button" disabled>
              Stake (disabled)
            </button>
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
          <button className="ghost" type="button" disabled>
            Buy MAP (disabled)
          </button>
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
              <strong>{formatToken(stakedBalance, DECIMALS.hunt, 3)} HUNT</strong>
            </div>
            <div className="stat">
              <span>Qualification</span>
              <strong>{stakedBalance && stakedBalance > 0n ? 'Crew active' : 'Inactive'}</strong>
            </div>
          </div>
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

      {(!isConnected || isWrongNetwork || !configReady || !walletConnectProjectId) && (
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
