"use client"

import {
  Check,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { useAdminAuth } from "@/components/admin/auth-provider"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ApiEnvelope } from "@/lib/types"
import { cn } from "@/lib/utils"

type CommentStatus = "pending" | "approved" | "rejected"
type LoadState = "loading" | "ready" | "error"
type Notice = { kind: "success" | "error"; message: string }

type AdminComment = {
  id: number
  author_name: string
  body: string
  status: CommentStatus
  created_at: string
  post_slug: string | null
  post_title: string | null
}

type CommentsResponse = ApiEnvelope<unknown> & {
  meta?: { page?: unknown; per_page?: unknown }
}

const FILTERS: Array<{ value: CommentStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
]
const FALLBACK_PER_PAGE = 20

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== "" ? error.message : fallback
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function positiveInteger(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function normalizeComment(value: unknown): AdminComment | null {
  const row = recordOf(value)
  if (!row) return null
  const id = positiveInteger(row.id)
  if (id === null) return null

  const status: CommentStatus =
    row.status === "approved" || row.status === "rejected" ? row.status : "pending"

  return {
    id,
    author_name: typeof row.author_name === "string" ? row.author_name : "",
    body: typeof row.body === "string" ? row.body : "",
    status,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    post_slug: typeof row.post_slug === "string" ? row.post_slug : null,
    post_title: typeof row.post_title === "string" ? row.post_title : null,
  }
}

function formatDate(value: string): string {
  if (value === "") return "Date unavailable"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function statusLabel(status: CommentStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function postLabel(comment: AdminComment): string {
  return comment.post_title || comment.post_slug || "Unknown post"
}

export function CommentsPanel(): React.JSX.Element {
  const { request, status } = useAdminAuth()
  const authenticated = status === "authenticated"
  const [filter, setFilter] = useState<CommentStatus>("pending")
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(FALLBACK_PER_PAGE)
  const [comments, setComments] = useState<AdminComment[]>([])
  const [loadState, setLoadState] = useState<LoadState>("loading")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const loadRequestRef = useRef(0)

  const [busyId, setBusyId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminComment | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    if (!authenticated) {
      loadRequestRef.current += 1
      setComments([])
      return
    }

    const requestId = ++loadRequestRef.current
    setLoadState("loading")
    setLoadError(null)

    request<CommentsResponse>(
      `/admin/comments?status=${encodeURIComponent(filter)}&page=${encodeURIComponent(page)}`
    )
      .then((payload) => {
        if (requestId !== loadRequestRef.current) return
        const rows = Array.isArray(payload?.data) ? payload.data : []
        setComments(rows.flatMap((row) => normalizeComment(row) ?? []))
        setPerPage(positiveInteger(payload?.meta?.per_page) ?? FALLBACK_PER_PAGE)
        setLoadState("ready")
      })
      .catch((error: unknown) => {
        if (requestId !== loadRequestRef.current) return
        setLoadError(errorText(error, "Comments could not be loaded."))
        setLoadState("error")
      })
  }, [authenticated, filter, page, reloadToken, request])

  const refresh = () => setReloadToken((token) => token + 1)

  const finishMutation = (message: string) => {
    setNotice({ kind: "success", message })
    if (comments.length === 1 && page > 1) setPage((current) => Math.max(1, current - 1))
    else refresh()
  }

  const moderate = async (comment: AdminComment, nextStatus: CommentStatus) => {
    if (busyId !== null || !authenticated || comment.status === nextStatus) return
    setBusyId(comment.id)
    setNotice(null)

    try {
      await request<ApiEnvelope<unknown>>(`/admin/comments/${encodeURIComponent(comment.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      })
      finishMutation(`Comment ${nextStatus}.`)
    } catch (error) {
      setNotice({
        kind: "error",
        message: errorText(error, `The comment could not be marked ${nextStatus}.`),
      })
    } finally {
      setBusyId(null)
    }
  }

  const deleteComment = async () => {
    if (!deleteTarget || busyId !== null || !authenticated) return
    const target = deleteTarget
    setBusyId(target.id)
    setNotice(null)

    try {
      await request<undefined>(`/admin/comments/${encodeURIComponent(target.id)}`, {
        method: "DELETE",
      })
      setDeleteTarget(null)
      finishMutation("Comment deleted.")
    } catch (error) {
      setNotice({
        kind: "error",
        message: errorText(error, "The comment could not be deleted."),
      })
    } finally {
      setBusyId(null)
    }
  }

  if (!authenticated) return <></>

  const hasNextPage = loadState === "ready" && comments.length >= perPage

  return (
    <section className="space-y-6" aria-labelledby="comments-heading">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Community</p>
          <h2 id="comments-heading" className="font-serif text-3xl font-semibold tracking-tight">
            Comment moderation
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Review submitted comments and control which responses appear publicly.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <label htmlFor="comment-status-filter" className="text-sm font-medium">
              Queue
            </label>
            <select
              id="comment-status-filter"
              value={filter}
              className="flex h-9 min-w-44 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onChange={(event) => {
                setFilter(event.currentTarget.value as CommentStatus)
                setPage(1)
                setNotice(null)
              }}
            >
              {FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <Button variant="outline" onClick={refresh} disabled={loadState === "loading"}>
            <RefreshCw className={loadState === "loading" ? "animate-spin" : undefined} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </div>

      {notice ? (
        <Alert variant={notice.kind === "error" ? "destructive" : "default"} aria-live="polite">
          {notice.kind === "error" ? (
            <CircleAlert aria-hidden="true" />
          ) : (
            <CheckCircle2 aria-hidden="true" />
          )}
          <AlertTitle>{notice.kind === "error" ? "Moderation action failed" : "Queue updated"}</AlertTitle>
          <AlertDescription>{notice.message}</AlertDescription>
        </Alert>
      ) : null}

      {loadState === "loading" ? (
        <Card aria-busy="true">
          <CardContent className="flex min-h-48 items-center justify-center gap-3 text-sm text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
            Loading comments…
          </CardContent>
        </Card>
      ) : loadState === "error" ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Comments could not be loaded</AlertTitle>
          <AlertDescription className="gap-3">
            <p>{loadError}</p>
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw aria-hidden="true" />
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : comments.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-full bg-muted p-3 text-muted-foreground">
              <MessageSquare className="size-6" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-serif text-xl font-semibold">No comments in this queue</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                There are no {filter} comments on page {page}.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4" aria-label={`${statusLabel(filter)} comments`}>
          {comments.map((comment) => {
            const isBusy = busyId === comment.id
            return (
              <Card key={comment.id}>
                <CardHeader className="gap-3 sm:grid-cols-[1fr_auto] sm:grid-rows-1">
                  <div className="min-w-0">
                    <CardTitle className="font-serif text-xl">
                      {comment.author_name || "Anonymous"}
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{postLabel(comment)}</span>
                      <span aria-hidden="true"> · </span>
                      {formatDate(comment.created_at)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex h-fit w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
                      comment.status === "approved"
                        ? "border-emerald-700/25 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300"
                        : comment.status === "rejected"
                          ? "border-destructive/25 bg-destructive/10 text-destructive"
                          : "border-amber-700/25 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                    )}
                  >
                    {statusLabel(comment.status)}
                  </span>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap break-words text-sm leading-7">{comment.body}</p>
                </CardContent>
                <CardFooter className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => void moderate(comment, "approved")}
                    disabled={busyId !== null || comment.status === "approved"}
                  >
                    {isBusy ? (
                      <LoaderCircle className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Check aria-hidden="true" />
                    )}
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void moderate(comment, "rejected")}
                    disabled={busyId !== null || comment.status === "rejected"}
                  >
                    {isBusy ? (
                      <LoaderCircle className="animate-spin" aria-hidden="true" />
                    ) : (
                      <X aria-hidden="true" />
                    )}
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteTarget(comment)}
                    disabled={busyId !== null}
                  >
                    <Trash2 aria-hidden="true" />
                    Delete
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}

      <nav className="flex items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3 shadow-sm" aria-label="Comment pages">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1 || loadState === "loading"}
          onClick={() => {
            setPage((current) => Math.max(1, current - 1))
            setNotice(null)
          }}
        >
          Previous
        </Button>
        <span className="text-sm font-medium" aria-live="polite">
          Page {page}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasNextPage}
          onClick={() => {
            setPage((current) => current + 1)
            setNotice(null)
          }}
        >
          Next
        </Button>
      </nav>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && busyId === null) setDeleteTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete comment?</DialogTitle>
            <DialogDescription>
              This comment from {deleteTarget?.author_name || "Anonymous"} will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={busyId !== null}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={deleteComment} disabled={busyId !== null}>
              {busyId !== null ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
              {busyId !== null ? "Deleting…" : "Delete comment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
