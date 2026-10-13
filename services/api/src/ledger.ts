import { Decimal } from 'decimal.js';
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
import { HttpError } from './errors.js';
export interface LedgerEntry {
  id: string; assetId: string | null; type: string; quantity: string | null; price: string | null;
  amount: string | null; fees: string; reversesTransactionId: string | null;
}
export interface Position { quantity: Decimal; costTotal: Decimal }
/** Trades track externally funded positions. Cash movements are explicit ledger entries. */
export function replayLedger(entries: LedgerEntry[]): { positions: Map<string, Position>; cash: Decimal } {
  const reversed = new Set(entries.filter(t => t.type === 'REVERSAL').map(t => t.reversesTransactionId));
  const positions = new Map<string, Position>(); let cash = new Decimal(0);
  for (const entry of entries) {
    if (entry.type === 'REVERSAL' || reversed.has(entry.id)) continue;
    if (entry.type === 'BUY' || entry.type === 'SELL') {
      if (!entry.assetId || !entry.quantity || !entry.price) throw new HttpError(409, 'LEDGER_INVALID', 'The transaction ledger is incomplete.');
      const quantity = new Decimal(entry.quantity), price = new Decimal(entry.price), fees = new Decimal(entry.fees);
      const existing = positions.get(entry.assetId) ?? { quantity: new Decimal(0), costTotal: new Decimal(0) };
      if (entry.type === 'BUY') {
        existing.costTotal = existing.costTotal.plus(quantity.mul(price)).plus(fees);
        existing.quantity = existing.quantity.plus(quantity);
      } else {
        if (quantity.gt(existing.quantity)) throw new HttpError(409, 'INSUFFICIENT_HOLDINGS', 'A sale exceeds the holding available at its transaction date.');
        const unitCost = existing.quantity.isZero() ? new Decimal(0) : existing.costTotal.div(existing.quantity);
        existing.costTotal = existing.costTotal.minus(unitCost.mul(quantity));
        existing.quantity = existing.quantity.minus(quantity);
        if (existing.quantity.isZero()) existing.costTotal = new Decimal(0);
      }
      if (existing.quantity.gt('1000000000') || existing.costTotal.gt('9999999999999999')) throw new HttpError(400, 'FINANCIAL_LIMIT', 'The resulting holding exceeds the supported demo limits.');
      positions.set(entry.assetId, existing);
    } else if (['DEPOSIT','DIVIDEND','WITHDRAWAL','FEE'].includes(entry.type)) {
      if (!entry.amount) throw new HttpError(409, 'LEDGER_INVALID', 'The cash transaction is incomplete.');
      const amount = new Decimal(entry.amount);
      cash = ['DEPOSIT','DIVIDEND'].includes(entry.type) ? cash.plus(amount) : cash.minus(amount);
      if (cash.isNegative()) throw new HttpError(409, 'INSUFFICIENT_CASH', 'A cash withdrawal or fee exceeds recorded cash at its transaction date.');
      if (cash.gt('9999999999999999')) throw new HttpError(400, 'FINANCIAL_LIMIT', 'The resulting cash balance exceeds the supported demo limits.');
    } else throw new HttpError(409, 'LEDGER_INVALID', 'The transaction type is not supported.');
  }
  return { positions, cash };
}
