import { ArrowRight, Mail, MapPin, Phone } from "lucide-react"
import { useCallback, useRef, useState, type FormEvent } from "react"

import { ConsultationCaptcha } from "@/components/consultation-captcha"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ApiError, requestJson } from "@/lib/api"
import type { MainPageContent } from "@/lib/main-page-content"
import type { ConsultationBestTime, ConsultationRequestInput, PostSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

type HomeSectionsProps = {
  content: MainPageContent
  posts: PostSummary[]
  resourcesUnavailable: boolean
  apiUrl: string
  turnstileSiteKey: string
}

type SectionHeadingProps = {
  eyebrow: string
  title: string
  id: string
  description?: string
  eyebrowClassName?: string
}

const sectionClass = "scroll-mt-(--site-header-height) border-t border-border/80 py-20 sm:py-24 lg:py-28"
const containerClass = "mx-auto max-w-7xl px-5 sm:px-8 lg:px-10"

function SectionHeading({
  eyebrow,
  title,
  id,
  description,
  eyebrowClassName,
}: SectionHeadingProps): React.JSX.Element {
  return (
    <div className="max-w-2xl">
      <p className={cn("mb-4 text-xs font-bold uppercase tracking-[0.22em] text-primary", eyebrowClassName)}>
        {eyebrow}
      </p>
      <h2 id={id} className="text-4xl font-semibold leading-[1.05] sm:text-5xl lg:text-6xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-6 max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">
          {description}
        </p>
      ) : null}
    </div>
  )
}

function formatPostDate(value: string | null): string {
  if (!value) return ""

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}

type ConsultationFormProps = {
  apiUrl: string
  turnstileSiteKey: string
  contact: MainPageContent["contact"]
}

type ConsultationField =
  | "name"
  | "phone"
  | "email"
  | "best_time"
  | "message"
  | "consent"
  | "captcha_token"

type ConsultationFormStatus = {
  state: "idle" | "sending" | "success" | "error"
  message: string
}

const CONSULTATION_FIELDS: readonly ConsultationField[] = [
  "name",
  "phone",
  "email",
  "best_time",
  "message",
  "consent",
  "captcha_token",
]

const CONSULTATION_FIELD_IDS: Record<Exclude<ConsultationField, "captcha_token">, string> = {
  name: "consult-name",
  phone: "consult-phone",
  email: "consult-email",
  best_time: "consult-time",
  message: "consult-message",
  consent: "consult-consent",
}

const BEST_TIMES: readonly ConsultationBestTime[] = ["Morning", "Midday", "Afternoon", "Evening"]

function isBestTime(value: string): value is ConsultationBestTime {
  return (BEST_TIMES as readonly string[]).includes(value)
}

function isPendingResponse(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { status?: unknown }).status === "pending"
  )
}

function consultationError(
  error: unknown,
  contact: MainPageContent["contact"]
): {
  message: string
  fields: Partial<Record<ConsultationField, string>>
} {
  const generic = contact.form.generic_error_message
  const contactFallback = `or call ${contact.phone} or email ${contact.email}.`
  if (!(error instanceof ApiError)) return { message: generic, fields: {} }

  switch (error.status) {
    case 0:
      return {
        message: `We couldn't reach the server. Your details are still here. Check your connection and try again, ${contactFallback}`,
        fields: {},
      }
    case 422: {
      const fields: Partial<Record<ConsultationField, string>> = {}
      for (const [key, value] of Object.entries(error.fields)) {
        if (value === "" || !(CONSULTATION_FIELDS as readonly string[]).includes(key)) continue
        fields[key as ConsultationField] =
          key === "captcha_token" ? contact.form.captcha_retry_message : value
      }
      const keys = Object.keys(fields)
      if (keys.length === 1 && keys[0] === "captcha_token") {
        return { message: contact.form.captcha_retry_message, fields }
      }
      return {
        message:
          keys.length > 0
            ? "Please check the highlighted fields and try again. Your details are still here."
            : "Please check the form and try again. Your details are still here.",
        fields,
      }
    }
    case 429:
      return {
        message: "Too many requests were sent. Please wait a moment and try again.",
        fields: {},
      }
    case 503:
      return {
        message: `Online requests are temporarily unavailable. Your details are still here, so please try again shortly, ${contactFallback}`,
        fields: {},
      }
    default:
      return { message: generic, fields: {} }
  }
}

function ConsultationForm({ apiUrl, turnstileSiteKey, contact }: ConsultationFormProps): React.JSX.Element {
  const baseUrl = apiUrl.trim().replace(/\/+$/, "")
  const formRef = useRef<HTMLFormElement>(null)
  const submittingRef = useRef(false)
  const [consent, setConsent] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaAvailable, setCaptchaAvailable] = useState(true)
  const [captchaResetKey, setCaptchaResetKey] = useState(0)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ConsultationField, string>>>({})
  const [status, setStatus] = useState<ConsultationFormStatus>({ state: "idle", message: "" })

  const apiConfigured = baseUrl !== ""
  const sending = status.state === "sending"
  const canSubmit = apiConfigured && captchaAvailable

  const handleTokenChange = useCallback((token: string | null) => {
    setCaptchaToken(token)
    if (token !== null) {
      setFieldErrors((current) => {
        if (!current.captcha_token) return current
        const next = { ...current }
        delete next.captcha_token
        return next
      })
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    if (submittingRef.current) return

    if (!form.checkValidity()) {
      form.reportValidity()
      return
    }

    if (!canSubmit) {
      setStatus({
        state: "error",
        message: `Online requests are unavailable right now. Please call ${contact.phone} or email ${contact.email}.`,
      })
      return
    }

    if (captchaToken === null || captchaToken === "") {
      setFieldErrors({ captcha_token: "Please complete the security check." })
      setStatus({
        state: "error",
        message: "Please complete the security check before sending your request.",
      })
      return
    }

    const data = new FormData(form)
    const value = (name: string): string => {
      const raw = data.get(name)
      return typeof raw === "string" ? raw.trim() : ""
    }
    const bestTime = value("best_time")
    const email = value("email")
    const message = value("message")
    const payload: ConsultationRequestInput = {
      name: value("name"),
      phone: value("phone"),
      ...(email !== "" ? { email } : {}),
      best_time: isBestTime(bestTime) ? bestTime : "Morning",
      ...(message !== "" ? { message } : {}),
      consent: true,
      captcha_token: captchaToken,
    }

    submittingRef.current = true
    setFieldErrors({})
    setStatus({ state: "sending", message: contact.form.sending_label })

    try {
      const response = await requestJson<unknown>(baseUrl, "/consultation-requests", {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        body: JSON.stringify(payload),
      })
      if (!isPendingResponse(response)) {
        throw new ApiError("The service returned an invalid response.", 502)
      }

      formRef.current?.reset()
      setConsent(false)
      setStatus({ state: "success", message: contact.form.success_message })
    } catch (error) {
      const { message: errorMessage, fields } = consultationError(error, contact)
      setFieldErrors(fields)
      setStatus({ state: "error", message: errorMessage })

      const firstField = CONSULTATION_FIELDS.find(
        (field): field is Exclude<ConsultationField, "captcha_token"> =>
          field !== "captcha_token" && Boolean(fields[field])
      )
      if (firstField) document.getElementById(CONSULTATION_FIELD_IDS[firstField])?.focus()
    } finally {
      submittingRef.current = false
      // Tokens are single-use: every attempt requires a fresh verification.
      setCaptchaToken(null)
      setCaptchaResetKey((key) => key + 1)
    }
  }

  const describedBy = (field: ConsultationField, extra?: string): string | undefined => {
    const ids = [extra, fieldErrors[field] ? `consult-${field}-error` : undefined].filter(Boolean)
    return ids.length > 0 ? ids.join(" ") : undefined
  }

  const fieldError = (field: ConsultationField): React.ReactNode =>
    fieldErrors[field] ? (
      <p id={`consult-${field}-error`} className="text-sm text-destructive">
        {fieldErrors[field]}
      </p>
    ) : null

  const invalid = (field: ConsultationField): true | undefined => (fieldErrors[field] ? true : undefined)

  return (
    <form
      ref={formRef}
      className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8 lg:p-10"
      onSubmit={handleSubmit}
      aria-describedby="consult-form-note"
      aria-busy={sending || undefined}
    >
      <p id="consult-form-note" className="mb-6 text-sm leading-6 text-muted-foreground">
        Name, phone and best time to call are required. Your details are used only to contact you
        about your consultation.
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-semibold" htmlFor="consult-name">
            {contact.form.name_label}
          </label>
          <Input
            id="consult-name"
            name="name"
            autoComplete="name"
            maxLength={80}
            required
            aria-invalid={invalid("name")}
            aria-describedby={describedBy("name")}
          />
          {fieldError("name")}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold" htmlFor="consult-phone">
            {contact.form.phone_label}
          </label>
          <Input
            id="consult-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            maxLength={64}
            required
            aria-invalid={invalid("phone")}
            aria-describedby={describedBy("phone")}
          />
          {fieldError("phone")}
        </div>
      </div>
      <div className="mt-5 space-y-2">
        <label className="text-sm font-semibold" htmlFor="consult-email">
          {contact.form.email_label}{" "}
          {contact.form.email_optional_label ? (
            <span className="font-normal text-muted-foreground">
              {contact.form.email_optional_label}
            </span>
          ) : null}
        </label>
        <Input
          id="consult-email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          aria-invalid={invalid("email")}
          aria-describedby={describedBy("email")}
        />
        {fieldError("email")}
      </div>
      <div className="mt-5 space-y-2">
        <label className="text-sm font-semibold" htmlFor="consult-time">
          {contact.form.best_time_label}
        </label>
        <select
          id="consult-time"
          name="best_time"
          required
          aria-invalid={invalid("best_time")}
          aria-describedby={describedBy("best_time")}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
        >
          {BEST_TIMES.map((time) => (
            <option key={time} value={time}>
              {time}
            </option>
          ))}
        </select>
        {fieldError("best_time")}
      </div>
      <div className="mt-5 space-y-2">
        <label className="text-sm font-semibold" htmlFor="consult-message">
          {contact.form.message_label}{" "}
          {contact.form.message_optional_label ? (
            <span className="font-normal text-muted-foreground">
              {contact.form.message_optional_label}
            </span>
          ) : null}
        </label>
        <Textarea
          id="consult-message"
          name="message"
          rows={4}
          maxLength={5000}
          aria-invalid={invalid("message")}
          aria-describedby={describedBy("message")}
        />
        {fieldError("message")}
      </div>

      <div className="mt-6 space-y-2">
        <div className="flex items-start gap-3">
          <input
            id="consult-consent"
            name="consent"
            type="checkbox"
            required
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            aria-invalid={invalid("consent")}
            aria-describedby={describedBy("consent", "consult-consent-privacy")}
            className="mt-1 size-4 shrink-0 cursor-pointer accent-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <label htmlFor="consult-consent" className="text-sm leading-6">
            {contact.form.consent_label}
          </label>
        </div>
        <p id="consult-consent-privacy" className="pl-7 text-xs leading-5 text-muted-foreground">
          Read the{" "}
          <a
            className="font-semibold text-foreground underline decoration-forge-gold decoration-2 underline-offset-4"
            href="/privacy"
          >
            privacy notice
          </a>
          , including how the Cloudflare security check works.
        </p>
        {fieldError("consent")}
      </div>

      {apiConfigured ? (
        <ConsultationCaptcha
          className="mt-6"
          siteKey={turnstileSiteKey}
          resetKey={captchaResetKey}
          onTokenChange={handleTokenChange}
          onAvailabilityChange={setCaptchaAvailable}
          invalid={Boolean(fieldErrors.captcha_token)}
        />
      ) : (
        <p className="mt-6 text-sm leading-6 text-destructive" role="status">
          Online consultation requests are unavailable right now. Please call{" "}
          <a
            className="font-semibold text-foreground underline underline-offset-4"
            href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`}
          >
            {contact.phone}
          </a>{" "}
          or email{" "}
          <a
            className="break-all font-semibold text-foreground underline underline-offset-4"
            href={`mailto:${contact.email}`}
          >
            {contact.email}
          </a>{" "}
          to book your free consultation.
        </p>
      )}
      {fieldError("captcha_token")}

      <button
        className={cn(buttonVariants({ variant: "outline", size: "lg" }), "mt-6 w-full")}
        type="submit"
        disabled={sending || !canSubmit}
      >
        {sending ? contact.form.sending_label : contact.form.submit_label}
      </button>

      <div role="status" aria-live="polite" className="mt-5 empty:hidden">
        {status.state === "success" ? (
          <Alert role="none">
            <AlertTitle>Request received</AlertTitle>
            <AlertDescription>{status.message}</AlertDescription>
          </Alert>
        ) : status.state === "error" ? (
          <Alert role="none" variant="destructive">
            <AlertTitle>Your request was not sent</AlertTitle>
            <AlertDescription>{status.message}</AlertDescription>
          </Alert>
        ) : status.state === "sending" ? (
          <p className="text-sm text-muted-foreground">{status.message}</p>
        ) : null}
      </div>
    </form>
  )
}

export function HomeSections({
  content,
  posts,
  resourcesUnavailable,
  apiUrl,
  turnstileSiteKey,
}: HomeSectionsProps): React.JSX.Element {
  const latestPosts = posts.slice(0, 3)
  const sentenceBreak = content.hero.heading.indexOf(". ")
  const headingLines =
    sentenceBreak === -1
      ? [content.hero.heading]
      : [
          content.hero.heading.slice(0, sentenceBreak + 1),
          content.hero.heading.slice(sentenceBreak + 2),
        ]
  const telephoneHref = `tel:${content.contact.phone.replace(/[^+\d]/g, "")}`

  return (
    <>
      <section className="overflow-hidden border-b border-border/80" aria-labelledby="hero-title">
        <div
          className={cn(
            containerClass,
            "grid min-h-[calc(100svh-5rem)] items-center gap-12 py-16 lg:grid-cols-[1.12fr_0.88fr] lg:py-20"
          )}
        >
          <div className="max-w-3xl">
            {content.hero.eyebrow ? (
              <p className="mb-5 text-xs font-bold uppercase tracking-[0.22em] text-primary">
                {content.hero.eyebrow}
              </p>
            ) : null}
            <h1 id="hero-title" className="text-5xl font-normal leading-[1.06] sm:text-6xl lg:text-7xl">
              {headingLines.map((line, lineIndex) => (
                <span key={`${lineIndex}-${line}`} className="block text-balance">
                  {line.split(/(forge)/gi).map((part, partIndex) =>
                    part.toLowerCase() === "forge" ? (
                      <span
                        key={`${partIndex}-${part}`}
                        className="font-semibold text-primary underline decoration-forge-gold decoration-1 underline-offset-[0.12em]"
                      >
                        {part}
                      </span>
                    ) : (
                      part
                    )
                  )}
                </span>
              ))}
            </h1>
            <p className="mt-7 max-w-[52ch] text-lg leading-8 text-muted-foreground">
              {content.hero.introduction}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a href="#contact" className={buttonVariants({ variant: "outline", size: "lg" })}>
                {content.hero.primary_cta_label}
              </a>
              <a href="#services" className={buttonVariants({ variant: "ghost", size: "lg" })}>
                {content.hero.secondary_cta_label}
              </a>
            </div>
            <ul
              className="mt-8 flex flex-wrap gap-2 text-xs font-semibold"
              aria-label="Credentials and service area"
            >
              {content.hero.credential_chips.map((chip, index) => (
                <li
                  key={`${chip}-${index}`}
                  className="rounded-sm border border-primary px-2.5 py-1 text-primary"
                >
                  {chip}
                </li>
              ))}
              <li className="rounded-sm bg-secondary px-2.5 py-1 text-secondary-foreground">
                {content.hero.location_chip}
              </li>
            </ul>
          </div>
          <figure
            className="relative min-h-[28rem] overflow-hidden rounded-[2rem] border bg-primary shadow-xl lg:min-h-[38rem]"
            role="img"
            aria-label={content.hero.image_alt}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_65%_20%,color-mix(in_oklab,var(--forge-gold)_45%,transparent),transparent_38%),linear-gradient(145deg,transparent_35%,color-mix(in_oklab,var(--forge-gold)_20%,transparent))]" />
          </figure>
        </div>
      </section>

      <section id="approach" className={sectionClass} aria-labelledby="approach-title">
        <div className={cn(containerClass, "grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20")}>
          <SectionHeading
            eyebrow={content.approach.eyebrow}
            title={content.approach.title}
            id="approach-title"
            description={content.approach.description}
          />
          <div className="divide-y divide-border border-y border-border">
            {content.approach.principles.map((principle, index) => (
              <article
                key={`${principle.title}-${index}`}
                className="grid grid-cols-[2.5rem_1fr] gap-5 py-7 sm:grid-cols-[3.5rem_1fr] sm:py-9"
              >
                <span className="font-serif text-2xl text-primary" aria-hidden="true">
                  {principle.marker}
                </span>
                <div>
                  <h3 className="text-2xl font-semibold sm:text-3xl">{principle.title}</h3>
                  <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
                    {principle.description}
                  </p>
                </div>
              </article>
            ))}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-9 gap-y-3 border-y border-forge-gold py-5 lg:col-span-2">
            <p className="font-serif text-2xl font-semibold">Care comes to you</p>
            <p className="flex flex-wrap items-baseline gap-x-4 gap-y-2 text-sm">
              <span>Home visits</span>
              <span className="text-forge-gold" aria-hidden="true">·</span>
              <span>At your gym or on-field</span>
              <span className="text-forge-gold" aria-hidden="true">·</span>
              <span className="text-muted-foreground">{content.approach.service_area}</span>
            </p>
          </div>
        </div>
      </section>

      <section
        id="services"
        className={cn(sectionClass, "bg-primary text-primary-foreground")}
        aria-labelledby="services-title"
      >
        <div className={containerClass}>
          <SectionHeading
            eyebrow={content.services.eyebrow}
            title={content.services.title}
            id="services-title"
            eyebrowClassName="text-forge-gold"
          />
          <div className="mt-14 grid border-t border-primary-foreground/20 md:grid-cols-2">
            {content.services.items.map((service, index) => (
              <article
                key={`${service.number}-${index}`}
                className="grid grid-cols-[2.5rem_1fr] gap-4 border-b border-primary-foreground/20 py-7 md:px-7 md:odd:border-r lg:grid-cols-[3rem_1fr] lg:py-9"
              >
                <span className="font-serif text-xl text-forge-gold">{service.number}</span>
                <div>
                  <h3 className="text-2xl font-semibold">{service.title}</h3>
                  <p className="mt-3 leading-7 text-primary-foreground/70">{service.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="about" className={sectionClass} aria-labelledby="about-title">
        <div
          className={cn(
            containerClass,
            "grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20"
          )}
        >
          <figure
            className="min-h-[28rem] rounded-[2rem] border bg-[linear-gradient(145deg,var(--secondary),var(--accent))] shadow-sm lg:min-h-[40rem]"
            role="img"
            aria-label={content.about.portrait_alt}
          />
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-primary">
              {content.about.eyebrow}
            </p>
            <div className="border-b border-border pb-6">
              <h2 id="about-title" className="text-4xl font-semibold leading-none sm:text-6xl">
                {content.about.title || content.about.name}
              </h2>
              {content.about.title ? (
                <p className="mt-4 font-serif text-2xl font-semibold">{content.about.name}</p>
              ) : null}
              <p className="mt-4 text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {content.about.suffix} · {content.about.role}
              </p>
            </div>
            <p className="py-7 text-lg leading-8 text-muted-foreground">{content.about.biography}</p>
            <dl className="divide-y divide-border border-y border-border">
              {content.about.credentials.map((item, index) => (
                <div
                  key={`${item.credential}-${index}`}
                  className="flex items-start justify-between gap-6 py-4"
                >
                  <dt className="font-semibold">{item.credential}</dt>
                  <dd className="shrink-0 text-sm text-muted-foreground">{item.label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section
        id="pricing"
        className={cn(sectionClass, "bg-secondary/55")}
        aria-labelledby="pricing-title"
      >
        <div className={containerClass}>
          <div className="grid gap-8 lg:grid-cols-2 lg:items-end">
            <SectionHeading
              eyebrow={content.pricing.eyebrow}
              title={content.pricing.title}
              id="pricing-title"
            />
            <p className="max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">
              {content.pricing.description}
            </p>
          </div>
          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {content.pricing.items.map((item, index) => (
              <Card
                key={`${item.step}-${index}`}
                className={cn(
                  "h-full",
                  item.featured ? "border-primary bg-primary text-primary-foreground shadow-lg" : ""
                )}
              >
                <CardHeader>
                  <p
                    className={cn(
                      "text-xs font-bold uppercase tracking-[0.2em] text-primary",
                      item.featured ? "text-forge-gold" : ""
                    )}
                  >
                    {item.step}
                  </p>
                  <CardTitle>
                    <h3 className="mt-3 text-2xl leading-tight">{item.title}</h3>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1">
                  <p className="font-serif text-5xl font-semibold">
                    {item.price}{" "}
                    {item.detail ? (
                      <small className="font-sans text-sm font-medium opacity-70">{item.detail}</small>
                    ) : null}
                  </p>
                  <CardDescription
                    className={cn(
                      "mt-5 text-base leading-7",
                      item.featured ? "text-primary-foreground/75" : ""
                    )}
                  >
                    {item.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="reviews" className={sectionClass} aria-labelledby="reviews-title">
        <div className={containerClass}>
          <SectionHeading
            eyebrow={content.testimonials.eyebrow}
            title={content.testimonials.title}
            id="reviews-title"
          />
          <div className="mt-14 grid gap-8 lg:grid-cols-3">
            {content.testimonials.items.map((testimonial, index) => (
              <figure
                key={`${testimonial.attribution}-${index}`}
                className="flex h-full flex-col border-t-2 border-primary pt-7"
              >
                <blockquote className="flex-1 font-serif text-2xl leading-9">
                  “{testimonial.quote}”
                </blockquote>
                <figcaption className="mt-7 text-sm text-muted-foreground">
                  — {testimonial.attribution}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section
        id="resources"
        className={cn(sectionClass, "bg-card")}
        aria-labelledby="resources-title"
      >
        <div className={containerClass}>
          <div className="flex flex-col justify-between gap-8 sm:flex-row sm:items-end">
            <SectionHeading
              eyebrow={content.resources.eyebrow}
              title={content.resources.title}
              id="resources-title"
              description={content.resources.description || undefined}
            />
            <a href="/resources/" className={cn(buttonVariants({ variant: "ghost" }), "w-fit")}>
              {content.resources.all_resources_label}{" "}
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </div>
          {resourcesUnavailable ? (
            <Alert className="mt-12">
              <AlertTitle>Resources are temporarily unavailable</AlertTitle>
              <AlertDescription>{content.resources.unavailable_message}</AlertDescription>
            </Alert>
          ) : latestPosts.length === 0 ? (
            <div className="mt-12 rounded-xl border border-dashed p-8 text-muted-foreground">
              <p>{content.resources.empty_message}</p>
            </div>
          ) : (
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {latestPosts.map((post) => {
                const formattedDate = formatPostDate(post.published_at)
                const postHref = `/resources/${encodeURIComponent(post.slug)}`
                return (
                  <Card key={post.id} className="h-full">
                    <CardHeader>
                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                        <span>{post.category || content.resources.category_fallback}</span>
                        {formattedDate ? (
                          <time dateTime={post.published_at || undefined}>{formattedDate}</time>
                        ) : null}
                      </div>
                      <CardTitle>
                        <h3 className="mt-4 text-2xl leading-tight">
                          <a className="rounded-sm hover:text-primary" href={postHref}>
                            {post.title || "Untitled resource"}
                          </a>
                        </h3>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <CardDescription className="text-base leading-7">
                        {post.excerpt || ""}
                      </CardDescription>
                    </CardContent>
                    <CardFooter className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
                      <span>By {post.author_name || content.about.name}</span>
                      <a className="inline-flex items-center gap-1 font-semibold text-foreground" href={postHref}>
                        {content.resources.read_article_label}
                        <ArrowRight className="size-3.5" aria-hidden="true" />
                      </a>
                    </CardFooter>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <section id="faq" className={sectionClass} aria-labelledby="faq-title">
        <div className={cn(containerClass, "grid gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:gap-20")}>
          <div>
            <SectionHeading
              eyebrow={content.faq.eyebrow}
              title={content.faq.title}
              id="faq-title"
            />
            <p className="mt-6 text-muted-foreground">
              {content.faq.cta_prefix}{" "}
              <a
                className="font-semibold text-foreground underline decoration-forge-gold decoration-2 underline-offset-4"
                href="#contact"
              >
                {content.faq.cta_label}
              </a>
            </p>
          </div>
          <div className="divide-y divide-border border-y border-border">
            {content.faq.items.map((faq, index) => (
              <details key={`${faq.question}-${index}`} className="group py-6" open={index === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-sm font-serif text-xl font-semibold marker:hidden sm:text-2xl">
                  {faq.question}
                  <span
                    className="text-2xl font-normal text-primary transition-transform group-open:rotate-45"
                    aria-hidden="true"
                  >
                    +
                  </span>
                </summary>
                <p className="max-w-2xl whitespace-pre-wrap pt-4 leading-7 text-muted-foreground">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section
        id="contact"
        className={cn(sectionClass, "bg-secondary/55")}
        aria-labelledby="contact-title"
      >
        <div className={cn(containerClass, "grid gap-12 lg:grid-cols-2 lg:gap-20")}>
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-primary">
              {content.contact.eyebrow}
            </p>
            <h2 id="contact-title" className="text-4xl font-semibold leading-[1.05] sm:text-6xl">
              {content.contact.title}
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
              {content.contact.description}
            </p>
            <div className="mt-10 grid gap-6 border-t border-border pt-8 sm:grid-cols-2">
              <div className="flex gap-3">
                <Phone className="mt-1 size-5 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Phone
                  </p>
                  <a className="mt-1 block font-semibold" href={telephoneHref}>
                    {content.contact.phone}
                  </a>
                </div>
              </div>
              <div className="flex gap-3">
                <Mail className="mt-1 size-5 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Email
                  </p>
                  <a
                    className="mt-1 block break-all font-semibold"
                    href={`mailto:${content.contact.email}`}
                  >
                    {content.contact.email}
                  </a>
                </div>
              </div>
              <div className="flex gap-3">
                <MapPin className="mt-1 size-5 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Service area
                  </p>
                  <p className="mt-1 font-semibold">{content.contact.service_area}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <MapPin className="mt-1 size-5 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Where
                  </p>
                  <p className="mt-1 font-semibold">{content.contact.venue}</p>
                </div>
              </div>
            </div>
          </div>
          <ConsultationForm
            apiUrl={apiUrl}
            turnstileSiteKey={turnstileSiteKey}
            contact={content.contact}
          />
        </div>
      </section>
    </>
  )
}
