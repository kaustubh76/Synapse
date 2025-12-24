const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export interface CreateIntentParams {
  type: string
  category: string
  params: Record<string, unknown>
  maxBudget: number
  biddingDuration?: number
}

export async function createIntent(data: CreateIntentParams) {
  const response = await fetch(`${API_URL}/api/intents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return response.json()
}

export async function getIntent(intentId: string) {
  const response = await fetch(`${API_URL}/api/intents/${intentId}`)
  return response.json()
}

export async function getIntentBids(intentId: string) {
  const response = await fetch(`${API_URL}/api/intents/${intentId}/bids`)
  return response.json()
}

export async function getOpenIntents() {
  const response = await fetch(`${API_URL}/api/intents?status=open`)
  return response.json()
}

export async function closeBidding(intentId: string) {
  const response = await fetch(`${API_URL}/api/intents/${intentId}/close-bidding`, {
    method: 'POST',
  })
  return response.json()
}

export async function getProviders() {
  const response = await fetch(`${API_URL}/api/providers`)
  return response.json()
}

export async function getProviderStats() {
  const response = await fetch(`${API_URL}/api/providers/stats/overview`)
  return response.json()
}

export async function simulatePayment(intentId: string, providerAddress: string) {
  const response = await fetch(`${API_URL}/api/payments/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intentId, providerAddress }),
  })
  return response.json()
}

export async function getRecentIntents(limit: number = 10) {
  const response = await fetch(`${API_URL}/api/intents?limit=${limit}`)
  return response.json()
}

export async function getNetworkStats() {
  const response = await fetch(`${API_URL}/api/network/stats`)
  return response.json()
}

export async function getRecentActivity(limit: number = 20) {
  const response = await fetch(`${API_URL}/api/intents?limit=${limit}`)
  return response.json()
}
