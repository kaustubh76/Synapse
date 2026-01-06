#!/usr/bin/env node
/**
 * Fund a wallet with USDC and ETH from the Eigen wallet
 * Usage: node scripts/fund-wallet.mjs <recipient_address> [usdc_amount] [eth_amount]
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
dotenv.config({ path: join(__dirname, '..', '.env') });

const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Base Sepolia USDC
const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
const EIGEN_PRIVATE_KEY = process.env.EIGENCLOUD_PRIVATE_KEY;

if (!EIGEN_PRIVATE_KEY) {
  console.error('❌ EIGENCLOUD_PRIVATE_KEY not set in .env');
  process.exit(1);
}

async function main() {
  const recipient = process.argv[2];
  const usdcAmount = parseFloat(process.argv[3] || '0.01');
  const ethAmount = parseFloat(process.argv[4] || '0.01');

  if (!recipient) {
    console.log('Usage: node scripts/fund-wallet.mjs <recipient_address> [usdc_amount] [eth_amount]');
    console.log('');
    console.log('Example: node scripts/fund-wallet.mjs 0x1234...abcd 0.01 0.01');
    process.exit(1);
  }

  if (!ethers.isAddress(recipient)) {
    console.error('❌ Invalid recipient address:', recipient);
    process.exit(1);
  }

  console.log('🚀 Fund Wallet Script');
  console.log('=====================');
  console.log(`Recipient: ${recipient}`);
  console.log(`USDC Amount: ${usdcAmount}`);
  console.log(`ETH Amount: ${ethAmount}`);
  console.log('');

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(EIGEN_PRIVATE_KEY, provider);

  console.log(`Sender (Eigen Wallet): ${wallet.address}`);

  // Check sender balances
  const ethBalance = await provider.getBalance(wallet.address);
  console.log(`Sender ETH Balance: ${ethers.formatEther(ethBalance)} ETH`);

  const usdcAbi = [
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)',
  ];
  const usdc = new ethers.Contract(USDC_ADDRESS, usdcAbi, wallet);
  const usdcBalance = await usdc.balanceOf(wallet.address);
  console.log(`Sender USDC Balance: ${ethers.formatUnits(usdcBalance, 6)} USDC`);
  console.log('');

  // Transfer ETH
  if (ethAmount > 0) {
    const ethAmountWei = ethers.parseEther(ethAmount.toString());
    if (ethBalance < ethAmountWei + ethers.parseEther('0.001')) {
      console.error('❌ Insufficient ETH balance for transfer + gas');
    } else {
      console.log(`📤 Transferring ${ethAmount} ETH...`);
      try {
        const ethTx = await wallet.sendTransaction({
          to: recipient,
          value: ethAmountWei,
        });
        console.log(`   TX Hash: ${ethTx.hash}`);
        await ethTx.wait();
        console.log('   ✅ ETH transfer confirmed!');
      } catch (error) {
        console.error('   ❌ ETH transfer failed:', error.message);
      }
    }
  }

  // Transfer USDC
  if (usdcAmount > 0) {
    const usdcAmountUnits = ethers.parseUnits(usdcAmount.toString(), 6);
    if (usdcBalance < usdcAmountUnits) {
      console.error('❌ Insufficient USDC balance for transfer');
    } else {
      console.log(`📤 Transferring ${usdcAmount} USDC...`);
      try {
        const usdcTx = await usdc.transfer(recipient, usdcAmountUnits);
        console.log(`   TX Hash: ${usdcTx.hash}`);
        await usdcTx.wait();
        console.log('   ✅ USDC transfer confirmed!');
      } catch (error) {
        console.error('   ❌ USDC transfer failed:', error.message);
      }
    }
  }

  // Check recipient balances
  console.log('');
  console.log('📊 Recipient Balances After Transfer:');
  const recipientEth = await provider.getBalance(recipient);
  const recipientUsdc = await usdc.balanceOf(recipient);
  console.log(`   ETH: ${ethers.formatEther(recipientEth)} ETH`);
  console.log(`   USDC: ${ethers.formatUnits(recipientUsdc, 6)} USDC`);
}

main().catch(console.error);
