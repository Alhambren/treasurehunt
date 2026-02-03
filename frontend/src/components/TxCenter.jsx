import { formatUnits } from 'viem';
import { TxStatus } from '../hooks/useTxCenter';
import { SUPPORTED_CHAIN_ID } from '../config';

const EXPLORER_BASE = SUPPORTED_CHAIN_ID === 84532
  ? 'https://sepolia.basescan.org'
  : 'https://basescan.org';

const formatTime = (date) => {
  if (!date) return '--';
  const d = new Date(date);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const shortHash = (hash) => {
  if (!hash) return '--';
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
};

const statusIcon = (status) => {
  switch (status) {
    case TxStatus.SUCCESS: return '✓';
    case TxStatus.ERROR: return '✗';
    case TxStatus.REJECTED: return '⊘';
    case TxStatus.PENDING:
    case TxStatus.SUBMITTING:
    case TxStatus.APPROVING: return '◌';
    default: return '•';
  }
};

const statusClass = (status) => {
  switch (status) {
    case TxStatus.SUCCESS: return 'tx-success';
    case TxStatus.ERROR:
    case TxStatus.REJECTED: return 'tx-error';
    case TxStatus.PENDING:
    case TxStatus.SUBMITTING:
    case TxStatus.APPROVING: return 'tx-pending';
    default: return '';
  }
};

export function TxCenter({ txHistory, onClear, pendingBets = [] }) {
  const hasTxs = txHistory.length > 0 || pendingBets.length > 0;

  return (
    <div className="tx-center">
      <div className="tx-center-header">
        <h3>Transaction Center</h3>
        {hasTxs && (
          <button className="ghost small" onClick={onClear}>
            Clear
          </button>
        )}
      </div>

      {pendingBets.length > 0 && (
        <div className="pending-bets-section">
          <div className="section-label">Awaiting VRF</div>
          {pendingBets.map((bet) => (
            <div key={bet.requestId} className="tx-item tx-pending">
              <div className="tx-icon">◌</div>
              <div className="tx-details">
                <div className="tx-action">Bet #{bet.requestId.slice(-6)}</div>
                <div className="tx-meta">
                  {formatUnits(BigInt(bet.amount), 6)} USDC • Waiting for randomness...
                </div>
              </div>
              <div className="tx-time">{formatTime(bet.timestamp)}</div>
            </div>
          ))}
        </div>
      )}

      {txHistory.length > 0 ? (
        <div className="tx-list">
          {txHistory.slice(0, 10).map((tx) => (
            <div key={tx.id} className={`tx-item ${statusClass(tx.status)}`}>
              <div className="tx-icon">{statusIcon(tx.status)}</div>
              <div className="tx-details">
                <div className="tx-action">{tx.action}</div>
                <div className="tx-meta">
                  {tx.hash ? (
                    <a
                      href={`${EXPLORER_BASE}/tx/${tx.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tx-hash"
                    >
                      {shortHash(tx.hash)}
                    </a>
                  ) : (
                    <span className="tx-hash">--</span>
                  )}
                  {tx.blockNumber && <span> • Block {tx.blockNumber.toString()}</span>}
                  {tx.error && <span className="tx-error-msg"> • {tx.error}</span>}
                </div>
              </div>
              <div className="tx-time">{formatTime(tx.timestamp)}</div>
            </div>
          ))}
        </div>
      ) : pendingBets.length === 0 ? (
        <div className="tx-empty">No recent transactions</div>
      ) : null}
    </div>
  );
}

export default TxCenter;
