export const mapTokenAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'currentPrice',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'MapBought',
    anonymous: false,
    inputs: [
      { indexed: true, name: 'buyer', type: 'address' },
      { indexed: false, name: 'usdcIn', type: 'uint256' },
      { indexed: false, name: 'mapOut', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'MapSold',
    anonymous: false,
    inputs: [
      { indexed: true, name: 'seller', type: 'address' },
      { indexed: false, name: 'mapIn', type: 'uint256' },
      { indexed: false, name: 'usdcOut', type: 'uint256' },
    ],
  },
];
