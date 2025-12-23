import { NextRequest, NextResponse } from 'next/server'

const CROSSMINT_API_URL = 'https://staging.crossmint.com/api/v1-alpha2'
const CROSSMINT_API_KEY = process.env.CROSSMINT_API_KEY || ''

// Base Sepolia USDC contract address
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'

export async function POST(request: NextRequest) {
  if (!CROSSMINT_API_KEY) {
    return NextResponse.json(
      { error: 'Crossmint API key not configured' },
      { status: 500 }
    )
  }

  try {
    const body = await request.json()
    const { walletId, to, amount, token = 'USDC' } = body

    if (!walletId || !to || !amount) {
      return NextResponse.json(
        { error: 'walletId, to, and amount are required' },
        { status: 400 }
      )
    }

    // Validate Ethereum address
    if (!/^0x[a-fA-F0-9]{40}$/.test(to)) {
      return NextResponse.json(
        { error: 'Invalid recipient address' },
        { status: 400 }
      )
    }

    let txBody: any = {}

    if (token === 'USDC' || token === USDC_ADDRESS) {
      // ERC20 transfer
      txBody = {
        type: 'erc20_transfer',
        to,
        token: USDC_ADDRESS,
        amount: amount.toString(),
      }
    } else if (token === 'ETH' || token === 'native') {
      // Native ETH transfer
      txBody = {
        type: 'transfer',
        to,
        value: amount.toString(),
      }
    } else {
      return NextResponse.json(
        { error: 'Unsupported token. Use USDC or ETH' },
        { status: 400 }
      )
    }

    const response = await fetch(
      `${CROSSMINT_API_URL}/wallets/${walletId}/transactions`,
      {
        method: 'POST',
        headers: {
          'X-API-KEY': CROSSMINT_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(txBody),
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      console.error('[Transfer API] Crossmint error:', error)
      return NextResponse.json(
        { error: error.message || `Transfer failed: ${response.status}` },
        { status: response.status }
      )
    }

    const tx = await response.json()

    return NextResponse.json({
      success: true,
      transaction: {
        id: tx.id || tx.txId,
        txHash: tx.txHash || tx.transactionHash,
        status: tx.status || 'pending',
        chain: 'base-sepolia',
        to,
        amount,
        token,
      },
    })
  } catch (error) {
    console.error('[Transfer API] Error:', error)
    return NextResponse.json(
      { error: 'Transfer failed' },
      { status: 500 }
    )
  }
}
