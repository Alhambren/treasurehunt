import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';

const CHAIN_ENV = (import.meta.env.VITE_CHAIN_ENV ?? 'mainnet').toLowerCase();
const SUPPORTED_CHAIN = CHAIN_ENV === 'sepolia' ? baseSepolia : base;

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '00000000000000000000000000000000';
const rpcUrl =
  import.meta.env.VITE_RPC_URL ||
  import.meta.env[`VITE_RPC_URL_${CHAIN_ENV.toUpperCase()}`] ||
  null;
const fallbackRpc =
  SUPPORTED_CHAIN?.rpcUrls?.default?.http?.[0] ||
  SUPPORTED_CHAIN?.rpcUrls?.public?.http?.[0] ||
  undefined;
const transport = rpcUrl ? http(rpcUrl) : http(fallbackRpc);

export const wagmiConfig = getDefaultConfig({
  appName: 'Treasure Hunt',
  projectId,
  chains: [SUPPORTED_CHAIN],
  ssr: false,
  transports: {
    [SUPPORTED_CHAIN.id]: transport,
  },
});
