import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';

const CHAIN_ENV = (import.meta.env.VITE_CHAIN_ENV ?? 'mainnet').toLowerCase();
const SUPPORTED_CHAIN = CHAIN_ENV === 'sepolia' ? baseSepolia : base;

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '00000000000000000000000000000000';

export const wagmiConfig = getDefaultConfig({
  appName: 'Treasure Hunt',
  projectId,
  chains: [SUPPORTED_CHAIN],
  ssr: false,
  transports: {
    [SUPPORTED_CHAIN.id]: http(),
  },
});
