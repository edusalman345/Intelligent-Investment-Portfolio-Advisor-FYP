# Google Login setup for P1

Google Login is implemented in the authentication module using a backend
authorization-code flow. **PASS: real Google login, account creation, protected
page access and logout on 2026-10-09**, corroborated by backend validation and
owner browser confirmation. The owner has privately replaced the exposed
development secret. **ACTION_REQUIRED: verify that replacement; live explicit account linking
remains unverified.** See [the validation record](p1-validation.md).

## Owner configuration

The previously exposed Google secret was removed from `.env.example` and was
never committed. The owner reported rotation on 2026-10-09 and privately saved a
replacement; comparison confirmed a different value. Keep credentials only in
an ignored `.env` or private process environment. The real verification history
and its remaining live scenarios are recorded in the validation document.

1. Open Google Cloud Console and select/create a development project. In **Google
   Auth Platform → Branding**, configure the app name, support email and developer
   contact information. Avoid adding unrelated Google API permissions.
2. In **Audience**, choose External if using personal Gmail accounts. Keep the
   development app in Testing and add the Google accounts intended to test it.
   An organization-only app may use Internal only when that organization's
   account/project eligibility applies.
3. In **Data Access**, use identity scopes `openid`, `email` and `profile`. No Drive,
   Gmail, financial data or offline-access permissions are needed.
4. In **Clients**, create an OAuth client of type **Web application**. Add this
   exact authorized redirect URI:
   `http://localhost:3001/api/v1/auth/google/callback`.
   This is the backend callback, not the Vite URL. A pure backend redirect flow
   does not require an authorized JavaScript origin; this implementation does not
   use a client-side Google token SDK.
5. Set these names privately in the ignored root `.env` or API process environment:

   ```text
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   GOOGLE_CALLBACK_URL=
   ```

   Populate the first two with the development client's values. Set the callback
   to the exact URI registered above. Never paste the secret into chat, commit the
   downloaded client configuration or put credentials in frontend variables.
6. Keep `FRONTEND_ORIGIN` at `http://localhost:5173` for this setup. Start the
   database/migrated API and frontend as described in the [README](../README.md),
   then restart the API after changing configuration.

Google OAuth setup does not require activating a paid finance API. Do not enable
billing or unrelated APIs for this P1 login flow. Future staging/production needs
its own reviewed HTTPS URLs and credentials; those deployments are deferred.

The console configuration guidance follows Google's
[consent-screen setup](https://support.google.com/cloud/answer/15549257?hl=en) and
[OAuth client creation](https://support.google.com/cloud/answer/15549945?hl=en)
instructions. Console labels may change; the required client type, scope and
exact redirect registration remain the relevant settings.

## Implemented protections and linking behavior

- Random state, nonce and PKCE S256 values belong to a ten-minute, single-use
  database transaction bound to a short-lived HttpOnly browser cookie. Consumed
  transactions cannot be replayed.
- The backend exchanges the code with its client credentials and verifier.
  `google-auth-library` verifies the ID-token signature, issuer, audience and
  expiry; the implementation additionally requires matching nonce, subject and
  verified email. This follows Google's
  [OpenID Connect flow](https://developers.google.com/identity/openid-connect/openid-connect)
  and [ID-token verification guidance](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
- Identity uses Google's subject, not an email-only association. A new verified
  Google identity creates an investor account. An existing email/password account
  is never silently linked by matching email: sign in locally and link through
  Account & security with the current password.
- Linking is bound to the original authenticated session and checks that it is
  still active after acquiring account/session locks. A Google identity already
  owned by another account cannot be transferred. Google-only accounts may add a
  local password after a sufficiently fresh authenticated login.
- The app creates its own opaque, revocable server session. It does not expose or
  persist Google access/refresh tokens. Session and OAuth cookies are HttpOnly,
  SameSite=Lax and Secure in production; localhost development uses HTTP.
- Authenticated mutations use CSRF tokens and exact Origin checks; authorization
  remains on the server. Provider errors, codes, credentials and raw tokens are
  not logged or returned in error text.

## Real verification checklist

With owner credentials configured, verify login using a permitted Google test
user, account creation, subsequent login to the same subject, logout, and session
revocation. Separately verify explicit linking from a password account and that a
same-email account does not silently link. Cancellation, invalid/replayed state,
expired transactions and revoked linking sessions must fail safely.

Unconfigured Google Login is disabled in the UI and returns a configuration error
from the API. Automated browser tests deliberately keep credentials empty;
injected Google providers exercise protocol and account behavior locally. Those
tests do **not** prove that real console credentials, redirect registration or
Google's consent screen work. The real login flow has now passed separately;
retain ACTION_REQUIRED for individual live scenarios or replacement credentials
that have not been tested.
