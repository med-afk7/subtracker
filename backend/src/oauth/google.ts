// "Continue with Google" using OpenID Connect's authorization code flow with PKCE.
// The browser only ever carries an authorization code; tokens are fetched server-to-server.

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
// Tolerated difference between our clock and Google's
const CLOCK_SKEW_SECONDS = 60;

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

export interface GoogleProfile {
  // Google's permanent id for the person; emails can change, this can't
  subject: string;
  email: string;
}

// Why a sign-in attempt was refused; never shown in detail to the user
export class GoogleAuthError extends Error {
  constructor(readonly reason: string) {
    super(`Google sign-in failed: ${reason}`);
    this.name = 'GoogleAuthError';
  }
}

export function buildAuthorizationUrl(
  config: GoogleConfig,
  params: { redirectUri: string; state: string; nonce: string; codeChallenge: string },
): string {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: params.redirectUri,
    response_type: 'code',
    scope: 'openid email',
    state: params.state,
    nonce: params.nonce,
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256',
    // Let people with several Google accounts pick one instead of silently using the last
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

// Swappable so tests never call Google (same pattern as the email sender)
export interface GoogleTokenClient {
  // Returns the ID token for an authorization code
  exchangeCode(
    config: GoogleConfig,
    params: { code: string; codeVerifier: string; redirectUri: string },
  ): Promise<string>;
}

export const googleTokenClient: GoogleTokenClient = {
  async exchangeCode(config, { code, codeVerifier, redirectUri }) {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json().catch(() => ({}))) as {
      id_token?: unknown;
      error?: unknown;
    };
    if (!response.ok || typeof body.id_token !== 'string') {
      throw new GoogleAuthError(`token_exchange_${String(body.error ?? response.status)}`);
    }
    return body.id_token;
  },
};

let tokenClient: GoogleTokenClient = googleTokenClient;
export const getGoogleTokenClient = () => tokenClient;
export const setGoogleTokenClient = (client: GoogleTokenClient) => {
  tokenClient = client;
};

// Checks the ID token's claims and returns who signed in.
// The signature isn't checked: the token came straight from Google's token endpoint over TLS,
// which OpenID Connect Core §3.1.3.7 accepts in place of signature validation.
export function profileFromIdToken(
  idToken: string,
  expected: { clientId: string; nonce: string; nowSeconds?: number },
): GoogleProfile {
  const payload = idToken.split('.')[1];
  if (!payload) throw new GoogleAuthError('malformed_id_token');

  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new GoogleAuthError('malformed_id_token');
  }

  const now = expected.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (typeof claims.iss !== 'string' || !ISSUERS.has(claims.iss)) {
    throw new GoogleAuthError('wrong_issuer');
  }
  // Issued to this app, not to some other site the user signed in to
  if (claims.aud !== expected.clientId) throw new GoogleAuthError('wrong_audience');
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SECONDS < now) {
    throw new GoogleAuthError('expired');
  }
  // Ties the token to the browser that started this sign-in (stops replayed tokens)
  if (claims.nonce !== expected.nonce) throw new GoogleAuthError('wrong_nonce');
  if (typeof claims.sub !== 'string' || claims.sub === '') {
    throw new GoogleAuthError('missing_subject');
  }
  if (typeof claims.email !== 'string' || claims.email === '') {
    throw new GoogleAuthError('missing_email');
  }
  // Linking accounts by email is only safe when Google vouches for the address
  if (claims.email_verified !== true && claims.email_verified !== 'true') {
    throw new GoogleAuthError('email_not_verified');
  }

  return { subject: claims.sub, email: claims.email.trim().toLowerCase() };
}
