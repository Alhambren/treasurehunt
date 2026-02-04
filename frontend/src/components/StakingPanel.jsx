import { useMemo } from 'react';
import { formatUnits } from 'viem';
import { useReadContracts } from 'wagmi';
import { addresses, DECIMALS } from '../config';
import { huntStakingAbi } from '../abi/index';

const COOLDOWN_PERIOD = 7 * 24 * 60 * 60; // 7 days in seconds

const formatToken = (value, decimals, maxFrac = 4) => {
  if (value === null || value === undefined) return '--';
  const raw = formatUnits(value, decimals);
  const [whole, frac = ''] = raw.split('.');
  const clipped = frac.slice(0, maxFrac).replace(/0+$/, '');
  return clipped.length ? `${whole}.${clipped}` : whole;
};

const formatTimeRemaining = (seconds) => {
  if (seconds <= 0) return 'Ready';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

export function useStakingData(address) {
  const { data, isLoading, refetch } = useReadContracts({
    allowFailure: true,
    contracts: address ? [
      { address: addresses.huntStaking, abi: huntStakingAbi, functionName: 'stakedBalance', args: [address] },
      { address: addresses.huntStaking, abi: huntStakingAbi, functionName: 'cooldownStart', args: [address] },
      { address: addresses.huntStaking, abi: huntStakingAbi, functionName: 'isQualified', args: [address] },
      { address: addresses.huntStaking, abi: huntStakingAbi, functionName: 'totalStaked' },
    ] : [],
    query: {
      enabled: !!address && !!addresses.huntStaking,
      refetchInterval: 10000,
    },
  });

  const [stakedBalance, cooldownStart, isQualified, totalStaked] = useMemo(() => {
    if (!data) return [null, null, null, null];
    return data.map(d => d?.result ?? null);
  }, [data]);

  const cooldownStatus = useMemo(() => {
    if (!cooldownStart || cooldownStart === 0n) {
      return { status: 'none', canWithdraw: false, canInitiate: stakedBalance > 0n };
    }

    const startTime = Number(cooldownStart);
    const endTime = startTime + COOLDOWN_PERIOD;
    const now = Math.floor(Date.now() / 1000);

    if (now >= endTime) {
      return {
        status: 'ready',
        canWithdraw: true,
        canInitiate: false,
        endsAt: new Date(endTime * 1000),
      };
    }

    const remaining = endTime - now;
    return {
      status: 'active',
      canWithdraw: false,
      canInitiate: false,
      remaining,
      remainingFormatted: formatTimeRemaining(remaining),
      endsAt: new Date(endTime * 1000),
      progress: ((COOLDOWN_PERIOD - remaining) / COOLDOWN_PERIOD) * 100,
    };
  }, [cooldownStart, stakedBalance]);

  return {
    stakedBalance,
    cooldownStart,
    cooldownStatus,
    isQualified,
    totalStaked,
    isLoading,
    refetch,
  };
}

export function CooldownStatus({ cooldownStatus }) {
  if (cooldownStatus.status === 'none') {
    return (
      <div className="cooldown-status cooldown-none">
        <span className="cooldown-label">No cooldown active</span>
      </div>
    );
  }

  if (cooldownStatus.status === 'ready') {
    return (
      <div className="cooldown-status cooldown-ready">
        <span className="cooldown-icon">✓</span>
        <span className="cooldown-label">Cooldown complete - Ready to withdraw</span>
      </div>
    );
  }

  return (
    <div className="cooldown-status cooldown-active">
      <div className="cooldown-progress">
        <div
          className="cooldown-progress-fill"
          style={{ width: `${cooldownStatus.progress}%` }}
        />
      </div>
      <div className="cooldown-info">
        <span className="cooldown-label">Cooldown active</span>
        <span className="cooldown-remaining">{cooldownStatus.remainingFormatted} remaining</span>
      </div>
    </div>
  );
}

export function QualificationStatus({ isQualified, stakedBalance, hasBetThisEpoch }) {
  if (!stakedBalance || stakedBalance === 0n) {
    return (
      <div className="qualification-status not-qualified">
        <span className="qual-icon">○</span>
        <span className="qual-label">Inactive</span>
        <span className="qual-reason">Stake HUNT to join the crew</span>
      </div>
    );
  }

  if (isQualified) {
    return (
      <div className="qualification-status qualified">
        <span className="qual-icon">●</span>
        <span className="qual-label">Qualified</span>
        <span className="qual-reason">Earning rewards this epoch</span>
      </div>
    );
  }

  return (
    <div className="qualification-status pending">
      <span className="qual-icon">◐</span>
      <span className="qual-label">Staked but not qualified</span>
      <span className="qual-reason">Place a bet to qualify for rewards</span>
    </div>
  );
}

export default { useStakingData, CooldownStatus, QualificationStatus };
