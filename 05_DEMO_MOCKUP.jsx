import React, { useState, useEffect } from 'react';

// Treasure Hunt DEMO Mockup v1.5
// ⚠️ THIS IS A SCRIPTED DEMONSTRATION — NOT LIVE PROTOCOL BEHAVIOR
// Visual Direction: Monkey Island — Pirate Adventure
// Typography: Pirata One (headings), IM Fell English (body)

const TreasureHuntDemo = () => {
  // Demo state
  const [demoStep, setDemoStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [particles, setParticles] = useState([]);
  const [mapGlow, setMapGlow] = useState(false);

  // Simulated game state
  const [J, setJ] = useState(0);
  const [M] = useState(100);
  const [balance, setBalance] = useState(1000);
  const [huntBalance, setHuntBalance] = useState(0);
  const [mapBalance, setMapBalance] = useState(0);
  const [log, setLog] = useState([
    { message: "⚠ DEMO MODE — This is a scripted presentation, not live protocol behavior.", type: 'demo', time: '--:--' }
  ]);

  // Scripted outcomes for the 10 explorations
  const scriptedOutcomes = [
    { multiplier: 0, name: '0×', contribution: 5 },
    { multiplier: 0.5, name: '½×', contribution: 0 },
    { multiplier: 0, name: '0×', contribution: 5 },
    { multiplier: 1, name: '1×', contribution: 0 },
    { multiplier: 0, name: '0×', contribution: 5 },
    { multiplier: 0, name: '0×', contribution: 5 },
    { multiplier: 1.5, name: '1½×', contribution: 0 },
    { multiplier: 0, name: '0×', contribution: 5 },
    { multiplier: 0, name: '0×', contribution: 5 },
    { multiplier: 0, name: '0×', contribution: 70, discovery: true },
  ];

  // Narrative messages
  const narrativeMessages = {
    contribution: [
      "A false trail! But the chest grows richer...",
      "The path crumbles — yer sacrifice strengthens the expedition.",
      "Nothing found — yet. The treasure stirs in its hiding place.",
      "A dead end! But every step maps the unknown.",
      "The jungle swallows yer supplies. The chest remembers.",
    ],
    partial: ["A narrow escape! Ye salvage what ye can."],
    even: ["Ye break even. The map eyes ye suspiciously."],
    small: ["A modest find! The crew nods approvingly."],
    hunt: ["The expedition marks yer contribution (+{amount} $HUNT)"],
  };

  const discoveryNarrative = [
    "☠ THE CHEST BURSTS OPEN!",
    "Gold spills across the deck like morning sunlight!",
    "The crew erupts in celebration — WE FOUND IT!",
    "Tales of this discovery will echo through the ages!",
    "As Discoverer, ye claim the lion's share! (+$50.00 USDC)",
    "The loyal crew divides their portion with joy!",
    "The Map glows with newfound power...",
    "A new expedition begins! Uncharted waters ahead!",
  ];

  const addLog = (message, type = 'info') => {
    const now = new Date();
    setLog(prev => [...prev.slice(-12), {
      message,
      type,
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }]);
  };

  // Spawn celebration particles
  const spawnParticles = () => {
    const newParticles = [];
    const types = ['coin', 'sparkle', 'star', 'gem'];
    for (let i = 0; i < 50; i++) {
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
            opacity: p.opacity - 0.01,
          }))
          .filter(p => p.opacity > 0 && p.y < 110)
      );
    }, 50);
    return () => clearInterval(interval);
  }, [particles.length > 0]);

  // Run demo sequence
  const runDemo = async () => {
    if (isRunning) return;

    setIsRunning(true);
    setDemoStep(0);
    setJ(0);
    setBalance(1000);
    setHuntBalance(0);
    setMapBalance(0);
    setShowDiscovery(false);
    setMapGlow(false);
    setLog([
      { message: "⚠ DEMO MODE — Scripted presentation beginning...", type: 'demo', time: '--:--' }
    ]);

    await new Promise(r => setTimeout(r, 1000));
    addLog("The expedition begins! Let us explore...", 'expedition');

    for (let i = 0; i < 10; i++) {
      setDemoStep(i + 1);
      const outcome = scriptedOutcomes[i];

      addLog(`Exploration ${i + 1}/10... consulting the oracle...`, 'info');
      await new Promise(r => setTimeout(r, 1500));

      if (outcome.discovery) {
        setJ(100);
        addLog("The chest trembles... something stirs...", 'expedition');
        await new Promise(r => setTimeout(r, 1000));

        setShowDiscovery(true);
        setMapGlow(true);
        spawnParticles();

        for (const msg of discoveryNarrative) {
          addLog(msg, msg.includes('☠') ? 'discovery' : msg.includes('Map') ? 'map' : 'reward');
          await new Promise(r => setTimeout(r, 800));
        }

        setBalance(prev => prev + 50);
        setMapBalance(prev => prev + 100);
        await new Promise(r => setTimeout(r, 2000));

      } else if (outcome.multiplier === 0) {
        setJ(prev => prev + outcome.contribution);
        setBalance(prev => prev - 10);
        setHuntBalance(prev => prev + 10);
        const msg = narrativeMessages.contribution[i % narrativeMessages.contribution.length];
        addLog(msg, 'contribution');
        addLog(narrativeMessages.hunt[0].replace('{amount}', '10.00'), 'mint');

      } else if (outcome.multiplier === 0.5) {
        setBalance(prev => prev - 5);
        addLog(narrativeMessages.partial[0], 'partial');

      } else if (outcome.multiplier === 1) {
        addLog(narrativeMessages.even[0], 'info');

      } else if (outcome.multiplier >= 1.5) {
        setBalance(prev => prev + 5);
        addLog(narrativeMessages.small[0], 'fortune');
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    await new Promise(r => setTimeout(r, 3000));
    setShowDiscovery(false);
    addLog("✦ Demo complete! This was a scripted presentation.", 'demo');
    setIsRunning(false);
  };

  const resetDemo = () => {
    setIsRunning(false);
    setDemoStep(0);
    setJ(0);
    setBalance(1000);
    setHuntBalance(0);
    setMapBalance(0);
    setShowDiscovery(false);
    setMapGlow(false);
    setParticles([]);
    setLog([
      { message: "⚠ DEMO MODE — This is a scripted presentation, not live protocol behavior.", type: 'demo', time: '--:--' }
    ]);
  };

  const progressPercent = (J / M) * 100;

  const getLogStyle = (type) => {
    const styles = {
      demo: 'border-l-4 border-violet-600 bg-violet-900/20',
      discovery: 'border-l-4 border-amber-500 bg-amber-900/30',
      reward: 'border-l-4 border-emerald-700 bg-emerald-900/20',
      contribution: 'border-l-4 border-orange-700 bg-orange-900/10',
      mint: 'border-l-4 border-sky-700 bg-sky-900/10',
      fortune: 'border-l-4 border-teal-600 bg-teal-900/20',
      partial: 'border-l-4 border-amber-700 bg-amber-900/10',
      map: 'border-l-4 border-indigo-600 bg-indigo-900/20',
      expedition: 'border-l-4 border-amber-600 bg-amber-900/10',
      info: 'border-l-4 border-stone-600 bg-stone-800/20',
    };
    return styles[type] || styles.info;
  };

  const getParticleEmoji = (type) => {
    const emojis = { coin: '●', sparkle: '✦', star: '★', gem: '◆' };
    return emojis[type] || '✦';
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
            ? 'linear-gradient(180deg, #5c3d6e 0%, #3d2850 50%, #2d1b40 100%)'
            : variant === 'danger'
              ? 'linear-gradient(180deg, #6b3030 0%, #4a2020 100%)'
              : 'linear-gradient(180deg, #5c4a32 0%, #3d3220 100%)',
        color: disabled ? '#6b5c47' : '#e9d5ff',
        border: disabled ? '2px solid #3d3428' : '2px solid #8b5cf6',
        borderRadius: '4px',
        boxShadow: disabled ? 'none' : '0 4px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
        textShadow: disabled ? 'none' : '0 1px 2px rgba(0,0,0,0.5)',
      }}
    >
      {children}
    </button>
  );

  // Ink divider
  const InkDivider = () => (
    <div className="my-4 flex items-center justify-center gap-3">
      <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, #5c4a32, #5c4a32)' }} />
      <span style={{ color: '#5c4a32' }}>✦</span>
      <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, #5c4a32, #5c4a32, transparent)' }} />
    </div>
  );

  return (
    <div className="min-h-screen p-4 relative overflow-hidden" style={{
      background: 'linear-gradient(180deg, #1a1510 0%, #0f0d0a 100%)',
      fontFamily: "'IM Fell English', 'Times New Roman', serif",
    }}>
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Pirata+One&family=IM+Fell+English:ital@0;1&display=swap');

        .font-pirata { font-family: 'Pirata One', cursive; }
        .font-fell { font-family: 'IM Fell English', serif; }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes flicker {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
      `}</style>

      {/* Floating Particles */}
      {particles.map(p => (
        <div
          key={p.id}
          className="fixed pointer-events-none text-2xl z-50 font-pirata"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            transform: `rotate(${p.rotation}deg) scale(${p.scale})`,
            opacity: p.opacity,
            color: '#ffd700',
            textShadow: '0 0 10px rgba(255, 215, 0, 0.8)',
          }}
        >
          {getParticleEmoji(p.type)}
        </div>
      ))}

      {/* Discovery Overlay */}
      {showDiscovery && (
        <div className="fixed inset-0 z-40 pointer-events-none">
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(circle at 50% 40%, rgba(201, 162, 39, 0.4) 0%, transparent 60%)',
              animation: 'flicker 0.5s ease-in-out infinite',
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="w-96 h-96"
              style={{
                background: 'conic-gradient(from 0deg, transparent, rgba(255, 215, 0, 0.2), transparent, rgba(255, 215, 0, 0.2), transparent)',
                animation: 'spin 8s linear infinite',
              }}
            />
          </div>
        </div>
      )}

      {/* Discovery Banner */}
      {showDiscovery && (
        <div className="fixed top-1/4 left-1/2 transform -translate-x-1/2 z-50 text-center animate-bounce">
          <div className="font-pirata text-6xl mb-4" style={{
            color: '#ffd700',
            textShadow: '0 0 20px rgba(255, 215, 0, 0.8), 2px 2px 0 #5c4a12'
          }}>
            ☠ ✦ ⚓
          </div>
          <h1
            className="font-pirata text-5xl mb-2"
            style={{
              color: '#ffd700',
              textShadow: '0 0 20px rgba(255, 215, 0, 0.8), 3px 3px 0 #3d3210'
            }}
          >
            TREASURE DISCOVERED!
          </h1>
          <p className="font-fell text-xl italic" style={{ color: '#f5e6c8' }}>
            The expedition celebrates!
          </p>
        </div>
      )}

      <div className="max-w-4xl mx-auto relative z-10">
        {/* Demo Banner */}
        <div
          className="mb-4 p-4 rounded text-center"
          style={{
            background: 'linear-gradient(90deg, #3d2850 0%, #2d1b40 50%, #3d2850 100%)',
            border: '3px solid #8b5cf6',
            boxShadow: '0 0 20px rgba(139, 92, 246, 0.3)',
          }}
        >
          <div className="flex items-center justify-center gap-3">
            <span className="font-pirata text-2xl" style={{ color: '#c4b5fd' }}>⚠</span>
            <span className="font-pirata text-xl" style={{ color: '#e9d5ff' }}>DEMO MODE</span>
            <span className="font-pirata text-2xl" style={{ color: '#c4b5fd' }}>⚠</span>
          </div>
          <p className="font-fell text-sm italic mt-2" style={{ color: '#a5b4fc' }}>
            This is a scripted presentation demonstrating the discovery experience.
            <br />Not live protocol behavior. Outcomes are pre-determined for demonstration.
          </p>
        </div>

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="font-pirata text-5xl mb-2" style={{
            color: '#c9a227',
            textShadow: '3px 3px 0 #3d3210, 0 0 20px rgba(201, 162, 39, 0.3)'
          }}>
            ⚓ TREASURE HUNT ⚓
          </h1>
          <p className="font-fell italic" style={{ color: '#8b7355' }}>
            Discovery Demo — Scripted Presentation
          </p>
          <InkDivider />
        </div>

        {/* Demo Controls */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <WoodButton
            onClick={runDemo}
            disabled={isRunning}
            className="py-4 text-xl"
          >
            {isRunning ? `⊕ Exploration ${demoStep}/10...` : '▶ RUN DEMO (10 Explorations)'}
          </WoodButton>
          <WoodButton
            onClick={resetDemo}
            variant="danger"
            className="py-4 text-xl"
          >
            ↺ RESET DEMO
          </WoodButton>
        </div>

        {/* Treasure Progress */}
        <ParchmentPanel className="p-4 mb-6" glow={showDiscovery}>
          <div className="flex justify-between mb-2">
            <span className="font-pirata text-xl" style={{ color: '#3d3210' }}>☠ Treasure Chest</span>
            <span className="font-pirata text-xl" style={{ color: '#5c4a12' }}>${J.toFixed(2)} / ${M.toFixed(0)}</span>
          </div>
          <div className="h-8 rounded overflow-hidden" style={{
            background: '#c9b896',
            border: '2px solid #8b7355',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
          }}>
            <div
              className="h-full transition-all duration-1000 flex items-center justify-end pr-3"
              style={{
                width: `${Math.min(progressPercent, 100)}%`,
                background: showDiscovery
                  ? 'linear-gradient(90deg, #ffd700 0%, #ffec8b 50%, #ffd700 100%)'
                  : 'linear-gradient(90deg, #8b6914 0%, #c9a227 50%, #8b6914 100%)',
                boxShadow: showDiscovery ? '0 0 15px rgba(255, 215, 0, 0.6)' : 'none',
              }}
            >
              {progressPercent > 20 && (
                <span className="font-pirata text-sm" style={{ color: '#3d3210', textShadow: '0 1px 0 rgba(255,255,255,0.3)' }}>
                  {progressPercent.toFixed(0)}%
                </span>
              )}
            </div>
          </div>
          <p className="font-fell text-sm text-center mt-2 italic" style={{ color: '#6b5c47' }}>
            {showDiscovery
              ? "✦ TREASURE DISCOVERED! The chest overflows!"
              : "The chest fills with each contribution..."}
          </p>
        </ParchmentPanel>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Holdings Panel */}
          <ParchmentPanel className="p-4">
            <h2 className="font-pirata text-xl mb-3 text-center" style={{ color: '#3d3210' }}>
              ☠ Yer Holdings
            </h2>
            <div className="space-y-2">
              <div className="flex justify-between items-center p-2 rounded" style={{ background: '#c9b896', border: '1px solid #8b7355' }}>
                <span className="font-pirata" style={{ color: '#5c4a32' }}>● Doubloons</span>
                <span className="font-pirata text-lg" style={{ color: '#3d3210' }}>${balance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center p-2 rounded" style={{ background: '#c9b896', border: '1px solid #8b7355' }}>
                <span className="font-pirata" style={{ color: '#5c4a32' }}>⊕ HUNT</span>
                <span className="font-pirata text-lg" style={{ color: '#3d3210' }}>{huntBalance.toFixed(2)}</span>
              </div>
            </div>
          </ParchmentPanel>

          {/* MAP Panel */}
          <ParchmentPanel className="p-4" glow={mapGlow} dark={true}>
            <h2 className="font-pirata text-xl mb-3 text-center" style={{ color: mapGlow ? '#ffd700' : '#c9a227' }}>
              ◇ The Map {mapGlow && '✦'}
            </h2>
            <div className="space-y-2">
              <div className="flex justify-between items-center p-2 rounded" style={{
                background: 'linear-gradient(180deg, #2a2418 0%, #1a1510 100%)',
                border: '1px solid #5c4a32'
              }}>
                <span className="font-fell text-sm" style={{ color: '#8b7355' }}>MAP Held</span>
                <span className="font-pirata" style={{ color: '#c9a227' }}>{mapBalance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center p-2 rounded" style={{
                background: 'linear-gradient(180deg, #2a2418 0%, #1a1510 100%)',
                border: '1px solid #5c4a32'
              }}>
                <span className="font-fell text-sm" style={{ color: '#8b7355' }}>Map State</span>
                <span className="font-pirata" style={{ color: '#c9a227' }}>
                  {mapGlow ? '✦ Myth Made Real' : '◇ Blank Parchment'}
                </span>
              </div>
            </div>
            <p className="font-fell text-sm mt-3 text-center italic" style={{ color: mapGlow ? '#ffd700' : '#5c4a32' }}>
              {mapGlow
                ? "The map blazes with newfound glory!"
                : "The parchment awaits yer contributions..."}
            </p>
          </ParchmentPanel>
        </div>

        {/* Captain's Log */}
        <ParchmentPanel className="p-4" dark={true}>
          <h2 className="font-pirata text-xl mb-3 text-center" style={{ color: '#c9a227' }}>
            ✎ Captain's Log
          </h2>
          <div
            className="h-64 overflow-y-auto space-y-1 p-2 rounded"
            style={{
              background: '#0f0d0a',
              border: '2px solid #3d3210',
              boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5)'
            }}
          >
            {log.map((entry, i) => (
              <div
                key={i}
                className={`p-2 rounded font-fell ${getLogStyle(entry.type)}`}
                style={{
                  animation: i === log.length - 1 ? 'fadeIn 0.5s ease-out' : 'none'
                }}
              >
                <span style={{ color: '#5c4a32' }}>[{entry.time}]</span>{' '}
                <span style={{
                  color: entry.type === 'discovery' ? '#ffd700' :
                         entry.type === 'demo' ? '#c4b5fd' : '#c9b896'
                }}>
                  {entry.message}
                </span>
              </div>
            ))}
          </div>
        </ParchmentPanel>

        {/* Footer */}
        <div className="text-center mt-8">
          <InkDivider />
          <p className="font-pirata text-lg" style={{ color: '#8b5cf6' }}>
            ⚠ DEMO MODE — Scripted presentation only ⚠
          </p>
          <p className="font-fell text-sm italic mt-2" style={{ color: '#3d3210' }}>
            Demo Mockup v1.5 — Monkey Island Edition
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default TreasureHuntDemo;
