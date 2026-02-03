import React, { useState, useEffect, useRef } from 'react';
import { WagmiProvider, createConfig, http, useAccount } from 'wagmi';
import { base } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RainbowKitProvider,
  ConnectButton,
  getDefaultConfig,
  darkTheme,
} from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';

import TreasureHuntMockup from './04_MOCKUP';

// ============================================================================
// Treasure Hunt — Seamless Landing to App Transition
// ============================================================================
//
// State Machine:
//   INTRO_PLAYING   → Video plays, no UI visible
//   INTRO_READY     → "Enter the Expedition" button faded in
//   CONNECTING      → Wallet modal overlay visible, video still playing
//   TRANSITIONING   → Wallet connected, choreographed crossfade in progress
//   IN_APP          → App fully visible, video unmounted
//
// Transition Choreography (on wallet connect):
//   0ms      → Video dims + blurs (brightness 0.6, blur 6px)
//   300ms    → App begins fading in (opacity 0 → 1 over 1000ms)
//   1300ms   → App at full opacity
//   1300ms   → Video begins fading out (opacity 1 → 0 over 600ms)
//   1900ms   → Video fully gone, state → IN_APP
//
// ============================================================================

const STATES = {
  INTRO_PLAYING: 'INTRO_PLAYING',
  INTRO_READY: 'INTRO_READY',
  CONNECTING: 'CONNECTING',
  TRANSITIONING: 'TRANSITIONING',
  IN_APP: 'IN_APP',
};

// Wagmi config
const config = getDefaultConfig({
  appName: 'Treasure Hunt',
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID',
  chains: [base],
  transports: {
    [base.id]: http(),
  },
});

const queryClient = new QueryClient();

// ============================================================================
// Main Entry Component
// ============================================================================
const TreasureHuntEntry = () => {
  const { isConnected } = useAccount();
  const [state, setState] = useState(STATES.INTRO_PLAYING);
  const [videoSrc, setVideoSrc] = useState('./landing-video.mp4');
  const wasConnectedRef = useRef(false);

  // Check for alternate video path on mount
  useEffect(() => {
    // Try the /mnt/data path first (for development)
    fetch('/mnt/data/grok-video-cff15b26-d9fd-42d9-b9ca-407514171189.mp4', { method: 'HEAD' })
      .then(res => {
        if (res.ok) {
          setVideoSrc('/mnt/data/grok-video-cff15b26-d9fd-42d9-b9ca-407514171189.mp4');
        }
      })
      .catch(() => {});
  }, []);

  // Auto-advance from INTRO_PLAYING → INTRO_READY after 2.5s
  useEffect(() => {
    if (state === STATES.INTRO_PLAYING) {
      const timer = setTimeout(() => setState(STATES.INTRO_READY), 2500);
      return () => clearTimeout(timer);
    }
  }, [state]);

  // Handle wallet connection → trigger transition
  useEffect(() => {
    if (isConnected && !wasConnectedRef.current && state === STATES.CONNECTING) {
      wasConnectedRef.current = true;
      setState(STATES.TRANSITIONING);

      // After transition completes, move to IN_APP
      setTimeout(() => {
        setState(STATES.IN_APP);
      }, 1900);
    }
  }, [isConnected, state]);

  const handleEnterClick = () => {
    setState(STATES.CONNECTING);
  };

  const handleSkipIntro = () => {
    if (state === STATES.INTRO_PLAYING) {
      setState(STATES.INTRO_READY);
    }
  };

  const handleCloseModal = () => {
    if (state === STATES.CONNECTING) {
      setState(STATES.INTRO_READY);
    }
  };

  // Derived states for styling
  const showSkipButton = state === STATES.INTRO_PLAYING;
  const showEnterButton = state === STATES.INTRO_READY;
  const showConnectModal = state === STATES.CONNECTING;
  const isTransitioning = state === STATES.TRANSITIONING;
  const isInApp = state === STATES.IN_APP;
  const showVideo = state !== STATES.IN_APP;

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#0a0a12' }}>

      {/* ================================================================
          VIDEO LAYER
          Always behind everything, fades/blurs during transition
      ================================================================ */}
      {showVideo && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            opacity: isTransitioning ? 0 : 1,
            filter: isTransitioning ? 'brightness(0.6) blur(6px)' : 'none',
            transition: isTransitioning
              ? 'filter 300ms ease-out, opacity 600ms ease-out 1300ms'
              : 'none',
          }}
        >
          <video
            autoPlay
            loop
            muted
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          >
            <source src={videoSrc} type="video/mp4" />
          </video>

          {/* Vignette */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.7) 100%)',
              pointerEvents: 'none',
            }}
          />
        </div>
      )}

      {/* ================================================================
          SKIP INTRO BUTTON (top-right)
      ================================================================ */}
      <button
        onClick={handleSkipIntro}
        style={{
          position: 'absolute',
          top: '1.5rem',
          right: '1.5rem',
          zIndex: 50,
          fontFamily: "'IM Fell English', serif",
          fontSize: '0.85rem',
          color: 'rgba(245, 236, 224, 0.6)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          opacity: showSkipButton ? 1 : 0,
          pointerEvents: showSkipButton ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
      >
        Skip Intro
      </button>

      {/* ================================================================
          ENTER BUTTON (lower third, centered)
      ================================================================ */}
      <div
        style={{
          position: 'absolute',
          bottom: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 50,
          opacity: showEnterButton ? 1 : 0,
          pointerEvents: showEnterButton ? 'auto' : 'none',
          transition: 'opacity 1s ease-in',
        }}
      >
        <button
          onClick={handleEnterClick}
          style={{
            fontFamily: "'Pirata One', cursive",
            fontSize: '1.5rem',
            padding: '1rem 2.5rem',
            background: 'linear-gradient(180deg, rgba(240, 230, 210, 0.95) 0%, rgba(220, 200, 160, 0.9) 100%)',
            color: '#3d3210',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            boxShadow: '0 0 40px rgba(201, 162, 39, 0.4), 0 4px 24px rgba(0,0,0,0.5)',
            transition: 'box-shadow 0.3s ease, transform 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 0 60px rgba(201, 162, 39, 0.6), 0 6px 32px rgba(0,0,0,0.6)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '0 0 40px rgba(201, 162, 39, 0.4), 0 4px 24px rgba(0,0,0,0.5)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          Enter the Expedition
        </button>
      </div>

      {/* ================================================================
          WALLET CONNECT MODAL (centered overlay)
      ================================================================ */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.75)',
          opacity: showConnectModal ? 1 : 0,
          pointerEvents: showConnectModal ? 'auto' : 'none',
          transition: 'opacity 0.4s ease',
        }}
        onClick={handleCloseModal}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'linear-gradient(180deg, #f0e6d2 0%, #e8dcc4 50%, #ddd0b8 100%)',
            borderRadius: '8px',
            padding: '2rem',
            maxWidth: '360px',
            width: '90%',
            boxShadow: '0 25px 80px rgba(0,0,0,0.7)',
            border: '3px solid #8b7355',
            transform: showConnectModal ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.95)',
            transition: 'transform 0.4s ease',
          }}
        >
          <h2
            style={{
              fontFamily: "'Pirata One', cursive",
              fontSize: '1.5rem',
              color: '#3d3210',
              textAlign: 'center',
              marginBottom: '0.5rem',
            }}
          >
            ⚓ Join the Crew
          </h2>
          <p
            style={{
              fontFamily: "'IM Fell English', serif",
              fontSize: '0.9rem',
              color: '#5c4a32',
              textAlign: 'center',
              marginBottom: '1.5rem',
              fontStyle: 'italic',
            }}
          >
            Connect your wallet to begin
          </p>

          {/* RainbowKit Connect */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <ConnectButton.Custom>
              {({ openConnectModal, mounted }) => {
                if (!mounted) return null;
                return (
                  <button
                    onClick={openConnectModal}
                    style={{
                      fontFamily: "'IM Fell English', serif",
                      fontSize: '1.1rem',
                      padding: '0.875rem 2rem',
                      background: '#5c4a32',
                      color: '#f5ece0',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      width: '100%',
                      transition: 'background 0.2s ease',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#4a3a28'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#5c4a32'}
                  >
                    Connect Wallet
                  </button>
                );
              }}
            </ConnectButton.Custom>
          </div>

          <button
            onClick={handleCloseModal}
            style={{
              display: 'block',
              margin: '1.25rem auto 0',
              fontFamily: "'IM Fell English', serif",
              fontSize: '0.85rem',
              color: '#6b5c47',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Not yet
          </button>
        </div>
      </div>

      {/* ================================================================
          APP LAYER
          Mounted immediately but invisible (opacity 0) until transition.
          Fades in during TRANSITIONING state.
      ================================================================ */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: isInApp ? 10 : 5,
          opacity: (isTransitioning || isInApp) ? 1 : 0,
          transition: isTransitioning ? 'opacity 1000ms ease-in 300ms' : 'none',
          pointerEvents: isInApp ? 'auto' : 'none',
          overflow: 'auto',
        }}
      >
        <TreasureHuntMockup />
      </div>

    </div>
  );
};

// ============================================================================
// Root Provider Wrapper
// ============================================================================
const App = () => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#c9a227',
            accentColorForeground: '#1a1a2e',
            borderRadius: 'medium',
            fontStack: 'system',
          })}
          modalSize="compact"
        >
          <TreasureHuntEntry />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

export default App;
