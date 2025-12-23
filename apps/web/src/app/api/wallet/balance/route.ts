import { NextRequest, NextResponse } from 'next/server'

const CROSSMINT_API_URL = 'https://staging.crossmint.com/api/v1-alpha2'
const CROSSMINT_API_KEY = process.env.CROSSMINT_API_KEY || ''

// Base Sepolia USDC contract address
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const walletId = searchParams.get('walletId')

  if (!walletId) {
    return NextResponse.json(
      { error: 'walletId is required' },
      { status: 400 }
    )
  }

  if (!CROSSMINT_API_KEY) {
    return NextResponse.json(
      { error: 'Crossmint API key not configured' },
      { status: 500 }
    )
  }

  try {
    const response = await fetch(
      `${CROSSMINT_API_URL}/wallets/${walletId}/balances`,
      {
        headers: {
          'X-API-KEY': CROSSMINT_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return NextResponse.json(
        { error: error.message || `Failed to fetch balance: ${response.status}` },
        { status: response.status }
      )
    }

    const balances = await response.json()

    // Format balances
    const formattedBalances = {
      native: {
        symbol: 'ETH',
        balance: '0',
        balanceFormatted: '0.0',
        usdValue: '0.00',
      },
      usdc: {
        symbol: 'USDC',
        balance: '0',
        balanceFormatted: '0.00',
        usdValue: '0.00',
        address: USDC_ADDRESS,
      },
    }

    if (Array.isArray(balances)) {
      balances.forEach((b: any) => {
        if (b.token === 'native' || b.symbol === 'ETH') {
          formattedBalances.native = {
            symbol: 'ETH',
            balance: b.balance || '0',
            balanceFormatted: b.balanceFormatted || (parseFloat(b.balance || '0') / 1e18).toFixed(4),
            usdValue: b.usdValue || '0.00',
          }
        }
        if (b.token?.toLowerCase() === USDC_ADDRESS.toLowerCase() || b.symbol === 'USDC') {
          formattedBalances.usdc = {
            symbol: 'USDC',
            balance: b.balance || '0',
            balanceFormatted: b.balanceFormatted || (parseFloat(b.balance || '0') / 1e6).toFixed(2),
            usdValue: b.usdValue || b.balanceFormatted || '0.00',
            address: USDC_ADDRESS,
          }
        }
      })
    }

    return NextResponse.json({
      success: true,
      balances: formattedBalances,
      raw: balances,
    })
  } catch (error) {
    console.error('[Balance API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch balance' },
      { status: 500 }
    )
  }
}
