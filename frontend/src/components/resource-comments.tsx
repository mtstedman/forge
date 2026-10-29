import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ApiError, requestJson } from "@/lib/api"
import { displayDate, isoDate, text } from "@/lib/resource-seo"
import type { PublicComment } from "@/lib/types"
import { cn } from "@/lib/utils"

/*
 * Approved comments are rendered on the server and refreshed from the public
 * API after hydration. All user-supplied text is rendered as React text nodes;
 * no HTML strings are ever built from comment data.
 */

type ResourceCommentsProps = {
  apiUrl: string
  slug: string
  initialComments: PublicComment[]
  commentsEnabled: boolean
}

type FieldName = "author_name" | "author_email" | "body"
type FormStatus = { state: "idle" | "sending" | "success" | "error"; message: string }

const FIELD_NAMES: readonly FieldName[] = ["author_name", "author_email", "body"]

function normalizeComments(value: unknown): PublicComment[] | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null
  const data = (value as { data?: unknown }).data
  if (!Array.isArray(data)) return null

  return data
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
    .map((item) => ({
      id: typeof item.id === "number" ? item.id : Number(item.id) || 0,
      author_name: typeof item.author_name === "string" ? item.author_name : "",
      body: typeof item.body === "string" ? item.body : "",
      created_at: typeof item.created_at === "string" ? item.created_at : "",
    }))
}

function submissionError(error: unknown): { message: string; fields: Partial<Record<FieldName, string>> } {
  if (!(error instanceof ApiError)) {
    return { message: "Your comment could not be sent. Please try again later.", fields: {} }
  }

  switch (error.status) {
    case 0:
      return {
        message: "Your comment could not be sent. Please check your connection and try again.",
        fields: {},
      }
    case 422: {
      const fields: Partial<Record<FieldName, string>> = {}
      const parts: string[] = []
      for (const [key, message] of Object.entries(error.fields)) {
        if (message === "") continue
        parts.push(message)
        if ((FIELD_NAMES as readonly string[]).includes(key)) fields[key as FieldName] = message
      }
      if (parts.length === 0 && error.message !== "" && error.message !== "Validation failed.") {
        parts.push(error.message)
      }
      return {
        message:
          parts.length > 0
            ? `Please check your comment: ${parts.join(" ")}`
            : "Please check the form and try again.",
        fields,
      }
    }
    case 429:
      return {
        message: "You are posting too quickly. Please wait a moment and try again.",
        fields: {},
      }
    case 403:
      return { message: "Comments are closed for this resource.", fields: {} }
    case 404:
      return { message: "This resource is no longer available.", fields: {} }
    default:
      return { message: "Your comment could not be sent. Please try again later.", fields: {} }
  }
}

function CommentItem({ comment }: { comment: PublicComment }): React.JSX.Element {
  const created = isoDate(comment.created_at)
  return (
    <li className="flex flex-col gap-2 border-b py-5 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <strong className="text-sm font-semibold text-foreground">
          {text(comment.author_name, "Anonymous")}
        </strong>
        {created !== "" ? (
          <time dateTime={created}>{displayDate(comment.created_at)}</time>
        ) : null}
      </div>
      <p className="whitespace-pre-line leading-7">{text(comment.body)}</p>
    </li>
  )
}

export function ResourceComments({
  apiUrl,
  slug,
  initialComments,
  commentsEnabled,
}: ResourceCommentsProps): React.JSX.Element {
  const [comments, setComments] = React.useState<PublicComment[]>(initialComments)
  const [refreshing, setRefreshing] = React.useState(false)
  const [status, setStatus] = React.useState<FormStatus>({ state: "idle", message: "" })
  const [fieldErrors, setFieldErrors] = React.useState<Partial<Record<FieldName, string>>>({})
  const formRef = React.useRef<HTMLFormElement>(null)

  const baseUrl = apiUrl.trim().replace(/\/+$/, "")
  const endpoint = `/posts/${encodeURIComponent(slug)}/comments`

  React.useEffect(() => {
    if (baseUrl === "" || slug === "") return
    const controller = new AbortController()
    setRefreshing(true)

    requestJson<unknown>(baseUrl, endpoint, {
      method: "GET",
      credentials: "omit",
      signal: controller.signal,
    })
      .then((payload) => {
        const refreshed = normalizeComments(payload)
        if (refreshed !== null && !controller.signal.aborted) setComments(refreshed)
      })
      .catch(() => {
        // Keep the server-rendered comments when the API cannot be reached.
      })
      .finally(() => {
        if (!controller.signal.aborted) setRefreshing(false)
      })

    return () => controller.abort()
  }, [baseUrl, endpoint, slug])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    if (status.state === "sending") return

    if (!form.checkValidity()) {
      form.reportValidity()
      setStatus({
        state: "error",
        message: "Please fill in your name, a valid email and your comment.",
      })
      return
    }

    const data = new FormData(form)
    const value = (name: string): string => {
      const raw = data.get(name)
      return typeof raw === "string" ? raw : ""
    }
    const payload = {
      author_name: value("author_name").trim(),
      author_email: value("author_email").trim(),
      body: value("body").trim(),
      website: value("website"),
    }

    setFieldErrors({})
    setStatus({ state: "sending", message: "Sending…" })

    try {
      if (baseUrl === "") throw new ApiError("The API is not configured.", 503)
      await requestJson<unknown>(baseUrl, endpoint, {
        method: "POST",
        credentials: "omit",
        body: JSON.stringify(payload),
      })
      formRef.current?.reset()
      setStatus({
        state: "success",
        message: "Thanks! Your comment is awaiting moderation and will appear once approved.",
      })
    } catch (error) {
      const { message, fields } = submissionError(error)
      setFieldErrors(fields)
      setStatus({ state: "error", message })
    }
  }

  const describedBy = (name: FieldName): string | undefined =>
    fieldErrors[name] ? `comment-${name}-error` : undefined

  const fieldError = (name: FieldName): React.ReactNode =>
    fieldErrors[name] ? (
      <p id={`comment-${name}-error`} className="text-sm text-destructive">
        {fieldErrors[name]}
      </p>
    ) : null

  return (
    <section
      id="comments"
      aria-labelledby="comments-title"
      className="flex flex-col gap-5 border-t pt-8"
    >
      <h2 id="comments-title" className="text-3xl font-semibold leading-tight sm:text-4xl">
        Comments <span className="text-muted-foreground">({comments.length})</span>
      </h2>

      {comments.length === 0 ? (
        <p className="text-muted-foreground">No comments yet.</p>
      ) : (
        <ol className="flex flex-col" aria-busy={refreshing || undefined}>
          {comments.map((comment, index) => (
            <CommentItem key={`${comment.id}-${index}`} comment={comment} />
          ))}
        </ol>
      )}

      {commentsEnabled ? (
        <form
          ref={formRef}
          data-comment-form
          noValidate
          onSubmit={handleSubmit}
          className="relative mt-4 flex flex-col gap-5 rounded-xl border bg-card p-6 shadow-sm"
        >
          <div className="flex flex-col gap-1.5">
            <h3 className="text-2xl font-semibold">Leave a comment</h3>
            <p className="text-sm text-muted-foreground">
              Comments are reviewed before they appear. Your email is never published.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="comment-name" className="text-sm font-semibold">
                Name
              </label>
              <Input
                id="comment-name"
                name="author_name"
                type="text"
                autoComplete="name"
                maxLength={100}
                required
                aria-invalid={fieldErrors.author_name ? true : undefined}
                aria-describedby={describedBy("author_name")}
              />
              {fieldError("author_name")}
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="comment-email" className="text-sm font-semibold">
                Email
              </label>
              <Input
                id="comment-email"
                name="author_email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                aria-invalid={fieldErrors.author_email ? true : undefined}
                aria-describedby={describedBy("author_email")}
              />
              {fieldError("author_email")}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="comment-body" className="text-sm font-semibold">
              Comment
            </label>
            <Textarea
              id="comment-body"
              name="body"
              rows={5}
              maxLength={5000}
              required
              aria-invalid={fieldErrors.body ? true : undefined}
              aria-describedby={describedBy("body")}
            />
            {fieldError("body")}
          </div>

          {/* Honeypot: hidden from people and assistive technology, left for bots to fill. */}
          <div
            aria-hidden="true"
            className="absolute size-px overflow-hidden whitespace-nowrap [clip-path:inset(50%)]"
          >
            <label htmlFor="comment-website">Website</label>
            <input id="comment-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
          </div>

          <p
            role="status"
            aria-live="polite"
            data-state={status.state === "idle" ? undefined : status.state}
            className={cn(
              "min-h-6 text-sm",
              status.state === "error" ? "text-destructive" : "text-primary"
            )}
          >
            {status.message}
          </p>

          <div>
            <Button type="submit" variant="outline" disabled={status.state === "sending"}>
              {status.state === "sending" ? "Sending…" : "Post comment"}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  )
}
