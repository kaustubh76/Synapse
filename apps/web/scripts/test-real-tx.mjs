#!/usr/bin/env node
/**
 * Real Transaction Test Script
 * Tests actual x402 payment on Base Sepolia
 */

import { ethers } from 'ethers';

// Configuration
const RPC_URL = 'https://sepolia.base.org';
const PRIVATE_KEY = '0xe4b3a930b26dcf5d056fe1309514efb717d172b19c5c13f5ce6e8c50a0d5cab9';
const WALLET_ADDRESS = '0xcF1A4587a4470634fc950270cab298B79b258eDe';

// Base Sepolia USDC Contract
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const USDC_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

// Test recipient (burn address for test)
const TEST_RECIPIENT = '0x000000000000000000000000000000000000dEaD';

async function main() {
  console.log('='.repeat(60));
  console.log('SYNAPSE x402 Real Transaction Test');
  console.log('='.repeat(60));
  console.log('');

  // Connect to Base Sepolia
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log('Wallet Address:', wallet.address);
  console.log('Network: Base Sepolia (Chain ID: 84532)');
  console.log('');

  // Check ETH balance
  const ethBalance = await provider.getBalance(wallet.address);
  console.log('ETH Balance:', ethers.formatEther(ethBalance), 'ETH');

  // Check USDC balance
  const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, wallet);
  const usdcBalance = await usdc.balanceOf(wallet.address);
  const decimals = await usdc.decimals();
  const symbol = await usdc.symbol();

  console.log(`${symbol} Balance:`, ethers.formatUnits(usdcBalance, decimals), symbol);
  console.log('USDC Contract:', USDC_ADDRESS);
  console.log('');

  // Check if we have enough balance
  if (ethBalance === 0n) {
    console.log('ERROR: No ETH for gas. Please fund the wallet first.');
    process.exit(1);
  }

  if (usdcBalance === 0n) {
    console.log('WARNING: No USDC balance. Will attempt ETH transfer instead.');

    // Do a small ETH transfer as proof of real transaction
    console.log('');
    console.log('Executing ETH transfer...');
    const txAmount = ethers.parseEther('0.0001'); // 0.0001 ETH

    const tx = await wallet.sendTransaction({
      to: TEST_RECIPIENT,
      value: txAmount,
    });

    console.log('Transaction Hash:', tx.hash);
    console.log('Waiting for confirmation...');

    const receipt = await tx.wait();
    console.log('');
    console.log('='.repeat(60));
    console.log('TRANSACTION CONFIRMED!');
    console.log('='.repeat(60));
    console.log('Block Number:', receipt.blockNumber);
    console.log('Gas Used:', receipt.gasUsed.toString());
    console.log('');
    console.log('Explorer Link:');
    console.log(`https://sepolia.basescan.org/tx/${tx.hash}`);
    console.log('');

    return { txHash: tx.hash, type: 'ETH', amount: '0.0001' };
  }

  // Execute USDC transfer
  console.log('Executing USDC transfer...');
  const transferAmount = ethers.parseUnits('0.01', decimals); // 0.01 USDC

  const tx = await usdc.transfer(TEST_RECIPIENT, transferAmount);
  console.log('Transaction Hash:', tx.hash);
  console.log('Waiting for confirmation...');

  const receipt = await tx.wait();

  console.log('');
  console.log('='.repeat(60));
  console.log('TRANSACTION CONFIRMED!');
  console.log('='.repeat(60));
  console.log('Block Number:', receipt.blockNumber);
  console.log('Gas Used:', receipt.gasUsed.toString());
  console.log('');
  console.log('Explorer Link:');
  console.log(`https://sepolia.basescan.org/tx/${tx.hash}`);
  console.log('');

  return { txHash: tx.hash, type: 'USDC', amount: '0.01' };
}

main()
  .then((result) => {
    console.log('Test completed successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
