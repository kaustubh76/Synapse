import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'

// Configuration from environment
const EIGENCLOUD_WALLET_ADDRESS = process.env.EIGENCLOUD_WALLET_ADDRESS || ''
const EIGENCLOUD_PRIVATE_KEY = process.env.EIGENCLOUD_PRIVATE_KEY || ''
const NETWORK = process.env.NEXT_PUBLIC_NETWORK || 'base-sepolia'
const RPC_URL = process.env.BASE_RPC_URL || 'https://sepolia.base.org'

// USDC contract addresses by network
const USDC_ADDRESSES: Record<string, string> = {
  'base-sepolia': process.env.USDC_ADDRESS_BASE_SEPOLIA || '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  'base': process.env.USDC_ADDRESS_BASE || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
}
const USDC_ADDRESS = USDC_ADDRESSES[NETWORK] || USDC_ADDRESSES['base-sepolia']
const USDC_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]

// Tool pricing
const TOOL_PRICING: Record<string, number> = {
  'tool_deep_research': 0.05,
  'tool_code_analysis': 0.02,
  'tool_data_extraction': 0.01,
  'tool_sentiment_analysis': 0.005,
  'tool_summarization': 0.01,
}

// POST - Execute payment for tool usage (demo: sends from EigenCloud wallet)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { toolId, action, recipientAddress } = body

    if (!toolId) {
      return NextResponse.json(
        { error: 'toolId is required' },
        { status: 400 }
      )
    }

    const price = TOOL_PRICING[toolId]
    if (price === undefined) {
      return NextResponse.json(
        { error: `Unknown tool: ${toolId}` },
        { status: 400 }
      )
    }

    // Initialize provider and wallet
    const provider = new ethers.JsonRpcProvider(RPC_URL)
    const wallet = new ethers.Wallet(EIGENCLOUD_PRIVATE_KEY, provider)
    const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, wallet)

    // Get current balance
    const balance = await usdc.balanceOf(wallet.address)
    const decimals = await usdc.decimals()
    const balanceFormatted = ethers.formatUnits(balance, decimals)

    // For demo purposes, we'll simulate a "payment received" scenario
    // In production, this would verify an incoming payment from the user
    if (action === 'verify-payment') {
      // Simulate payment verification
      const paymentId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

      return NextResponse.json({
        success: true,
        payment: {
          id: paymentId,
          status: 'verified',
          amount: price.toString(),
          currency: 'USDC',
          toolId,
          recipient: EIGENCLOUD_WALLET_ADDRESS,
          timestamp: new Date().toISOString(),
        },
        x402: {
          protocol: 'x402',
          version: '1.0',
          network: 'base-sepolia',
          chainId: 84532,
        }
      })
    }

    // Execute a real demo transaction (small amount back to demonstrate)
    if (action === 'demo-transaction') {
      const recipient = recipientAddress || EIGENCLOUD_WALLET_ADDRESS
      const amount = ethers.parseUnits('0.001', decimals) // Tiny amount for demo

      // Check if we have enough balance
      if (balance < amount) {
        return NextResponse.json({
          success: false,
          error: 'Insufficient USDC balance for demo transaction',
          balance: balanceFormatted,
        }, { status: 400 })
      }

      // Execute real transaction
      const tx = await usdc.transfer(recipient, amount)
      const receipt = await tx.wait()

      return NextResponse.json({
        success: true,
        transaction: {
          hash: tx.hash,
          blockNumber: receipt?.blockNumber,
          gasUsed: receipt?.gasUsed.toString(),
          status: receipt?.status === 1 ? 'confirmed' : 'failed',
          from: wallet.address,
          to: recipient,
          amount: '0.001',
          currency: 'USDC',
        },
        explorer: `https://sepolia.basescan.org/tx/${tx.hash}`,
      })
    }

    // Default: return payment requirements (x402 style)
    const nonce = ethers.hexlify(ethers.randomBytes(32))
    const expiry = Math.floor(Date.now() / 1000) + 300 // 5 minutes

    return NextResponse.json({
      success: true,
      paymentRequired: {
        protocol: 'x402',
        version: '1.0',
        amount: price.toString(),
        currency: 'USDC',
        currencyAddress: USDC_ADDRESS,
        recipient: EIGENCLOUD_WALLET_ADDRESS,
        network: 'base-sepolia',
        chainId: 84532,
        nonce,
        expiry,
        toolId,
        description: `Payment for ${toolId} execution`,
      },
      provider: {
        name: 'Synapse AI / EigenCloud',
        wallet: EIGENCLOUD_WALLET_ADDRESS,
        balance: balanceFormatted,
        verified: true,
      },
      instructions: {
        step1: 'Sign the payment message with your wallet',
        step2: 'Include X-Payment header in your tool execution request',
        step3: 'Execute the tool - payment will be settled automatically',
      }
    })
  } catch (error) {
    console.error('[Tool Pay API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Payment processing failed' },
      { status: 500 }
    )
  }
}

// GET - Get payment status or history
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const paymentId = searchParams.get('paymentId')

  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider)

  // Get EigenCloud wallet balance
  const balance = await usdc.balanceOf(EIGENCLOUD_WALLET_ADDRESS)
  const ethBalance = await provider.getBalance(EIGENCLOUD_WALLET_ADDRESS)

  return NextResponse.json({
    success: true,
    wallet: {
      address: EIGENCLOUD_WALLET_ADDRESS,
      balances: {
        usdc: ethers.formatUnits(balance, 6),
        eth: ethers.formatEther(ethBalance),
      }
    },
    pricing: TOOL_PRICING,
    network: {
      name: 'Base Sepolia',
      chainId: 84532,
      usdcAddress: USDC_ADDRESS,
    }
  })
}
