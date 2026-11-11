import process from 'node:process';
import console from 'node:console';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { z } from 'zod';
import { ALPHA_VANTAGE_SOURCE, quoteSchema, barSchema } from '../../services/api/dist/market-provider.js';

const symbols = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AVGO'];
const notice = 'Recorded real end-of-day data; import is not a fresh provider fetch.';
const time = z.string().datetime({ offset: true }).refine(value => Date.parse(value) <= Date.now());
const asset = z.object({ id: z.string().uuid(), symbol: z.enum(symbols), name: z.string().trim().min(1).max(255).regex(/^[^<>]+$/), exchange: z.enum(['NASDAQ', 'US']), currency: z.literal('USD'), assetType: z.literal('STOCK') }).strict();
const entry = z.object({ asset, fetchedAt: time, recordedAt: time, quotes: z.array(quoteSchema).length(1), bars: z.array(barSchema).length(100) }).strict();
const archive = z.object({ format: z.literal('iipa-public-market-archive-v1'), source: z.literal(ALPHA_VANTAGE_SOURCE), isDemo: z.literal(false), notice: z.literal(notice), exportedAt: time, assets: z.array(entry).length(5) }).strict();

export function validateArchive(input) {
  const parsed = archive.parse(input);
  if (new Set(parsed.assets.map(value => value.asset.symbol)).size !== 5) throw new Error('Invalid symbol set');
  for (const value of parsed.assets) {
    if (Date.parse(value.fetchedAt) > Date.parse(value.recordedAt) || new Set(value.bars.map(bar => bar.time)).size !== 100) throw new Error('Invalid recording');
    value.bars.sort((left, right) => left.time.localeCompare(right.time));
  }
  return parsed;
}

export async function readArchive(filename) {
  if ((await stat(filename)).size > 2_000_000) throw new Error('Archive too large');
  return validateArchive(JSON.parse(await readFile(filename, 'utf8')));
}

async function main() {
  try {
    if (process.argv.length !== 3) throw new Error('Output filename required');
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const seeds = [
      ['AAPL', 'Apple Inc.', '10000000-0000-4000-8000-000000000001'],
      ['MSFT', 'Microsoft Corporation', '10000000-0000-4000-8000-000000000002'],
      ['NVDA', 'NVIDIA Corporation', '10000000-0000-4000-8000-000000000003'],
    ];
    const assets = [];
    for (const symbol of symbols) {
      const file = resolve(root, '.tmp/real-market', `${symbol}.json`);
      if ((await stat(file)).size > 400_000) throw new Error('Recording too large');
      const saved = JSON.parse(await readFile(file, 'utf8'));
      if (saved.evidence?.symbol !== symbol || saved.evidence?.provider !== ALPHA_VANTAGE_SOURCE || saved.evidence?.isDemo !== false || saved.evidence?.status !== 'COMPLETED' || saved.evidence?.frequency !== 'end-of-day' || saved.evidence?.adjusted !== false) throw new Error('Validated real recording required');
      const seed = seeds.find(value => value[0] === symbol);
      const metadata = saved.asset ?? { id: seed?.[2], symbol, name: seed?.[1], exchange: 'NASDAQ', currency: 'USD', assetType: 'STOCK' };
      assets.push({ asset: { id: metadata.id, symbol: metadata.symbol, name: metadata.name, exchange: metadata.exchange, currency: metadata.currency, assetType: metadata.assetType }, fetchedAt: saved.evidence.fetchedAt, recordedAt: saved.evidence.completedAt, quotes: saved.batch.quotes, bars: saved.batch.bars });
    }
    const result = validateArchive({ format: 'iipa-public-market-archive-v1', source: ALPHA_VANTAGE_SOURCE, isDemo: false, notice, exportedAt: new Date().toISOString(), assets });
    const output = resolve(process.argv[2]);
    if (!output.startsWith(resolve(root, '.tmp') + sep) || !output.endsWith('.json')) throw new Error('Output must be an ignored JSON artifact under .tmp');
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
    console.log('PASS: exported five public real-market assets, five quotes and 500 daily bars. No account data, credentials or provider calls.');
  } catch { console.error('Market archive export failed; no private values were printed. Build the API and supply validated local recordings.'); process.exitCode = 1; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
