import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { assertDifferentDatabases, assertDisposableConnection, disposableDatabaseName } from '../src/db/test-safety.js';
test('disposable database guards reject URL and host aliases for the same name',()=> {
  assert.equal(disposableDatabaseName('postgres://test@127.0.0.1/demo_test'),'demo_test');
  assert.throws(()=>assertDifferentDatabases('postgres://test@127.0.0.1/demo_test','postgresql://other@localhost:5432/demo_test'));
  assert.doesNotThrow(()=>assertDifferentDatabases('postgres://test@127.0.0.1/one_test','postgresql://test@localhost/two_test'));
  assert.throws(()=>disposableDatabaseName('postgresql://test@localhost/development'));
});
test('malformed database URLs never attach the supplied credential sentinel to errors',()=> {
  try { disposableDatabaseName('postgresql://user:credential-sentinel@localhost:invalid/db_test');assert.fail('Expected invalid configuration'); }
  catch(error) {assert.ok(error instanceof Error);assert.equal(error.message.includes('credential-sentinel'),false);assert.equal('input' in error,false);assert.equal('cause' in error,false);}
});
test('reset guards verify the actual connected database before permitting destructive work',async()=> {
  const pool={query:async()=>({rows:[{name:'unexpected_test'}]})} as unknown as Pool;
  await assert.rejects(assertDisposableConnection(pool,'expected_test'));
  await assert.doesNotReject(assertDisposableConnection(pool,'unexpected_test'));
  await assert.rejects(assertDisposableConnection(pool,'development'));
});
