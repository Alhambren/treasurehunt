import { useMemo } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { useReadContract } from 'wagmi';
import { addresses, DECIMALS } from '../config';
import { mapTokenAbi } from '../abi/index';

const formatToken = (value, decimals, maxFrac = 4) => {
  if (value === null || value === undefined) return '--';
  const raw = formatUnits(value, decimals);
  const [whole, frac = ''] = raw.split('.');
  const clipped = frac.slice(0, maxFrac).replace(/0+$/, '');
  return clipped.length ? `${whole}.${clipped}` : whole;
};

export function MapBuyQuote({ usdcAmount, slippage = 0.5 }) {
  const parsedAmount = useMemo(() => {
    try {
      if (!usdcAmount || isNaN(parseFloat(usdcAmount))) return null;
      return parseUnits(usdcAmount, DECIMALS.usdc);
    } catch {
      return null;
    }
  }, [usdcAmount]);

  const { data: mapOut, isLoading } = useReadContract({
    address: addresses.mapToken,
    abi: mapTokenAbi,
    functionName: 'getBuyPrice',
    args: parsedAmount ? [parsedAmount] : undefined,
    query: {
      enabled: !!parsedAmount && parsedAmount > 0n,
    },
  });

  const minOut = useMemo(() => {
    if (!mapOut) return null;
    const slippageBps = BigInt(Math.floor(slippage * 100));
    return (mapOut * (10000n - slippageBps)) / 10000n;
  }, [mapOut, slippage]);

  if (!parsedAmount || parsedAmount === 0n) {
    return null;
  }

  return (
    <div className="quote-preview">
      {isLoading ? (
        <span className="quote-loading">Calculating...</span>
      ) : mapOut ? (
        <>
          <span className="quote-value">
            ≈ {formatToken(mapOut, DECIMALS.map, 4)} MAP
          </span>
          <span className="quote-slippage">
            Min: {formatToken(minOut, DECIMALS.map, 4)} ({slippage}% slippage)
          </span>
        </>
      ) : (
        <span className="quote-error">Unable to quote</span>
      )}
    </div>
  );
}

export function MapSellQuote({ mapAmount, slippage = 0.5 }) {
  const parsedAmount = useMemo(() => {
    try {
      if (!mapAmount || isNaN(parseFloat(mapAmount))) return null;
      return parseUnits(mapAmount, DECIMALS.map);
    } catch {
      return null;
    }
  }, [mapAmount]);

  const { data: usdcOut, isLoading } = useReadContract({
    address: addresses.mapToken,
    abi: mapTokenAbi,
    functionName: 'getSellProceeds',
    args: parsedAmount ? [parsedAmount] : undefined,
    query: {
      enabled: !!parsedAmount && parsedAmount > 0n,
    },
  });

  const minOut = useMemo(() => {
    if (!usdcOut) return null;
    const slippageBps = BigInt(Math.floor(slippage * 100));
    return (usdcOut * (10000n - slippageBps)) / 10000n;
  }, [usdcOut, slippage]);

  if (!parsedAmount || parsedAmount === 0n) {
    return null;
  }

  return (
    <div className="quote-preview">
      {isLoading ? (
        <span className="quote-loading">Calculating...</span>
      ) : usdcOut ? (
        <>
          <span className="quote-value">
            ≈ {formatToken(usdcOut, DECIMALS.usdc, 2)} USDC
          </span>
          <span className="quote-slippage">
            Min: {formatToken(minOut, DECIMALS.usdc, 2)} ({slippage}% slippage)
          </span>
        </>
      ) : (
        <span className="quote-error">Unable to quote</span>
      )}
    </div>
  );
}

export default MapBuyQuote;
