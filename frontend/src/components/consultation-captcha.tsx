import * as React from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/*
 * Cloudflare Turnstile widget for the consultation form, rendered explicitly.
 *
 * The official script is loaded at runtime from Cloudflare (it must not be
 * proxied, cached or bundled) and only once the form is close to the viewport.
 * The widget only produces a one-time token; consultation details are never
 * passed to it. There is deliberately no bypass: without a token the form
 * cannot be submitted.
 */

const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
const SCRIPT_TIMEOUT_MS = 15_000

export const CONSULTATION_CAPTCHA_ACTION = "consultation"

type TurnstileRenderOptions = {
  sitekey: string
  action: string
  theme?: "auto" | "light" | "dark"
  size?: "normal" | "flexible" | "compact"
  retry?: "auto" | "never"
  "refresh-expired"?: "auto" | "manual" | "never"
  "response-field"?: boolean
  callback?: (token: string) => void
  "expired-callback"?: () => void
  "timeout-callback"?: () => void
  "error-callback"?: (code: string) => void
}

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string | null | undefined
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("Turnstile can only load in the browser."))
  }
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script")
    let settled = false

    const fail = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      script.remove()
      // Allow a later retry to request the script again.
      scriptPromise = null
      reject(new Error("Turnstile could not be loaded."))
    }

    const timer = window.setTimeout(fail, SCRIPT_TIMEOUT_MS)

    script.addEventListener(
      "load",
      () => {
        if (settled) return
        if (!window.turnstile) {
          fail()
          return
        }
        settled = true
        window.clearTimeout(timer)
        resolve(window.turnstile)
      },
      { once: true }
    )
    script.addEventListener("error", fail, { once: true })

    script.src = TURNSTILE_SCRIPT_URL
    script.async = true
    document.head.appendChild(script)
  })

  return scriptPromise
}

type CaptchaState =
  | "waiting"
  | "loading"
  | "ready"
  | "verified"
  | "expired"
  | "error"
  | "unavailable"
  | "not-configured"

type ConsultationCaptchaProps = {
  siteKey: string
  /** Increment to discard the current token and require a fresh verification. */
  resetKey: number
  onTokenChange: (token: string | null) => void
  onAvailabilityChange?: (available: boolean) => void
  invalid?: boolean
  className?: string
}

function ContactAlternatives(): React.JSX.Element {
  return (
    <>
      Please call{" "}
      <a className="font-semibold text-foreground underline underline-offset-4" href="tel:+16125550148">
        (612) 555-0148
      </a>{" "}
      or email{" "}
      <a
        className="break-all font-semibold text-foreground underline underline-offset-4"
        href="mailto:hello@forgeperformance.com"
      >
        hello@forgeperformance.com
      </a>{" "}
      to book your free consultation.
    </>
  )
}

export function ConsultationCaptcha({
  siteKey,
  resetKey,
  onTokenChange,
  onAvailabilityChange,
  invalid = false,
  className,
}: ConsultationCaptchaProps): React.JSX.Element {
  const configured = siteKey.trim() !== ""
  const wrapperRef = React.useRef<HTMLDivElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const widgetIdRef = React.useRef<string | null>(null)
  const lastResetKeyRef = React.useRef(resetKey)
  const onTokenChangeRef = React.useRef(onTokenChange)
  const onAvailabilityChangeRef = React.useRef(onAvailabilityChange)

  const [state, setState] = React.useState<CaptchaState>(configured ? "waiting" : "not-configured")
  const [nearViewport, setNearViewport] = React.useState(false)
  const [loadAttempt, setLoadAttempt] = React.useState(0)

  React.useEffect(() => {
    onTokenChangeRef.current = onTokenChange
    onAvailabilityChangeRef.current = onAvailabilityChange
  })

  const available = state !== "unavailable" && state !== "not-configured"
  React.useEffect(() => {
    onAvailabilityChangeRef.current?.(available)
  }, [available])

  // Defer loading the third-party script until the form is about to be seen.
  React.useEffect(() => {
    if (!configured || nearViewport) return
    const element = wrapperRef.current
    if (!element || typeof IntersectionObserver === "undefined") {
      setNearViewport(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true)
          observer.disconnect()
        }
      },
      { rootMargin: "400px 0px" }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [configured, nearViewport])

  // Load the script, render the widget and remove it again on cleanup.
  React.useEffect(() => {
    if (!configured) {
      setState("not-configured")
      onTokenChangeRef.current(null)
      return
    }
    if (!nearViewport) return

    let active = true
    setState("loading")

    loadTurnstile()
      .then((api) => {
        const container = containerRef.current
        if (!active || !container) return

        const widgetId = api.render(container, {
          sitekey: siteKey,
          action: CONSULTATION_CAPTCHA_ACTION,
          theme: "light",
          size: "flexible",
          retry: "auto",
          "refresh-expired": "auto",
          "response-field": false,
          callback: (token) => {
            if (!active) return
            onTokenChangeRef.current(token)
            setState("verified")
          },
          "expired-callback": () => {
            if (!active) return
            onTokenChangeRef.current(null)
            setState("expired")
          },
          "timeout-callback": () => {
            if (!active) return
            onTokenChangeRef.current(null)
            setState("expired")
            const id = widgetIdRef.current
            if (id !== null) {
              try {
                api.reset(id)
              } catch {
                setState("error")
              }
            }
          },
          "error-callback": () => {
            if (!active) return
            onTokenChangeRef.current(null)
            setState("error")
          },
        })

        if (typeof widgetId !== "string" || widgetId === "") {
          setState("unavailable")
          return
        }
        widgetIdRef.current = widgetId
        setState((current) => (current === "loading" ? "ready" : current))
      })
      .catch(() => {
        if (active) setState("unavailable")
      })

    return () => {
      active = false
      const widgetId = widgetIdRef.current
      widgetIdRef.current = null
      if (widgetId !== null) {
        try {
          window.turnstile?.remove(widgetId)
        } catch {
          // The widget may already be gone; nothing else to clean up.
        }
      }
      onTokenChangeRef.current(null)
    }
  }, [configured, nearViewport, siteKey, loadAttempt])

  const restart = React.useCallback(() => {
    onTokenChangeRef.current(null)
    const widgetId = widgetIdRef.current
    if (widgetId === null || !window.turnstile) return
    try {
      window.turnstile.reset(widgetId)
      setState("ready")
    } catch {
      setState("error")
    }
  }, [])

  // Every submission attempt consumes the token, so the parent requests a reset.
  React.useEffect(() => {
    if (lastResetKeyRef.current === resetKey) return
    lastResetKeyRef.current = resetKey
    restart()
  }, [resetKey, restart])

  let message: React.ReactNode
  switch (state) {
    case "waiting":
    case "loading":
      message = "Loading the security check…"
      break
    case "ready":
      message = "Complete the security check to send your request."
      break
    case "verified":
      message = "Security check complete."
      break
    case "expired":
      message = "The security check expired. Please complete it again."
      break
    case "error":
      message = "The security check could not be completed. It will retry automatically, or you can restart it."
      break
    case "unavailable":
      message = (
        <>
          The security check could not load, so this form can’t be sent right now. You can try
          loading it again. <ContactAlternatives />
        </>
      )
      break
    case "not-configured":
      message = (
        <>
          Online consultation requests are unavailable right now. <ContactAlternatives />
        </>
      )
      break
  }

  const showWidget = available

  return (
    <div ref={wrapperRef} className={cn("space-y-2", className)} data-state={state}>
      <p id="consult-captcha-label" className="text-sm font-semibold">
        Security check
      </p>
      <div
        ref={containerRef}
        className={cn(
          "min-h-[65px] w-full rounded-md",
          invalid ? "outline outline-2 outline-offset-2 outline-destructive" : "",
          showWidget ? "" : "hidden"
        )}
        aria-labelledby="consult-captcha-label"
        role="group"
      />
      <p
        id="consult-captcha-status"
        role="status"
        aria-live="polite"
        className={cn(
          "text-sm leading-6",
          state === "unavailable" || state === "not-configured" || state === "error"
            ? "text-destructive"
            : "text-muted-foreground"
        )}
      >
        {message}
      </p>
      {state === "error" ? (
        <Button type="button" variant="ghost" size="sm" onClick={restart}>
          Restart security check
        </Button>
      ) : null}
      {state === "unavailable" ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => setLoadAttempt((n) => n + 1)}>
          Try loading the security check again
        </Button>
      ) : null}
    </div>
  )
}
