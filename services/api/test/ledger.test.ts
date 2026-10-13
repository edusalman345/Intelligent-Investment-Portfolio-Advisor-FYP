import test from 'node:test';
import assert from 'node:assert/strict';
import { replayLedger, type LedgerEntry } from '../src/ledger.js';
const entry = (data: Partial<LedgerEntry>): LedgerEntry => ({ id:'a',assetId:'asset',type:'BUY',quantity:'1',price:'0.1',fees:'0',amount:null,reversesTransactionId:null,...data });
test('decimal replay preserves exact fractional cost and weighted cost after partial sale',()=>{
  const result = replayLedger([entry({id:'1',quantity:'2',price:'10',fees:'1'}),entry({id:'2',quantity:'2',price:'20'}),entry({id:'3',type:'SELL',quantity:'1',price:'30'})]);
  assert.equal(result.positions.get('asset')?.quantity.toString(),'3'); assert.equal(result.positions.get('asset')?.costTotal.toString(),'45.75');
  assert.equal(replayLedger([entry({id:'1'}),entry({id:'2'})]).positions.get('asset')?.costTotal.toString(),'0.2');
});
test('oversells and reversals that invalidate subsequent sales are rejected',()=>{
  assert.throws(()=>replayLedger([entry({type:'SELL'})]),/exceeds/);
  assert.throws(()=>replayLedger([entry({id:'buy'}),entry({id:'sell',type:'SELL'}),entry({id:'reverse',type:'REVERSAL',reversesTransactionId:'buy'})]),/exceeds/);
});
test('complete liquidation clears cost; explicit cash is validated separately',()=>{
  const result=replayLedger([entry({id:'1'}),entry({id:'2',type:'SELL'}),entry({id:'3',type:'DEPOSIT',assetId:null,amount:'10'}),entry({id:'4',type:'FEE',assetId:null,amount:'0.25'})]);
  assert.equal(result.positions.get('asset')?.costTotal.toString(),'0'); assert.equal(result.cash.toString(),'9.75');
  assert.throws(()=>replayLedger([entry({type:'WITHDRAWAL',amount:'1'})]),/exceeds recorded cash/);
});
