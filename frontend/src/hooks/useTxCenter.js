import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'treasure-hunt-tx-center';
const MAX_TXS = 20;

// Transaction states
export const TxStatus = {
  IDLE: 'idle',
  NEEDS_APPROVAL: 'needsApproval',
  APPROVING: 'approving',
  READY: 'ready',
  SUBMITTING: 'submitting',
  PENDING: 'pending',
  SUCCESS: 'success',
  ERROR: 'error',
  REJECTED: 'rejected',
};

// Load from localStorage
const loadTxHistory = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Re-hydrate dates
      return parsed.map(tx => ({
        ...tx,
        timestamp: new Date(tx.timestamp),
      }));
    }
  } catch (e) {
    console.warn('Failed to load tx history:', e);
  }
  return [];
};

// Save to localStorage
const saveTxHistory = (txs) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(txs.slice(0, MAX_TXS)));
  } catch (e) {
    console.warn('Failed to save tx history:', e);
  }
};

export function useTxCenter() {
  const [txHistory, setTxHistory] = useState(() => loadTxHistory());

  // Save whenever txHistory changes
  useEffect(() => {
    saveTxHistory(txHistory);
  }, [txHistory]);

  const addTx = useCallback((tx) => {
    const newTx = {
      id: tx.hash || `pending-${Date.now()}`,
      hash: tx.hash,
      action: tx.action,
      status: tx.status || TxStatus.PENDING,
      args: tx.args,
      timestamp: new Date(),
      chainId: tx.chainId,
      blockNumber: tx.blockNumber,
      error: tx.error,
    };

    setTxHistory(prev => [newTx, ...prev].slice(0, MAX_TXS));
    return newTx.id;
  }, []);

  const updateTx = useCallback((idOrHash, updates) => {
    setTxHistory(prev =>
      prev.map(tx => {
        if (tx.id === idOrHash || tx.hash === idOrHash) {
          return { ...tx, ...updates };
        }
        return tx;
      })
    );
  }, []);

  const getTxByHash = useCallback((hash) => {
    return txHistory.find(tx => tx.hash === hash);
  }, [txHistory]);

  const clearHistory = useCallback(() => {
    setTxHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    txHistory,
    addTx,
    updateTx,
    getTxByHash,
    clearHistory,
  };
}

export default useTxCenter;
