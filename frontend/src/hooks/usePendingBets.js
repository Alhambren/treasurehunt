import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'treasure-hunt-pending-bets';

// Load from localStorage
const loadPendingBets = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return new Map(parsed.map(([k, v]) => [k, {
        ...v,
        timestamp: new Date(v.timestamp),
      }]));
    }
  } catch (e) {
    console.warn('Failed to load pending bets:', e);
  }
  return new Map();
};

// Save to localStorage
const savePendingBets = (bets) => {
  try {
    const arr = Array.from(bets.entries());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch (e) {
    console.warn('Failed to save pending bets:', e);
  }
};

export function usePendingBets() {
  const [pendingBets, setPendingBets] = useState(() => loadPendingBets());

  // Save whenever pendingBets changes
  useEffect(() => {
    savePendingBets(pendingBets);
  }, [pendingBets]);

  const addPendingBet = useCallback((requestId, betData) => {
    setPendingBets(prev => {
      const next = new Map(prev);
      next.set(requestId.toString(), {
        requestId: requestId.toString(),
        amount: betData.amount.toString(),
        bettor: betData.bettor,
        txHash: betData.txHash,
        timestamp: new Date(),
        status: 'pending', // pending | resolved | expired
      });
      return next;
    });
  }, []);

  const resolveBet = useCallback((requestId, resolution) => {
    setPendingBets(prev => {
      const next = new Map(prev);
      const existing = next.get(requestId.toString());
      if (existing) {
        next.set(requestId.toString(), {
          ...existing,
          status: 'resolved',
          resolution,
          resolvedAt: new Date(),
        });
      }
      return next;
    });
  }, []);

  const removeBet = useCallback((requestId) => {
    setPendingBets(prev => {
      const next = new Map(prev);
      next.delete(requestId.toString());
      return next;
    });
  }, []);

  const getPendingBetsArray = useCallback(() => {
    return Array.from(pendingBets.values()).filter(b => b.status === 'pending');
  }, [pendingBets]);

  const clearOldBets = useCallback((maxAge = 24 * 60 * 60 * 1000) => {
    const now = Date.now();
    setPendingBets(prev => {
      const next = new Map();
      prev.forEach((bet, key) => {
        const age = now - new Date(bet.timestamp).getTime();
        if (age < maxAge || bet.status === 'pending') {
          next.set(key, bet);
        }
      });
      return next;
    });
  }, []);

  return {
    pendingBets,
    pendingBetsArray: getPendingBetsArray(),
    addPendingBet,
    resolveBet,
    removeBet,
    clearOldBets,
  };
}

export default usePendingBets;
