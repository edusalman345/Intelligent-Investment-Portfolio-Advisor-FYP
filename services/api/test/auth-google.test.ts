import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OAuth2Client } from 'google-auth-library';
import { loadConfig } from '../src/config.js';
import { createGoogleProvider } from '../src/google.js';

test('Google authorization requests request only identity scopes and bind PKCE, nonce and state', () => {
  const config = loadConfig({ GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-placeholder', GOOGLE_CALLBACK_URL: 'http://localhost:3001/api/v1/auth/google/callback' });
  const provider = createGoogleProvider(config);
  const url = new URL(provider.authorizationUrl({ state: 'state-value', nonce: 'nonce-value', codeChallenge: 'challenge-value' }));
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('scope'), 'openid email profile');
  assert.equal(url.searchParams.get('state'), 'state-value'); assert.equal(url.searchParams.get('nonce'), 'nonce-value');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256'); assert.equal(url.searchParams.get('code_challenge'), 'challenge-value');
  assert.equal(url.searchParams.get('redirect_uri'), config.googleCallbackUrl);
  assert.equal(url.searchParams.get('response_type'), 'code');
});

test('Google adapter delegates token verification to Google library and separately requires verified email and nonce', async context => {
  const config = loadConfig({ GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-placeholder' });
  let payload = { sub: 'google-stable-subject', email: 'investor@example.test', email_verified: true, name: 'Investor', nonce: 'nonce-value' };
  let exchange: Record<string, unknown> | undefined; let verification: Record<string, unknown> | undefined;
  context.mock.method(OAuth2Client.prototype, 'getToken', async (input: Record<string, unknown>) => { exchange = input; return { tokens: { id_token: 'test-id-token' } }; });
  context.mock.method(OAuth2Client.prototype, 'verifyIdToken', async (input: Record<string, unknown>) => { verification = input; return { getPayload: () => payload }; });
  const provider = createGoogleProvider(config);
  const identity = await provider.exchangeCode({ code: 'test-code', codeVerifier: 'test-verifier', nonce: 'nonce-value' });
  assert.equal(exchange?.codeVerifier, 'test-verifier'); assert.equal(exchange?.redirect_uri, config.googleCallbackUrl);
  assert.equal(verification?.audience, 'test-client'); assert.equal(verification?.idToken, 'test-id-token');
  assert.equal(identity.subject, 'google-stable-subject'); assert.equal('id_token' in identity, false);
  payload = { ...payload, nonce: 'wrong-nonce' };
  await assert.rejects(provider.exchangeCode({ code: 'test-code', codeVerifier: 'test-verifier', nonce: 'nonce-value' }), /could not be verified/);
  payload = { ...payload, nonce: 'nonce-value', email_verified: false };
  await assert.rejects(provider.exchangeCode({ code: 'test-code', codeVerifier: 'test-verifier', nonce: 'nonce-value' }), /could not be verified/);
});

test('Google adapter cannot accept a code response without an ID token', async context => {
  context.mock.method(OAuth2Client.prototype, 'getToken', async () => ({ tokens: { access_token: 'test-access-token' } }));
  const provider = createGoogleProvider(loadConfig({ GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-placeholder' }));
  await assert.rejects(provider.exchangeCode({ code: 'test-code', codeVerifier: 'test-verifier', nonce: 'nonce-value' }), /could not be verified/);
});
