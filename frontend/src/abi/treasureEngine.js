export const treasureEngineAbi = [
  {
    type: 'function',
    name: 'J',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'M',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'epochId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'TreasureDiscovered',
    anonymous: false,
    inputs: [
      { indexed: true, name: 'discoverer', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'epochId', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'ExpeditionStarted',
    anonymous: false,
    inputs: [
      { indexed: false, name: 'epochId', type: 'uint256' },
      { indexed: false, name: 'newM', type: 'uint256' },
    ],
  },
];
