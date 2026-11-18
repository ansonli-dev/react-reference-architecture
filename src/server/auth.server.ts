import 'server-only';
import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { connection, NextResponse, type NextRequest } from 'next/server';
import * as oidc from 'openid-client';
import { z } from 'zod';
import { routing } from '@/i18n/routing';
import { javaDb } from '@/server/adapters/java/db.server';
import {
  runtimeConfig,
  type ReleaseConfig,
} from '@/server/config/runtime.server';
import { assertMutationOrigin } from '@/server/http/origin.server';
import { apiErrorResponse } from '@/server/http/response.server';
import { ApiFailure } from '@/shared/api/error';

const loginPath = '/api/auth/signin/keycloak';
const callbackPath = '/api/auth/oauth2/callback/keycloak';
const loginLifetimeSeconds = 10 * 60;
const sessionLifetimeSeconds = 8 * 60 * 60;
const tokenRefreshWindowMs = 5_000;
const subjectSchema = z
  .uuid()
  .refine((subject) => subject === subject.toLowerCase());

type AuthCookie = 'login' | 'session';
type JavaSession = { subject: string; accessToken: string };
type SessionRow = {
  subject: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: Date;
};
type LoginRow = {
  state: string;
  nonce: string;
  code_verifier: string;
  return_to: string;
};

function configuredAuth(): ReleaseConfig {
  let config;
  try {
    config = runtimeConfig();
  } catch {
    throw new ApiFailure('CATALOG_UNAVAILABLE');
  }
  if (config.profile !== 'release') throw new ApiFailure('RESOURCE_NOT_FOUND');
  return config;
}

function returnPath(value: string | null): string {
  const fallback = `/${routing.defaultLocale}/books`;
  if (
    !value?.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\s\p{Cc}]/u.test(value)
  )
    return fallback;

  const url = new URL(value, 'https://bookstore.invalid');
  return routing.locales.some((locale) =>
    url.pathname.startsWith(`/${locale}/`),
  )
    ? `${url.pathname}${url.search}${url.hash}`
    : fallback;
}

export function javaLoginHref(returnTo: string): string {
  return `${loginPath}?${new URLSearchParams({ returnTo: returnPath(returnTo) })}`;
}

function cookieName(config: ReleaseConfig, kind: AuthCookie): string {
  const prefix = config.appOrigin.startsWith('https:') ? '__Host-' : '';
  return `${prefix}bookstore-${kind}`;
}

function cookieHash(value: string | undefined): string | null {
  return value && /^[A-Za-z0-9_-]{43}$/.test(value)
    ? createHash('sha256').update(value).digest('hex')
    : null;
}

function setCookie(
  response: NextResponse,
  config: ReleaseConfig,
  kind: AuthCookie,
  value: string,
  maxAge: number,
) {
  response.cookies.set(cookieName(config, kind), value, {
    httpOnly: true,
    secure: config.appOrigin.startsWith('https:'),
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

function authRedirect(location: URL): NextResponse {
  return NextResponse.redirect(location, {
    status: 303,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

let discovery:
  { key: string; pending: Promise<oidc.Configuration> } | undefined;

function oidcConfig(config: ReleaseConfig): Promise<oidc.Configuration> {
  const { oidcIssuer, oidcInternalBaseUrl, oidcClientId, oidcClientSecret } =
    config;
  const key = JSON.stringify([
    oidcIssuer,
    oidcInternalBaseUrl,
    oidcClientId,
    oidcClientSecret,
  ]);
  if (discovery?.key === key) return discovery.pending;

  const privateEndpoints = new Map<string, string>();
  for (const path of [
    '/.well-known/openid-configuration',
    '/protocol/openid-connect/token',
    '/protocol/openid-connect/certs',
  ]) {
    const privateEndpoint = `${oidcInternalBaseUrl}${path}`;
    privateEndpoints.set(`${oidcIssuer}${path}`, privateEndpoint);
    privateEndpoints.set(privateEndpoint, privateEndpoint);
  }

  const execute = [oidc.enableNonRepudiationChecks];
  if (oidcIssuer.startsWith('http:')) execute.push(oidc.allowInsecureRequests);
  const pending = oidc
    .discovery(
      new URL(oidcIssuer),
      oidcClientId,
      {
        client_secret: oidcClientSecret,
        id_token_signed_response_alg: 'RS256',
      },
      undefined,
      {
        execute,
        timeout: 5,
        [oidc.customFetch]: (url, options) => {
          const endpoint = privateEndpoints.get(String(url));
          if (!endpoint) throw new ApiFailure('UPSTREAM_FAILURE');
          const body =
            options.body instanceof Uint8Array
              ? new Uint8Array(options.body)
              : options.body;
          return fetch(endpoint, {
            ...options,
            body,
            cache: 'no-store',
            redirect: 'error',
          });
        },
      },
    )
    .then((config) => {
      if (
        config.serverMetadata().authorization_endpoint !==
        `${oidcIssuer}/protocol/openid-connect/auth`
      )
        throw new ApiFailure('UPSTREAM_FAILURE');
      return config;
    })
    .catch(() => {
      if (discovery?.pending === pending) discovery = undefined;
      throw new ApiFailure('UPSTREAM_FAILURE');
    });
  discovery = { key, pending };
  return pending;
}

function accessTokenExpiry(
  tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers,
): Date {
  const seconds = tokens.expiresIn();
  if (!seconds || tokens.token_type.toLowerCase() !== 'bearer')
    throw new ApiFailure('UPSTREAM_FAILURE');
  return new Date(Date.now() + seconds * 1000);
}

export async function startJavaLogin(request: NextRequest): Promise<Response> {
  try {
    const config = configuredAuth();
    const provider = await oidcConfig(config);
    const id = oidc.randomState();
    const idHash = createHash('sha256').update(id).digest('hex');
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const verifier = oidc.randomPKCECodeVerifier();
    const redirect = oidc.buildAuthorizationUrl(provider, {
      redirect_uri: new URL(callbackPath, config.appOrigin).href,
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
    });

    const sql = javaDb(config.authDatabaseUrl);
    const returnTo = returnPath(request.nextUrl.searchParams.get('returnTo'));
    const expiresAt = new Date(Date.now() + loginLifetimeSeconds * 1000);
    await sql`DELETE FROM bookstore_auth_attempts WHERE expires_at <= now()`;
    await sql`
      INSERT INTO bookstore_auth_attempts (id_hash, state, nonce, code_verifier, return_to, expires_at)
      VALUES (${idHash}, ${state}, ${nonce}, ${verifier}, ${returnTo}, ${expiresAt})
    `;

    const response = authRedirect(redirect);
    setCookie(response, config, 'login', id, loginLifetimeSeconds);
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function finishJavaLogin(request: NextRequest): Promise<Response> {
  try {
    const config = configuredAuth();
    const idHash = cookieHash(
      request.cookies.get(cookieName(config, 'login'))?.value,
    );
    const state = request.nextUrl.searchParams.get('state');
    if (!idHash || !state || !request.nextUrl.searchParams.has('code'))
      throw new ApiFailure('INVALID_INPUT');

    const sql = javaDb(config.authDatabaseUrl);
    const [attempt] = await sql<LoginRow[]>`
      DELETE FROM bookstore_auth_attempts
      WHERE id_hash = ${idHash} AND state = ${state} AND expires_at > now()
      RETURNING state, nonce, code_verifier, return_to
    `;
    if (!attempt) throw new ApiFailure('INVALID_INPUT');

    const callback = new URL(callbackPath, config.appOrigin);
    callback.search = request.nextUrl.search;
    const provider = await oidcConfig(config);
    const tokens = await oidc
      .authorizationCodeGrant(provider, callback, {
        pkceCodeVerifier: attempt.code_verifier,
        expectedState: attempt.state,
        expectedNonce: attempt.nonce,
      })
      .catch(() => {
        throw new ApiFailure('UPSTREAM_FAILURE');
      });
    const subject = subjectSchema.safeParse(tokens.claims()?.sub);
    const refreshToken = tokens.refresh_token;
    if (!subject.success || !refreshToken)
      throw new ApiFailure('UPSTREAM_FAILURE');

    const cookie = oidc.randomState();
    const sessionHash = createHash('sha256').update(cookie).digest('hex');
    const oldSession = cookieHash(
      request.cookies.get(cookieName(config, 'session'))?.value,
    );
    const expiresAt = new Date(Date.now() + sessionLifetimeSeconds * 1000);
    const tokenExpiresAt = accessTokenExpiry(tokens);
    await sql.begin(async (transaction) => {
      await transaction`DELETE FROM bookstore_auth_sessions WHERE expires_at <= now() OR id_hash = ${oldSession}`;
      await transaction`
        INSERT INTO bookstore_auth_sessions (id_hash, subject, access_token, refresh_token, access_token_expires_at, expires_at)
        VALUES (${sessionHash}, ${subject.data}, ${tokens.access_token}, ${refreshToken}, ${tokenExpiresAt}, ${expiresAt})
      `;
    });

    const response = authRedirect(
      new URL(returnPath(attempt.return_to), config.appOrigin),
    );
    setCookie(response, config, 'login', '', 0);
    setCookie(response, config, 'session', cookie, sessionLifetimeSeconds);
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function readJavaSession(): Promise<JavaSession | null> {
  await connection();
  if (process.env.BOOKSTORE_BUILD_PROFILE === 'demo') return null;
  let config;
  try {
    config = configuredAuth();
  } catch (error) {
    if (error instanceof ApiFailure && error.code === 'CATALOG_UNAVAILABLE')
      return null;
    throw error;
  }
  const requestCookies = await cookies();
  const idHash = cookieHash(
    requestCookies.get(cookieName(config, 'session'))?.value,
  );
  if (!idHash) return null;

  return javaDb(config.authDatabaseUrl).begin(async (transaction) => {
    // Serialize refresh-token rotation across concurrent requests and replicas.
    const [session] = await transaction<SessionRow[]>`
      SELECT subject, access_token, refresh_token, access_token_expires_at
      FROM bookstore_auth_sessions
      WHERE id_hash = ${idHash} AND expires_at > now()
      FOR UPDATE
    `;
    if (!session) return null;
    if (
      session.access_token_expires_at.getTime() >
      Date.now() + tokenRefreshWindowMs
    )
      return { subject: session.subject, accessToken: session.access_token };

    try {
      const provider = await oidcConfig(config);
      const tokens = await oidc.refreshTokenGrant(
        provider,
        session.refresh_token,
      );
      const claims = tokens.claims();
      if (claims && claims.sub !== session.subject)
        throw new ApiFailure('UPSTREAM_FAILURE');

      await transaction`
        UPDATE bookstore_auth_sessions
        SET access_token = ${tokens.access_token},
            refresh_token = ${tokens.refresh_token ?? session.refresh_token},
            access_token_expires_at = ${accessTokenExpiry(tokens)}
        WHERE id_hash = ${idHash}
      `;
      return { subject: session.subject, accessToken: tokens.access_token };
    } catch (error) {
      if (!(
        error instanceof oidc.ResponseBodyError &&
        error.error === 'invalid_grant'
      ))
        throw error;
      await transaction`DELETE FROM bookstore_auth_sessions WHERE id_hash = ${idHash}`;
      return null;
    }
  });
}

export async function logoutJavaSession(
  request: NextRequest,
): Promise<Response> {
  try {
    const config = configuredAuth();
    assertMutationOrigin(request.headers, config.appOrigin);
    const session = cookieHash(
      request.cookies.get(cookieName(config, 'session'))?.value,
    );
    const login = cookieHash(
      request.cookies.get(cookieName(config, 'login'))?.value,
    );
    const sql = javaDb(config.authDatabaseUrl);
    if (session)
      await sql`DELETE FROM bookstore_auth_sessions WHERE id_hash = ${session}`;
    if (login)
      await sql`DELETE FROM bookstore_auth_attempts WHERE id_hash = ${login}`;

    const response = authRedirect(
      new URL(
        returnPath(request.nextUrl.searchParams.get('returnTo')),
        config.appOrigin,
      ),
    );
    setCookie(response, config, 'login', '', 0);
    setCookie(response, config, 'session', '', 0);
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
