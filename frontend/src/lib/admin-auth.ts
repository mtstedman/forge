import type { AdminUser } from "@/lib/types"

const TOKEN_KEY = "forge.admin.accessToken"
const EXPIRES_AT_KEY = "forge.admin.accessTokenExpiresAt"
const PKCE_VERIFIER_KEY = "forge.admin.pkceVerifier"
const OAUTH_STATE_KEY = "forge.admin.oauthState"

export type AdminSession = {
  token: string
  expiresAt: string | null
}

export type AdminSessionRead = {
  session: AdminSession | null
  expired: boolean
}

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null

  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function readAdminSession(): AdminSessionRead {
  const storage = getSessionStorage()
  if (!storage) return { session: null, expired: false }

  try {
    const token = storage.getItem(TOKEN_KEY) ?? ""
    const expiresAt = storage.getItem(EXPIRES_AT_KEY)
    if (token === "") return { session: null, expired: false }

    if (expiresAt !== null) {
      const expiresAtMs = Date.parse(expiresAt)
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
        clearAdminSession()
        return { session: null, expired: true }
      }
    }

    return { session: { token, expiresAt }, expired: false }
  } catch {
    return { session: null, expired: false }
  }
}

export function writeAdminSession(token: string, expiresAt: string | null): void {
  const storage = getSessionStorage()
  if (!storage) {
    throw new Error("Browser session storage is unavailable. Enable it to sign in.")
  }

  try {
    storage.setItem(TOKEN_KEY, token)
    if (expiresAt === null) {
      storage.removeItem(EXPIRES_AT_KEY)
    } else {
      storage.setItem(EXPIRES_AT_KEY, expiresAt)
    }
  } catch {
    clearAdminSession()
    throw new Error("Browser session storage is unavailable. Enable it to sign in.")
  }
}

export function clearAdminSession(): void {
  const storage = getSessionStorage()
  if (!storage) return

  try {
    storage.removeItem(TOKEN_KEY)
    storage.removeItem(EXPIRES_AT_KEY)
  } catch {
    // Authentication state is also cleared in memory by the provider.
  }
}

function base64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function randomValue(length: number): string {
  const bytes = new Uint8Array(length)
  globalThis.crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

export async function createPkceRequest(): Promise<{
  verifier: string
  state: string
  challenge: string
}> {
  if (!globalThis.crypto?.getRandomValues || !globalThis.crypto?.subtle) {
    throw new Error("Secure sign-in is not supported by this browser.")
  }

  const verifier = randomValue(64)
  const state = randomValue(32)
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  )

  return { verifier, state, challenge: base64Url(new Uint8Array(digest)) }
}

export function writePkceState(verifier: string, state: string): void {
  const storage = getSessionStorage()
  if (!storage) {
    throw new Error("Browser session storage is unavailable. Enable it to use single sign-on.")
  }

  try {
    storage.setItem(PKCE_VERIFIER_KEY, verifier)
    storage.setItem(OAUTH_STATE_KEY, state)
  } catch {
    clearPkceState()
    throw new Error("Browser session storage is unavailable. Enable it to use single sign-on.")
  }
}

export function takePkceState(): { verifier: string | null; state: string | null } {
  const storage = getSessionStorage()
  if (!storage) return { verifier: null, state: null }

  try {
    const verifier = storage.getItem(PKCE_VERIFIER_KEY)
    const state = storage.getItem(OAUTH_STATE_KEY)
    storage.removeItem(PKCE_VERIFIER_KEY)
    storage.removeItem(OAUTH_STATE_KEY)
    return { verifier, state }
  } catch {
    return { verifier: null, state: null }
  }
}

export function clearPkceState(): void {
  const storage = getSessionStorage()
  if (!storage) return

  try {
    storage.removeItem(PKCE_VERIFIER_KEY)
    storage.removeItem(OAUTH_STATE_KEY)
  } catch {
    // There is no recoverable transient state when storage is unavailable.
  }
}

export function removeOauthCallbackParams(): void {
  if (typeof window === "undefined") return

  const url = new URL(window.location.href)
  for (const key of ["code", "state", "error", "error_description"]) {
    url.searchParams.delete(key)
  }
  const query = url.searchParams.toString()
  window.history.replaceState(
    {},
    document.title,
    `${url.pathname}${query === "" ? "" : `?${query}`}${url.hash}`
  )
}

export function normalizeAdminUser(value: unknown): AdminUser {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The service returned an invalid account response.")
  }

  const record = value as Record<string, unknown>
  const sub = typeof record.sub === "string" ? record.sub : ""
  const email = typeof record.email === "string" ? record.email : ""
  const name = typeof record.name === "string" ? record.name : ""
  if (sub === "" || email === "") {
    throw new Error("The service returned an invalid account response.")
  }

  return { sub, name, email }
}
