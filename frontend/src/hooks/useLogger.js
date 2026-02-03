import { useCallback, useRef } from 'react';

const LOG_STORAGE_KEY = 'treasure-hunt-logs';
const MAX_LOGS = 100;

// Log levels
export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
};

// Get stored logs
const getStoredLogs = () => {
  try {
    const stored = localStorage.getItem(LOG_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

// Save logs
const saveLogs = (logs) => {
  try {
    localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs.slice(-MAX_LOGS)));
  } catch (e) {
    console.warn('Failed to save logs:', e);
  }
};

export function useLogger(chainId) {
  const logsRef = useRef(getStoredLogs());

  const log = useCallback((level, action, data) => {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      action,
      chainId,
      ...data,
    };

    // Console output
    const consoleMethod = level === LogLevel.ERROR ? console.error :
                          level === LogLevel.WARN ? console.warn :
                          level === LogLevel.DEBUG ? console.debug :
                          console.log;

    consoleMethod(`[TreasureHunt] ${action}`, entry);

    // Store
    logsRef.current = [...logsRef.current, entry].slice(-MAX_LOGS);
    saveLogs(logsRef.current);

    return entry;
  }, [chainId]);

  const logTx = useCallback((action, { hash, args, status, receipt, error }) => {
    return log(
      error ? LogLevel.ERROR : LogLevel.INFO,
      action,
      {
        txHash: hash,
        args: args ? JSON.stringify(args) : undefined,
        status,
        blockNumber: receipt?.blockNumber,
        gasUsed: receipt?.gasUsed?.toString(),
        error: error?.message || error?.reason,
        revertReason: error?.data?.message,
      }
    );
  }, [log]);

  const logEvent = useCallback((eventName, args) => {
    return log(LogLevel.INFO, `event:${eventName}`, { args });
  }, [log]);

  const logError = useCallback((action, error) => {
    return log(LogLevel.ERROR, action, {
      error: error?.message,
      code: error?.code,
      reason: error?.reason,
      data: error?.data,
    });
  }, [log]);

  const getLogs = useCallback(() => logsRef.current, []);

  const clearLogs = useCallback(() => {
    logsRef.current = [];
    localStorage.removeItem(LOG_STORAGE_KEY);
  }, []);

  const exportLogs = useCallback(() => {
    const blob = new Blob([JSON.stringify(logsRef.current, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `treasure-hunt-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return {
    log,
    logTx,
    logEvent,
    logError,
    getLogs,
    clearLogs,
    exportLogs,
  };
}

export default useLogger;
