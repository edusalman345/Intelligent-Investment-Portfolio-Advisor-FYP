import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import test from 'node:test';

async function exercise(brokenSession = false) {
  const methods = [];
  const server = createServer((request, response) => {
    methods.push(request.method);
    if (request.url === '/' || request.url === '/subscription' || (brokenSession && request.url === '/api/v1/auth/session')) {
      response.setHeader('Content-Type', 'text/html');
      response.end('<title>IIPA - Intelligent Investment Portfolio Advisor</title>provider-secret-sentinel');
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/health') response.end(JSON.stringify({ data: { status: 'ok' } }));
    else if (request.url === '/ready') response.end(JSON.stringify({ data: { status: 'ready' } }));
    else if (request.url === '/api/v1/auth/session') response.end(JSON.stringify({ data: { user: null, csrfToken: null } }));
    else { response.statusCode = 401; response.end(JSON.stringify({ error: { code: 'AUTH_REQUIRED' } })); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const child = spawn(process.execPath, [fileURLToPath(new URL('../smoke.mjs', import.meta.url)), '--local-http'],
      { env: { ...process.env, PUBLIC_ORIGIN: origin }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', value => { output += value; });
    child.stderr.on('data', value => { output += value; });
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    return { code, output, methods };
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test('default smoke validates routing/readiness/catalog without writes or claiming Google acceptance', async () => {
  const result = await exercise();
  assert.equal(result.code, 0);
  assert.ok(result.methods.every(method => method === 'GET'));
  assert.match(result.output, /PASS same_origin_session_json_and_protected_catalog/);
  assert.match(result.output, /UNVERIFIED real Google OAuth/);
  assert.equal(result.output.includes('provider-secret-sentinel'), false);
});

test('SPA HTML returned by API fails safely without exposing response content', async () => {
  const result = await exercise(true);
  assert.equal(result.code, 1);
  assert.match(result.output, /FAIL SESSION_ROUTING EXPECTED_JSON_NOT_SPA_HTML/);
  assert.equal(result.output.includes('provider-secret-sentinel'), false);
});
