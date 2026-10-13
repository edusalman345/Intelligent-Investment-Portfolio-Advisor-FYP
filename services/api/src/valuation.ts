import type { Pool, PoolClient } from 'pg';
import { Decimal } from 'decimal.js';
import type { Valuation, ValuationPosition } from '@ifms/contracts';
import { replayLedger, type LedgerEntry } from './ledger.js';
import { HttpError } from './errors.js';
type DB = Pick<Pool | PoolClient, 'query'>;
export async function ledgerEntries(db: DB, portfolioId: string, cutoff: Date = new Date()): Promise<LedgerEntry[]> {
  const result = await db.query<LedgerEntry>(`SELECT id, asset_id AS "assetId", transaction_type AS type, quantity::text, price::text, amount::text,
    fees::text, reverses_transaction_id AS "reversesTransactionId" FROM transactions WHERE portfolio_id=$1 AND occurred_at<=$2 ORDER BY occurred_at,created_at,id`, [portfolioId,cutoff]);
  return result.rows;
}
export async function valuePortfolio(db: DB, portfolioId: string, quoteMaxAgeHours: number, cutoff: Date = new Date()): Promise<Valuation> {
  const { positions, cash } = replayLedger(await ledgerEntries(db,portfolioId,cutoff));
  const ids = [...positions].filter(([,p]) => !p.quantity.isZero()).map(([id]) => id);
  const result = ids.length ? await db.query(`SELECT a.id,a.symbol,a.currency,q.currency AS quote_currency,q.price::text,q.as_of,q.volume::text,
    s.name AS source,COALESCE((s.config->>'isDemo')::boolean,false) AS is_demo
    FROM assets a LEFT JOIN LATERAL (SELECT * FROM market_quotes WHERE asset_id=a.id AND is_valid=true AND as_of<=$2 ORDER BY as_of DESC,ingested_at DESC LIMIT 1) q ON true
    LEFT JOIN data_sources s ON s.id=q.source_id WHERE a.id=ANY($1::uuid[])`,[ids,cutoff]) : { rows: [] };
  const records = new Map(result.rows.map(r => [r.id as string,r]));
  let total = new Decimal(0), unpriced = 0, stale = 0;
  const lines: ValuationPosition[] = [];
  for (const id of ids) {
    const p = positions.get(id)!; const record = records.get(id);
    const priced = record?.price != null && record.currency === 'USD' && record.quote_currency === 'USD';
    const asOf = priced ? new Date(record.as_of).toISOString() : null;
    const isStale = priced && cutoff.getTime() - new Date(record.as_of).getTime() > quoteMaxAgeHours * 3600000;
    const marketValue = priced ? p.quantity.mul(record.price as string) : null;
    if (marketValue) total = total.plus(marketValue); else unpriced++;
    if (isStale) stale++;
    lines.push({ assetId: id, symbol: record?.symbol ?? 'Unsupported asset', quantity: p.quantity.toFixed(8), price: priced ? record.price : null,
      marketValue: marketValue?.toFixed(8) ?? null, source: record?.source ?? null, asOf, isStale: Boolean(isStale), isDemo: Boolean(record?.is_demo) });
  }
  if (total.plus(cash).gt('9999999999999999')) throw new HttpError(400,'FINANCIAL_LIMIT','Portfolio value exceeds the supported demo limits.');
  return { asOf: cutoff.toISOString(), baseCurrency:'USD',totalMarketValue:total.toFixed(8),cashValue:cash.toFixed(8),totalValue:total.plus(cash).toFixed(8),
    unpricedPositionCount:unpriced,stalePositionCount:stale,isDemo:lines.some(p=>p.isDemo),positions:lines };
}
export async function saveValuation(db: DB, portfolioId: string, quoteMaxAgeHours: number) {
  const value = await valuePortfolio(db,portfolioId,quoteMaxAgeHours);
  await db.query(`INSERT INTO portfolio_valuation_snapshots(portfolio_id,as_of,total_market_value,cash_value,unpriced_position_count,base_currency,details)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(portfolio_id,as_of) DO UPDATE SET total_market_value=EXCLUDED.total_market_value,
    cash_value=EXCLUDED.cash_value,unpriced_position_count=EXCLUDED.unpriced_position_count,details=EXCLUDED.details`,
    [portfolioId,value.asOf,value.totalMarketValue,value.cashValue,value.unpricedPositionCount,value.baseCurrency,JSON.stringify(value)]);
  return value;
}
