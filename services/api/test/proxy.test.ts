import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const pool = {} as Pool;
test('forwarded proxy headers remain untrusted by default', () => {
  const app = createApp({ pool, config: loadConfig({NODE_ENV:'test'}) });
  assert.equal(app.get('trust proxy'), false);
  assert.equal(app.get('trust proxy fn')('127.0.0.1', 0), false);
});
test('deployment opt-in trusts only loopback peers and retains production Secure cookies', () => {
  const config = loadConfig({NODE_ENV:'production',TRUST_PROXY_LOOPBACK:'1'});
  const app = createApp({pool,config});
  const trust = app.get('trust proxy fn');
  assert.equal(app.get('trust proxy'),'loopback');
  assert.equal(trust('127.0.0.1',0),true);
  assert.equal(trust('::1',0),true);
  assert.equal(trust('203.0.113.1',0),false);
  assert.equal(trust('10.0.0.1',0),false);
  assert.equal(config.cookieSecure,true);
  assert.throws(()=>loadConfig({TRUST_PROXY_LOOPBACK:'true'}));
});
