export const huntStakingAbi = [
  {
    type: 'function',
    name: 'stakedBalance',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
];
