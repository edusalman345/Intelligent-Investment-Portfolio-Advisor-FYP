import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import type { AppConfig } from './config.js';
import { HttpError } from './errors.js';

export interface GoogleIdentity { subject: string; email: string; emailVerified: boolean; displayName: string | null; nonce: string }
export interface GoogleAuthorization { state: string; nonce: string; codeChallenge: string }
export interface GoogleProvider {
  authorizationUrl(input: GoogleAuthorization): string;
  exchangeCode(input: { code: string; codeVerifier: string; nonce: string }): Promise<GoogleIdentity>;
}

/** Authorization-code flow only: tokens remain on the server and are never persisted. */
export function createGoogleProvider(config: AppConfig): GoogleProvider {
  const client = new OAuth2Client(config.googleClientId, config.googleClientSecret, config.googleCallbackUrl);
  return {
    authorizationUrl(input) {
      return client.generateAuthUrl({ scope: ['openid', 'email', 'profile'], state: input.state, nonce: input.nonce,
        code_challenge: input.codeChallenge, code_challenge_method: CodeChallengeMethod.S256, access_type: 'online', prompt: 'select_account' });
    },
    async exchangeCode(input) {
      const { tokens } = await client.getToken({ code: input.code, codeVerifier: input.codeVerifier, redirect_uri: config.googleCallbackUrl });
      if (!tokens.id_token) throw new HttpError(401, 'GOOGLE_INVALID', 'Google sign-in could not be verified.');
      // The library verifies signature, Google issuer, audience and expiration.
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.googleClientId });
      const payload = ticket.getPayload();
      const nonce = (payload as unknown as { nonce?: string } | undefined)?.nonce;
      if (!payload?.sub || !payload.email || payload.email_verified !== true || nonce !== input.nonce) {
        throw new HttpError(401, 'GOOGLE_INVALID', 'Google sign-in could not be verified.');
      }
      return { subject: payload.sub, email: payload.email, emailVerified: true, displayName: payload.name ?? null, nonce };
    },
  };
}
