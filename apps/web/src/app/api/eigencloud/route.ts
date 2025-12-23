import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'

// EigenCloud wallet configuration from environment
const EIGENCLOUD_WALLET_ADDRESS = process.env.EIGENCLOUD_WALLET_ADDRESS || ''
const EIGENCLOUD_PRIVATE_KEY = process.env.EIGENCLOUD_PRIVATE_KEY || ''
const RPC_URL = 'https://sepolia.base.org'
const CHAIN_ID = 84532

// Base Sepolia USDC contract
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const USDC_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function approve(address spender, uint256 amount) returns (bool)'
]

// GET - Get EigenCloud wallet status and balances
export async function GET(request: NextRequest) {
  if (!EIGENCLOUD_WALLET_ADDRESS || !EIGENCLOUD_PRIVATE_KEY) {
    return NextResponse.json(
      { error: 'EigenCloud wallet not configured' },
      { status: 500 }
    )
  }

  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL)
    const wallet = new ethers.Wallet(EIGENCLOUD_PRIVATE_KEY, provider)

    // Verify wallet address matches
    if (wallet.address.toLowerCase() !== EIGENCLOUD_WALLET_ADDRESS.toLowerCase()) {
      return NextResponse.json(
        { error: 'Wallet address mismatch' },
        { status: 500 }
      )
    }

    // Get ETH balance
    const ethBalance = await provider.getBalance(wallet.address)
    const ethFormatted = ethers.formatEther(ethBalance)

    // Get USDC balance
    const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider)
    const usdcBalance = await usdc.balanceOf(wallet.address)
    const decimals = await usdc.decimals()
    const usdcFormatted = ethers.formatUnits(usdcBalance, decimals)

    // Get network info
    const network = await provider.getNetwork()
    const blockNumber = await provider.getBlockNumber()

    return NextResponse.json({
      success: true,
      wallet: {
        address: wallet.address,
        network: 'base-sepolia',
        chainId: Number(network.chainId),
      },
      balances: {
        eth: {
          raw: ethBalance.toString(),
          formatted: ethFormatted,
          symbol: 'ETH'
        },
        usdc: {
          raw: usdcBalance.toString(),
          formatted: usdcFormatted,
          symbol: 'USDC',
          address: USDC_ADDRESS
        }
      },
      network: {
        name: 'Base Sepolia',
        chainId: Number(network.chainId),
        blockNumber,
        rpcUrl: RPC_URL
      },
      status: {
        configured: true,
        hasEth: ethBalance > 0n,
        hasUsdc: usdcBalance > 0n,
        ready: ethBalance > 0n // Need ETH for gas
      }
    })
  } catch (error) {
    console.error('[EigenCloud API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch wallet status' },
      { status: 500 }
    )
  }
}

// POST - Execute transaction with EigenCloud wallet
export async function POST(request: NextRequest) {
  if (!EIGENCLOUD_WALLET_ADDRESS || !EIGENCLOUD_PRIVATE_KEY) {
    return NextResponse.json(
      { error: 'EigenCloud wallet not configured' },
      { status: 500 }
    )
  }

  try {
    const body = await request.json()
    const { action, to, amount, token = 'USDC' } = body

    if (!action) {
      return NextResponse.json(
        { error: 'action is required (transfer, approve)' },
        { status: 400 }
      )
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL)
    const wallet = new ethers.Wallet(EIGENCLOUD_PRIVATE_KEY, provider)

    let tx: ethers.TransactionResponse
    let result: any = {}

    switch (action) {
      case 'transfer':
        if (!to || !amount) {
          return NextResponse.json(
            { error: 'to and amount are required for transfer' },
            { status: 400 }
          )
        }

        // Validate address
        if (!ethers.isAddress(to)) {
          return NextResponse.json(
            { error: 'Invalid recipient address' },
            { status: 400 }
          )
        }

        if (token === 'ETH' || token === 'native') {
          // ETH transfer
          tx = await wallet.sendTransaction({
            to,
            value: ethers.parseEther(amount.toString())
          })
        } else {
          // USDC transfer
          const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, wallet)
          const decimals = await usdc.decimals()
          tx = await usdc.transfer(to, ethers.parseUnits(amount.toString(), decimals))
        }

        const receipt = await tx.wait()

        result = {
          action: 'transfer',
          txHash: tx.hash,
          blockNumber: receipt?.blockNumber,
          gasUsed: receipt?.gasUsed.toString(),
          status: receipt?.status === 1 ? 'success' : 'failed',
          explorerUrl: `https://sepolia.basescan.org/tx/${tx.hash}`
        }
        break

      case 'approve':
        if (!to || !amount) {
          return NextResponse.json(
            { error: 'spender (to) and amount are required for approve' },
            { status: 400 }
          )
        }

        const usdcForApproval = new ethers.Contract(USDC_ADDRESS, USDC_ABI, wallet)
        const dec = await usdcForApproval.decimals()
        tx = await usdcForApproval.approve(to, ethers.parseUnits(amount.toString(), dec))

        const approveReceipt = await tx.wait()

        result = {
          action: 'approve',
          txHash: tx.hash,
          blockNumber: approveReceipt?.blockNumber,
          spender: to,
          amount,
          explorerUrl: `https://sepolia.basescan.org/tx/${tx.hash}`
        }
        break

      case 'status':
        // Just return wallet status (same as GET)
        const ethBal = await provider.getBalance(wallet.address)
        const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider)
        const usdcBal = await usdcContract.balanceOf(wallet.address)

        result = {
          action: 'status',
          address: wallet.address,
          ethBalance: ethers.formatEther(ethBal),
          usdcBalance: ethers.formatUnits(usdcBal, 6)
        }
        break

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: transfer, approve, status' },
          { status: 400 }
        )
    }

    return NextResponse.json({
      success: true,
      ...result
    })
  } catch (error) {
    console.error('[EigenCloud API] Transaction error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Transaction failed' },
      { status: 500 }
    )
  }
}
