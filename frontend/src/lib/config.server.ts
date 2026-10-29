import type { PublicConfig } from "@/lib/types"

if (typeof window !== "undefined") {
  throw new Error("config.server must only be imported on the server.")
}

function env(name: string): string {
  const value = process.env[name]
  return typeof value === "string" ? value.trim() : ""
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

export function getFrontendConfig(): {
  apiBaseUrl: string
  publicConfig: PublicConfig
} {
  const siteUrl = withoutTrailingSlash(env("SITE_URL")) || "http://localhost"
  const apiBaseUrl = withoutTrailingSlash(env("API_BASE_URL"))
  const apiUrl = withoutTrailingSlash(env("PUBLIC_API_URL"))

  const authorizeUrl = env("OAUTH_AUTHORIZE_URL")
  const tokenUrl = env("OAUTH_TOKEN_URL")
  const clientId = env("OAUTH_CLIENT_ID")
  const redirectUri = env("OAUTH_REDIRECT_URI")

  const oauth: PublicConfig["oauth"] =
    authorizeUrl !== "" && tokenUrl !== "" && clientId !== "" && redirectUri !== ""
      ? {
          authorizeUrl,
          tokenUrl,
          clientId,
          audience: env("OAUTH_AUDIENCE"),
          scope: env("OAUTH_SCOPE"),
          redirectUri,
        }
      : null

  return {
    apiBaseUrl,
    publicConfig: {
      siteUrl,
      apiUrl,
      oauth,
    },
  }
}
