import { randomBytes } from "node:crypto"

import type { GetServerSideProps, InferGetServerSidePropsType } from "next"
import Head from "next/head"
import { useCallback, useEffect, useState } from "react"

import { AdminLayout } from "@/components/admin/admin-layout"
import { AdminAuthProvider, useAdminAuth } from "@/components/admin/auth-provider"
import { CommentsPanel } from "@/components/admin/comments-panel"
import { ConsultationsPanel } from "@/components/admin/consultations-panel"
import { AdminLogin } from "@/components/admin/login"
import { MediaPanel } from "@/components/admin/media-panel"
import { PostWorkspace } from "@/components/admin/post-workspace"
import { getFrontendConfig } from "@/lib/config.server"
import type { MediaItem, PublicConfig } from "@/lib/types"

type AdminTab = "posts" | "media" | "comments" | "consultations"

type AdminPageProps = {
  /** Explicit public subset only; server-side settings are never serialized. */
  config: PublicConfig
}

/** Returns the http(s) origin of a configured URL, or null when it is unusable. */
function originOf(url: string | null | undefined): string | null {
  if (typeof url !== "string" || url.trim() === "") return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    return parsed.origin
  } catch {
    return null
  }
}

function unique(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => value !== null)))
}

/**
 * Mirrors the legacy admin CSP while allowing Next hydration: framework scripts are
 * same-origin files plus any inline script carrying this response's nonce.
 */
function adminContentSecurityPolicy(config: PublicConfig, nonce: string): string {
  const development = process.env.NODE_ENV === "development"
  const apiOrigin = originOf(config.apiUrl)
  const tokenOrigin = originOf(config.oauth?.tokenUrl)

  const scriptSources = ["'self'", `'nonce-${nonce}'`]
  // Next's development runtime evaluates modules and injects styles for HMR.
  if (development) scriptSources.push("'unsafe-eval'")

  const styleSources = ["'self'", `'nonce-${nonce}'`, "https://fonts.googleapis.com"]
  if (development) {
    // Nonces would disable 'unsafe-inline', so development uses inline styles only.
    styleSources.splice(1, 1, "'unsafe-inline'")
  }

  const directives: Array<[string, string[]]> = [
    ["default-src", ["'none'"]],
    ["base-uri", ["'none'"]],
    ["connect-src", unique(["'self'", apiOrigin, tokenOrigin])],
    ["img-src", unique(["'self'", "data:", apiOrigin])],
    ["script-src", scriptSources],
    ["style-src", styleSources],
    ["font-src", ["'self'", "https://fonts.gstatic.com"]],
    ["manifest-src", ["'self'"]],
    ["form-action", ["'none'"]],
    ["frame-ancestors", ["'none'"]],
    ["object-src", ["'none'"]],
  ]

  return directives.map(([name, sources]) => `${name} ${sources.join(" ")}`).join("; ")
}

export const getServerSideProps: GetServerSideProps<AdminPageProps> = async ({ res }) => {
  const { publicConfig } = getFrontendConfig()
  const nonce = randomBytes(16).toString("base64")

  res.setHeader("X-Robots-Tag", "noindex, nofollow")
  res.setHeader("Cache-Control", "no-store")
  res.setHeader("Pragma", "no-cache")
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("X-Frame-Options", "DENY")
  res.setHeader("Referrer-Policy", "no-referrer")
  // _document reads the nonce from this header so rendered scripts match it.
  res.setHeader("Content-Security-Policy", adminContentSecurityPolicy(publicConfig, nonce))

  return {
    props: {
      config: {
        siteUrl: publicConfig.siteUrl,
        apiUrl: publicConfig.apiUrl,
        oauth: publicConfig.oauth
          ? {
              authorizeUrl: publicConfig.oauth.authorizeUrl,
              tokenUrl: publicConfig.oauth.tokenUrl,
              clientId: publicConfig.oauth.clientId,
              audience: publicConfig.oauth.audience,
              scope: publicConfig.oauth.scope,
              redirectUri: publicConfig.oauth.redirectUri,
            }
          : null,
      },
    },
  }
}

function AdminWorkspace({ ssoEnabled }: { ssoEnabled: boolean }): React.JSX.Element {
  const { status } = useAdminAuth()
  const [active, setActive] = useState<AdminTab>("posts")
  const [pendingImage, setPendingImage] = useState<MediaItem | null>(null)

  // Sign out or session expiry resets the joined page state for the next sign-in.
  useEffect(() => {
    if (status === "anonymous") {
      setActive("posts")
      setPendingImage(null)
    }
  }, [status])

  const insertImage = useCallback((media: MediaItem) => {
    setPendingImage(media)
    setActive("posts")
  }, [])

  const imageInserted = useCallback(() => setPendingImage(null), [])

  if (status === "anonymous") return <AdminLogin ssoEnabled={ssoEnabled} />

  return (
    <AdminLayout active={active} onNavigate={setActive}>
      {/* The post editor stays mounted so tab changes never discard unsaved edits. */}
      <section aria-label="Posts" hidden={active !== "posts"}>
        <PostWorkspace insertImage={pendingImage} onImageInserted={imageInserted} />
      </section>
      {/* Queue panels remount on each visit so they show current API data. */}
      {active === "media" ? (
        <section aria-label="Media">
          <MediaPanel onInsertImage={insertImage} />
        </section>
      ) : null}
      {active === "comments" ? (
        <section aria-label="Comments">
          <CommentsPanel />
        </section>
      ) : null}
      {active === "consultations" ? (
        <section aria-label="Consultations">
          <ConsultationsPanel />
        </section>
      ) : null}
    </AdminLayout>
  )
}

export default function AdminPage({
  config,
}: InferGetServerSidePropsType<typeof getServerSideProps>): React.JSX.Element {
  return (
    <>
      <Head>
        <title>Forge Admin</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <AdminAuthProvider config={config}>
        <AdminWorkspace ssoEnabled={config.oauth !== null} />
      </AdminAuthProvider>
    </>
  )
}
