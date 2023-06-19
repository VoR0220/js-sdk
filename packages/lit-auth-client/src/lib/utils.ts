import { AuthMethodType } from '@lit-protocol/constants';
import { AuthMethod, LoginUrlParams } from '@lit-protocol/types';
import { utils } from 'ethers';
import * as jose from 'jose';

export const STATE_PARAM_KEY = 'lit-state-param';

/**
 * Check if OAuth provider is supported
 *
 * @param provider {string} - Auth provider name
 *
 * @returns {boolean} - True if provider is supported
 */
export function isSocialLoginSupported(provider: string): boolean {
  return ['google', 'discord'].includes(provider);
}

/**
 * Create login url using the parameters provided as arguments when initializing the client
 *
 * @param {string} provider - Social login provider to use
 * @param {string} redirectUri - Redirect uri to use
 *
 * @returns {Promise<string>} - Login url
 */
export async function prepareLoginUrl(
  provider: string,
  redirectUri: string
): Promise<string> {
  const baseUrl = 'https://login.litgateway.com';
  const loginUrl = `${baseUrl}${getLoginRoute(provider)}`;
  const state = encode(await setStateParam());
  const authParams = {
    app_redirect: redirectUri,
  };
  const queryAuthParams = createQueryParams(authParams);
  return `${loginUrl}?${queryAuthParams}&state=${state}`;
}

/**
 * Get route for logging in with given provider
 *
 * @param provider {string} - Auth provider name
 *
 * @returns route
 */
function getLoginRoute(provider: string): string {
  switch (provider) {
    case 'google':
      return '/auth/google';
    case 'discord':
      return '/auth/discord';
    default:
      throw new Error(
        `No login route available for the given provider "${provider}".`
      );
  }
}

/**
 * Create query params string from given object
 *
 * @param params {any} - Object of query params
 *
 * @returns {string} - Query string
 */
function createQueryParams(params: any): string {
  // Strip undefined values from params
  const filteredParams = Object.keys(params)
    .filter((k) => typeof params[k] !== 'undefined')
    .reduce((acc, key) => ({ ...acc, [key]: params[key] }), {});
  // Create query string
  return new URLSearchParams(filteredParams).toString();
}

/**
 * Parse out login parameters from the query string
 *
 * @param {string} search - Query string
 *
 * @returns {LoginUrlParams} - Login url params
 */
export function parseLoginParams(search: string): LoginUrlParams {
  const searchParams = new URLSearchParams(search);
  const provider = searchParams.get('provider');
  const accessToken = searchParams.get('access_token');
  const idToken = searchParams.get('id_token');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  return {
    provider,
    accessToken,
    idToken,
    state,
    error,
  };
}

/**
 * Check if current url is redirect uri to determine if app was redirected back from external login page
 *
 * @param {string} redirectUri - Redirect uri to check against
 *
 * @returns {boolean} - If current url is redirect uri
 */
export function isSignInRedirect(redirectUri: string): boolean {
  // Check if current url matches redirect uri
  const isRedirectUri = window.location.href.startsWith(redirectUri);
  if (!isRedirectUri) {
    return false;
  }
  // Check url for redirect params
  const { provider, accessToken, idToken, state, error } = parseLoginParams(
    window.document.location.search
  );
  // Check if current url is redirect uri and has redirect params
  if (isRedirectUri && (provider || accessToken || idToken || state || error)) {
    return true;
  }
  return false;
}

/**
 * Get provider name from redirect uri if available
 *
 * @returns {string} - Provider name
 */
export function getProviderFromUrl(): string | null {
  const { provider } = parseLoginParams(window.document.location.search);
  return provider;
}

/**
 * Create OAuth 2.0 state param and store it in session storage
 *
 * @returns {Promise<string>} - State param
 */
export async function setStateParam(): Promise<string> {
  const { nanoid } = await import('nanoid');
  const state = nanoid(15);
  sessionStorage.setItem(STATE_PARAM_KEY, state);
  return state;
}

/**
 * Get OAuth 2.0 state param from session storage
 *
 * @returns {string} - State param
 */
export function getStateParam(): string | null {
  return sessionStorage.getItem(STATE_PARAM_KEY);
}

/**
 * Remove OAuth 2.0 state param from session storage
 *
 * @returns {void}
 */
export function removeStateParam(): void {
  return sessionStorage.removeItem(STATE_PARAM_KEY);
}

/**
 * Encode a string with base64
 *
 * @param value {string} - String to encode
 *
 * @returns {string} - Encoded string
 */
export function encode(value: string): string {
  return window.btoa(value);
}

/**
 * Decode a string with base64
 *
 * @param value {string} - String to decode
 *
 * @returns {string} - Decoded string
 */
export function decode(value: string): string {
  return window.atob(value);
}

/**
 * Get RP ID from origin for WebAuthn
 *
 * @param {string} origin - Origin to get RP ID from
 *
 * @returns {string} - RP ID
 */
export function getRPIdFromOrigin(origin: string) {
  // remove protocol with regex
  const newOrigin = origin.replace(/(^\w+:|^)\/\//, '');
  // remove port with regex
  return newOrigin.replace(/:\d+$/, '');
}

/**
 * Derive unique identifier from authentication material produced by auth providers
 *
 * @param {AuthMethod} authMethod - Auth method object from provider
 *
 * @returns {Promise<string>} - Auth method id
 */
export async function getAuthMethodId(authMethod: AuthMethod): Promise<string> {
  switch (authMethod.authMethodType) {
    case AuthMethodType.GoogleJwt:
      return await getGoogleAuthMethodId(authMethod);
    case AuthMethodType.Discord:
      return await getDiscordAuthMethodId(authMethod);
    case AuthMethodType.EthWallet:
      return await getEthWalletAuthMethodId(authMethod);
    case AuthMethodType.WebAuthn:
      return await getWebAuthnAuthMethodId(authMethod);
    case AuthMethodType.OTP:
      return await getOTPMethodId(authMethod);
    default:
      throw new Error(
        `Invalid auth method type "${authMethod.authMethodType}" passed`
      );
  }
}

/**
 * Fetch Discord user info
 *
 * https://discord.com/developers/docs/resources/user
 */
async function getDiscordUserInfo(accessToken: string): Promise<any> {
  const meResponse = await fetch('https://discord.com/api/users/@me', {
    method: 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (meResponse.ok) {
    const user = await meResponse.json();
    return user;
  } else {
    throw new Error('Unable to fetch Discord user info');
  }
}

/**
 * Get ID for given Discord access token
 */
async function getDiscordAuthMethodId(authMethod: AuthMethod): Promise<string> {
  const user = await getDiscordUserInfo(authMethod.accessToken);
  const authMethodId = utils.keccak256(
    utils.toUtf8Bytes(`${user.id}:1052874239658692668`)
  );
  return authMethodId;
}

/**
 * Parse Google ID token
 *
 * https://developers.google.com/identity/openid-connect/openid-connect
 */
async function getGoogleUserInfo(idToken: string): Promise<any> {
  const claims = jose.decodeJwt(idToken);
  return Promise.resolve(claims);
}

/**
 * Get ID for given Google ID token
 */
async function getGoogleAuthMethodId(authMethod: AuthMethod): Promise<string> {
  const payload = await getGoogleUserInfo(authMethod.accessToken);
  const authMethodId = utils.keccak256(
    utils.toUtf8Bytes(`${payload.sub}:${payload.aud}`)
  );
  return authMethodId;
}

/**
 * Get ID for given Ethereum wallet signature
 */
async function getEthWalletAuthMethodId(
  authMethod: AuthMethod
): Promise<string> {
  const authSig = JSON.parse(authMethod.accessToken);
  return Promise.resolve(authSig.address);
}

/**
 * Get ID for given WebAuthn credential
 */
async function getWebAuthnAuthMethodId(
  authMethod: AuthMethod
): Promise<string> {
  const data = JSON.parse(authMethod.accessToken);
  const authMethodId = utils.keccak256(utils.toUtf8Bytes(`${data.rawId}:lit`));
  return Promise.resolve(authMethodId);
}

/**
 * Get ID for given email / SMS OTP
 */
async function getOTPMethodId(authMethod: AuthMethod): Promise<string> {
  const tokenBody = parseOTPJWT(authMethod.accessToken);
  const orgId = (tokenBody['orgId'] as string).toLowerCase();
  const message: string = tokenBody['extraData'] as string;
  const contents = message.split('|');
  const userId = contents[0];

  const authMethodId = utils.keccak256(utils.toUtf8Bytes(`${userId}:${orgId}`));
  return Promise.resolve(authMethodId);
}

/**
 * Parse JWT token for email / SMS OTP
 */
function parseOTPJWT(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token length');
  }
  const body = Buffer.from(parts[1], 'base64');
  const parsedBody: Record<string, unknown> = JSON.parse(
    body.toString('ascii')
  );
  return parsedBody;
}
