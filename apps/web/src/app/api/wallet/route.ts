import { NextRequest, NextResponse } from 'next/server'

// Crossmint API configuration (Staging)
const CROSSMINT_API_URL = 'https://staging.crossmint.com/api/v1-alpha2'
const CROSSMINT_API_KEY = process.env.CROSSMINT_API_KEY || ''

interface CrossmintWalletResponse {
  id: string
  address: string
  type: string
  linkedUser?: string
  createdAt?: string
}

// GET - Get wallet info or list wallets
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const walletId = searchParams.get('walletId')
  const linkedUser = searchParams.get('linkedUser')

  if (!CROSSMINT_API_KEY) {
    return NextResponse.json(
      { error: 'Crossmint API key not configured' },
      { status: 500 }
    )
  }

  try {
    let endpoint = `${CROSSMINT_API_URL}/wallets`

    if (walletId) {
      endpoint = `${CROSSMINT_API_URL}/wallets/${walletId}`
    } else if (linkedUser) {
      endpoint = `${CROSSMINT_API_URL}/wallets?linkedUser=${encodeURIComponent(linkedUser)}`
    }

    const response = await fetch(endpoint, {
      headers: {
        'X-API-KEY': CROSSMINT_API_KEY,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return NextResponse.json(
        { error: error.message || `Crossmint API error: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('[Wallet API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch wallet' },
      { status: 500 }
    )
  }
}

// POST - Create a new wallet
export async function POST(request: NextRequest) {
  if (!CROSSMINT_API_KEY) {
    return NextResponse.json(
      { error: 'Crossmint API key not configured' },
      { status: 500 }
    )
  }

  try {
    const body = await request.json()
    const { linkedUser, chain = 'base-sepolia' } = body

    if (!linkedUser) {
      return NextResponse.json(
        { error: 'linkedUser is required' },
        { status: 400 }
      )
    }

    // First check if wallet already exists
    const existingResponse = await fetch(
      `${CROSSMINT_API_URL}/wallets?linkedUser=${encodeURIComponent(linkedUser)}`,
      {
        headers: {
          'X-API-KEY': CROSSMINT_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    )

    if (existingResponse.ok) {
      const existingData = await existingResponse.json()
      if (existingData.length > 0 || existingData.items?.length > 0) {
        const wallet = existingData[0] || existingData.items[0]
        return NextResponse.json({
          success: true,
          wallet,
          existing: true
        })
      }
    }

    // Create new MPC wallet (doesn't require adminSigner)
    const response = await fetch(`${CROSSMINT_API_URL}/wallets`, {
      method: 'POST',
      headers: {
        'X-API-KEY': CROSSMINT_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'evm-mpc-wallet',
        linkedUser: `email:${linkedUser}@synapse.ai`,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      console.error('[Wallet API] Crossmint error:', error)
      return NextResponse.json(
        { error: error.message || `Failed to create wallet: ${response.status}` },
        { status: response.status }
      )
    }

    const wallet: CrossmintWalletResponse = await response.json()

    return NextResponse.json({
      success: true,
      wallet: {
        id: wallet.id,
        address: wallet.address,
        type: wallet.type,
        linkedUser,
        chain,
        createdAt: wallet.createdAt || new Date().toISOString(),
      },
      existing: false
    })
  } catch (error) {
    console.error('[Wallet API] Error creating wallet:', error)
    return NextResponse.json(
      { error: 'Failed to create wallet' },
      { status: 500 }
    )
  }
}
