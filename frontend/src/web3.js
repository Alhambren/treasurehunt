import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'viem';

import { SUPPORTED_CHAIN, walletConnectProjectId } from './config.js';

const projectId = walletConnectProjectId || '00000000000000000000000000000000';

export const appChains = [SUPPORTED_CHAIN];

export const wagmiConfig = getDefaultConfig({
  appName: 'Treasure Hunt',
  projectId,
  chains: appChains,
  ssr: false,
  transports: {
    [SUPPORTED_CHAIN.id]: http(),
  },
});
