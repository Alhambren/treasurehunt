import { isAddress } from 'viem';
import { base, baseSepolia } from 'wagmi/chains';

const readEnv = (key) => {
  const value = import.meta.env[key];
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const addressFromEnv = (key) => {
  const value = readEnv(key);
  if (!value) return null;
  return isAddress(value) ? value : null;
};

const CHAIN_ENV_RAW = (readEnv('VITE_CHAIN_ENV') ?? 'mainnet').toLowerCase();
const CHAIN_OPTIONS = {
  mainnet: {
    id: 8453,
    name: 'Base',
    chain: base,
    suffix: 'MAINNET',
  },
  sepolia: {
    id: 84532,
    name: 'Base Sepolia',
    chain: baseSepolia,
    suffix: 'SEPOLIA',
  },
};

const selectedChain = CHAIN_OPTIONS[CHAIN_ENV_RAW] ?? CHAIN_OPTIONS.mainnet;

export const CHAIN_ENV = CHAIN_ENV_RAW;
export const CHAIN_ENV_VALID = !!CHAIN_OPTIONS[CHAIN_ENV_RAW];
export const SUPPORTED_CHAIN = selectedChain.chain;
export const SUPPORTED_CHAIN_ID = selectedChain.id;
export const SUPPORTED_CHAIN_NAME = selectedChain.name;

const ADDRESS_KEYS = {
  treasureEngine: 'VITE_TREASURE_ENGINE_ADDRESS',
  huntToken: 'VITE_HUNT_TOKEN_ADDRESS',
  mapToken: 'VITE_MAP_TOKEN_ADDRESS',
  huntStaking: 'VITE_HUNT_STAKING_ADDRESS',
  usdc: 'VITE_USDC_ADDRESS',
};

export const REQUIRED_ENV = {
  chainEnv: 'VITE_CHAIN_ENV',
  walletConnect: 'VITE_WALLETCONNECT_PROJECT_ID',
  ...Object.fromEntries(
    Object.entries(ADDRESS_KEYS).map(([key, baseKey]) => [
      key,
      `${baseKey}_${selectedChain.suffix}`,
    ])
  ),
};

export const addresses = Object.fromEntries(
  Object.entries(ADDRESS_KEYS).map(([key, baseKey]) => [
    key,
    addressFromEnv(`${baseKey}_${selectedChain.suffix}`),
  ])
);

export const addressIssues = Object.entries(addresses)
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const configIssues = [...addressIssues, ...(CHAIN_ENV_VALID ? [] : ['chainEnv'])];

export const configReady = configIssues.length === 0;

export const DECIMALS = {
  usdc: 6,
  hunt: 18,
  map: 18,
};

export const walletConnectProjectId = readEnv('VITE_WALLETCONNECT_PROJECT_ID');

export const DEMO_MODE = (readEnv('VITE_DEMO_MODE') ?? 'false').toLowerCase() === 'true';
