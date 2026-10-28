export interface ApiEnvelope<T> { data: T; meta?: { requestId: string; asOf?: string } }
export interface AuthUser { id: string; email: string; displayName: string | null; timezone: string | null; role: 'INVESTOR' | 'ADMIN'; status: string; hasPassword: boolean; googleLinked: boolean }
export interface Session { user: AuthUser | null; csrfToken: string | null; googleConfigured: boolean }
export interface Asset { id: string; symbol: string; name: string; assetType: string; exchange: string | null; currency: string; sector: string | null }
export interface Quote { assetId: string; price: string; currency: string; volume: string | null; asOf: string; ingestedAt: string; source: string; isDemo: boolean; isStale: boolean }
export interface PriceBar { time: string; open: string; high: string; low: string; close: string; volume: string | null; source: string; isDemo: boolean }
export interface Portfolio { id: string; name: string; description: string | null; baseCurrency: string; status: 'ACTIVE' | 'ARCHIVED'; createdAt: string; updatedAt: string }
export interface Holding { assetId: string; symbol: string; name: string; quantity: string; averageCost: string; costCurrency: string }
export type TransactionType = 'BUY' | 'SELL' | 'DIVIDEND' | 'FEE' | 'DEPOSIT' | 'WITHDRAWAL' | 'REVERSAL';
export interface Transaction { id: string; assetId: string | null; symbol: string | null; type: TransactionType; quantity: string | null; price: string | null; amount: string | null; currency: string; fees: string; occurredAt: string; notes: string | null; reversed: boolean; reversesTransactionId: string | null }
export interface ValuationPosition { assetId: string; symbol: string; quantity: string; price: string | null; marketValue: string | null; source: string | null; asOf: string | null; isStale: boolean; isDemo: boolean }
export interface Valuation { asOf: string; baseCurrency: string; totalMarketValue: string; cashValue: string; totalValue: string; unpricedPositionCount: number; stalePositionCount: number; isDemo: boolean; positions: ValuationPosition[] }
export interface Watchlist { id: string; name: string; createdAt: string; items: { assetId: string; symbol: string; name: string; createdAt: string }[] }
export interface IngestionRun { id: string; status: string; source: string; recordsReceived: number; recordsWritten: number; issueCount: number; startedAt: string; finishedAt: string | null }
export interface SubscriptionPlan { id: string; code: string; name: string; description: string; priceMonthly: string | null; currency: 'USD'; status: 'active' | 'coming_soon'; displayOrder: number }
