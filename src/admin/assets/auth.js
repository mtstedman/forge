(() => {
  'use strict';

  const TOKEN_KEY = 'forge.admin.accessToken';
  const VERIFIER_KEY = 'forge.admin.pkceVerifier';
  const STATE_KEY = 'forge.admin.oauthState';
  const config = readConfig();
  let accessToken = sessionStorage.getItem(TOKEN_KEY) || '';
  let currentUser = null;

  function readConfig() {
    try {
      return JSON.parse(document.body.dataset.adminConfig || '{}');
    } catch (_error) {
      return {};
    }
  }

  function randomValue(byteLength) {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return base64Url(bytes);
  }

  function base64Url(bytes) {
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  async function sha256(value) {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  }

  function showSignIn(message) {
    currentUser = null;
    document.getElementById('admin-shell').hidden = true;
    document.getElementById('auth-screen').hidden = false;
    document.getElementById('auth-message').textContent = message || 'Sign in to manage resources, media, and comments.';
  }

  function clearToken(message) {
    accessToken = '';
    sessionStorage.removeItem(TOKEN_KEY);
    showSignIn(message);
    document.dispatchEvent(new CustomEvent('forge:signed-out'));
  }

  async function signIn() {
    if (!config.authorizeUrl || !config.clientId || !config.redirectUri) {
      showSignIn('Sign-in is not configured.');
      return;
    }

    const verifier = randomValue(64);
    const state = randomValue(32);
    const challenge = base64Url(await sha256(verifier));
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.setItem(STATE_KEY, state);

    const url = new URL(config.authorizeUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', state);
    if (config.audience) url.searchParams.set('audience', config.audience);
    if (config.scope) url.searchParams.set('scope', config.scope);
    window.location.assign(url.toString());
  }

  async function exchangeCode(code, returnedState) {
    const expectedState = sessionStorage.getItem(STATE_KEY);
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);
    sessionStorage.removeItem(VERIFIER_KEY);

    if (!expectedState || !returnedState || expectedState !== returnedState || !verifier) {
      throw new Error('The sign-in response could not be verified. Please try again.');
    }
    if (!config.tokenUrl) {
      throw new Error('The token endpoint is not configured.');
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      code,
      redirect_uri: config.redirectUri,
      code_verifier: verifier
    });
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || typeof payload.access_token !== 'string') {
      throw new Error(typeof payload.error_description === 'string' ? payload.error_description : 'Sign-in failed.');
    }

    accessToken = payload.access_token;
    sessionStorage.setItem(TOKEN_KEY, accessToken);
  }

  function apiUrl(path) {
    const base = String(config.publicApiUrl || '').replace(/\/+$/, '');
    return `${base}${path}`;
  }

  async function apiFetch(path, options = {}) {
    if (!accessToken) {
      throw new Error('Authentication required.');
    }

    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${accessToken}`);
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(apiUrl(path), { ...options, headers });
    if (response.status === 401) {
      clearToken('Your session expired. Please sign in again.');
      throw new Error('Authentication required.');
    }
    if (response.status === 204) return null;

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(typeof payload.error === 'string' ? payload.error : `Request failed (${response.status}).`);
      error.status = response.status;
      error.fields = payload.fields && typeof payload.fields === 'object' ? payload.fields : null;
      throw error;
    }
    return payload;
  }

  async function verifySession() {
    if (!accessToken) {
      showSignIn();
      return;
    }

    const payload = await apiFetch('/admin/me');
    currentUser = payload && payload.data ? payload.data : {};
    const accountName = currentUser.name || currentUser.email || currentUser.sub || 'Administrator';
    document.getElementById('account-name').textContent = accountName;
    document.getElementById('auth-screen').hidden = true;
    document.getElementById('admin-shell').hidden = false;
    document.dispatchEvent(new CustomEvent('forge:authenticated', { detail: currentUser }));
  }

  async function start() {
    document.getElementById('sign-in').addEventListener('click', () => {
      signIn().catch((error) => showSignIn(error.message));
    });
    document.getElementById('sign-out').addEventListener('click', () => clearToken('You have signed out.'));

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const oauthError = params.get('error_description') || params.get('error');

    try {
      if (oauthError) throw new Error(oauthError);
      if (code) {
        await exchangeCode(code, state);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      await verifySession();
    } catch (error) {
      clearToken(error instanceof Error ? error.message : 'Sign-in failed.');
    }
  }

  window.ForgeAdminAuth = Object.freeze({
    fetch: apiFetch,
    config: Object.freeze({ ...config }),
    getUser: () => currentUser
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
