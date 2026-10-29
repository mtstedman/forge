"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { ApiError, requestJson } from "@/lib/api"
import {
  clearAdminSession,
  clearPkceState,
  createPkceRequest,
  normalizeAdminUser,
  readAdminSession,
  removeOauthCallbackParams,
  takePkceState,
  writeAdminSession,
  writePkceState,
} from "@/lib/admin-auth"
import type { AdminUser, ApiEnvelope, PublicConfig } from "@/lib/types"

type AuthStatus = "loading" | "anonymous" | "authenticated"

type AdminAuthValue = {
  user: AdminUser | null
  status: AuthStatus
  error: string | null
  login: (email: string, password: string) => Promise<void>
  startSso: () => Promise<void>
  logout: () => Promise<void>
  request: <T>(path: string, init?: RequestInit) => Promise<T>
}

type LoginResponse = ApiEnvelope<{
  access_token: string
  token_type?: string
  expires_at?: string
}>

type OauthTokenResponse = {
  access_token?: unknown
  expires_in?: unknown
  error?: unknown
  error_description?: unknown
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null)

function errorMessage(error: unknown, fallback = "Sign-in failed."): string {
  return error instanceof Error && error.message !== "" ? error.message : fallback
}

function validExpiration(value: unknown): string | null {
  if (typeof value !== "string") return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp > Date.now() ? value : null
}

function oauthExpiration(expiresIn: unknown): string | null {
  const seconds =
    typeof expiresIn === "number"
      ? expiresIn
      : typeof expiresIn === "string" && expiresIn.trim() !== ""
        ? Number(expiresIn)
        : Number.NaN

  return Number.isFinite(seconds) && seconds > 0
    ? new Date(Date.now() + seconds * 1000).toISOString()
    : null
}

export function AdminAuthProvider({
  config,
  children,
}: {
  config: PublicConfig
  children: React.ReactNode
}): React.JSX.Element {
  const [user, setUser] = useState<AdminUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>("loading")
  const [error, setError] = useState<string | null>(null)
  const tokenRef = useRef<string | null>(null)
  const initializedRef = useRef(false)

  const clearAuthentication = useCallback((message: string | null = null) => {
    tokenRef.current = null
    clearAdminSession()
    setUser(null)
    setStatus("anonymous")
    setError(message)
  }, [])

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const token = tokenRef.current
      if (!token) throw new ApiError("Authentication is required.", 401)

      const headers = new Headers(init?.headers)
      headers.set("Authorization", `Bearer ${token}`)

      try {
        return await requestJson<T>(config.apiUrl, path, { ...init, headers })
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.status === 401) {
          clearAuthentication("Your session expired. Please sign in again.")
        }
        throw requestError
      }
    },
    [clearAuthentication, config.apiUrl]
  )

  const verifyToken = useCallback(
    async (token: string): Promise<AdminUser> => {
      const headers = new Headers({ Authorization: `Bearer ${token}` })
      const response = await requestJson<ApiEnvelope<unknown>>(config.apiUrl, "/admin/me", {
        headers,
      })
      return normalizeAdminUser(response.data)
    },
    [config.apiUrl]
  )

  const acceptToken = useCallback(
    async (token: string, expiresAt: string | null): Promise<void> => {
      if (token === "") throw new Error("The service returned an invalid sign-in response.")
      if (expiresAt !== null && Date.parse(expiresAt) <= Date.now()) {
        throw new Error("The sign-in session has already expired.")
      }

      writeAdminSession(token, expiresAt)
      tokenRef.current = token

      try {
        const account = await verifyToken(token)
        setUser(account)
        setStatus("authenticated")
        setError(null)
      } catch (verificationError) {
        clearAuthentication(
          verificationError instanceof ApiError && verificationError.status === 401
            ? "Your session expired. Please sign in again."
            : errorMessage(verificationError)
        )
        throw verificationError
      }
    },
    [clearAuthentication, verifyToken]
  )

  const exchangeOauthCode = useCallback(
    async (code: string, returnedState: string | null): Promise<void> => {
      const oauth = config.oauth
      const transient = takePkceState()
      if (
        !oauth ||
        !transient.state ||
        !returnedState ||
        transient.state !== returnedState ||
        !transient.verifier
      ) {
        throw new Error("The sign-in response could not be verified. Please try again.")
      }

      const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: oauth.clientId,
        code,
        redirect_uri: oauth.redirectUri,
        code_verifier: transient.verifier,
      })
      const response = await fetch(oauth.tokenUrl, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body,
      })
      const payload = (await response.json().catch(() => ({}))) as OauthTokenResponse
      if (!response.ok || typeof payload.access_token !== "string" || payload.access_token === "") {
        throw new Error(
          typeof payload.error_description === "string" && payload.error_description !== ""
            ? payload.error_description
            : "Sign-in failed."
        )
      }

      await acceptToken(payload.access_token, oauthExpiration(payload.expires_in))
    },
    [acceptToken, config.oauth]
  )

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    const initialize = async () => {
      const params = new URLSearchParams(window.location.search)
      const code = params.get("code")
      const returnedState = params.get("state")
      const callbackError = params.get("error_description") || params.get("error")
      const hasCallback = code !== null || returnedState !== null || callbackError !== null

      try {
        if (hasCallback) {
          if (callbackError) {
            clearPkceState()
            throw new Error(callbackError)
          }
          if (!code) {
            clearPkceState()
            throw new Error("The sign-in response did not include an authorization code.")
          }
          await exchangeOauthCode(code, returnedState)
          return
        }

        const stored = readAdminSession()
        if (!stored.session) {
          setStatus("anonymous")
          setError(stored.expired ? "Your session expired. Please sign in again." : null)
          return
        }

        tokenRef.current = stored.session.token
        const account = await verifyToken(stored.session.token)
        setUser(account)
        setStatus("authenticated")
        setError(null)
      } catch (initializationError) {
        clearAdminSession()
        tokenRef.current = null
        setUser(null)
        setStatus("anonymous")
        setError(errorMessage(initializationError))
      } finally {
        if (hasCallback) removeOauthCallbackParams()
      }
    }

    void initialize()
  }, [exchangeOauthCode, verifyToken])

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      setError(null)
      try {
        const response = await requestJson<LoginResponse>(config.apiUrl, "/admin/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        })
        const token = response?.data?.access_token
        if (typeof token !== "string" || token === "") {
          throw new Error("The service returned an invalid sign-in response.")
        }

        if (typeof response.data.expires_at !== "string") {
          throw new Error("The service returned an invalid sign-in response.")
        }
        const expiresAt = validExpiration(response.data.expires_at)
        if (expiresAt === null) throw new Error("The sign-in session has already expired.")
        await acceptToken(token, expiresAt)
      } catch (loginError) {
        setError(errorMessage(loginError))
        throw loginError
      }
    },
    [acceptToken, config.apiUrl]
  )

  const startSso = useCallback(async (): Promise<void> => {
    setError(null)
    const oauth = config.oauth
    if (!oauth) {
      const configurationError = new Error("Single sign-on is not configured.")
      setError(configurationError.message)
      throw configurationError
    }

    try {
      const pkce = await createPkceRequest()
      writePkceState(pkce.verifier, pkce.state)
      const authorizeUrl = new URL(oauth.authorizeUrl)
      authorizeUrl.searchParams.set("response_type", "code")
      authorizeUrl.searchParams.set("client_id", oauth.clientId)
      authorizeUrl.searchParams.set("redirect_uri", oauth.redirectUri)
      authorizeUrl.searchParams.set("code_challenge", pkce.challenge)
      authorizeUrl.searchParams.set("code_challenge_method", "S256")
      authorizeUrl.searchParams.set("state", pkce.state)
      if (oauth.audience !== "") authorizeUrl.searchParams.set("audience", oauth.audience)
      if (oauth.scope !== "") authorizeUrl.searchParams.set("scope", oauth.scope)
      window.location.assign(authorizeUrl.toString())
    } catch (ssoError) {
      clearPkceState()
      setError(errorMessage(ssoError))
      throw ssoError
    }
  }, [config.oauth])

  const logout = useCallback(async (): Promise<void> => {
    const token = tokenRef.current
    try {
      if (token) {
        const headers = new Headers({ Authorization: `Bearer ${token}` })
        await requestJson<undefined>(config.apiUrl, "/admin/logout", {
          method: "POST",
          headers,
        })
      }
    } catch {
      // Local state is authoritative for signing out in this browser.
    } finally {
      clearAuthentication(null)
      clearPkceState()
    }
  }, [clearAuthentication, config.apiUrl])

  const value = useMemo<AdminAuthValue>(
    () => ({ user, status, error, login, startSso, logout, request }),
    [user, status, error, login, startSso, logout, request]
  )

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
}

export function useAdminAuth(): AdminAuthValue {
  const context = useContext(AdminAuthContext)
  if (!context) throw new Error("useAdminAuth must be used within AdminAuthProvider.")
  return context
}
