"use client"

import { CheckCircle2, CircleAlert, FileText, Plus, RefreshCw, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { useAdminAuth } from "@/components/admin/auth-provider"
import {
  markdownSafeUrl,
  type PostBodyEditorHandle,
  type PostBodyImage,
} from "@/components/admin/post-body-editor"
import {
  FORM_FIELD_TO_API,
  PostEditor,
  commitPostFormDrafts,
  emptyPostForm,
  normalizeAdminPost,
  postFormFromPost,
  postPayload,
  validatePostForm,
  type AdminPost,
  type EditorBusy,
  type PostFieldErrors,
  type PostFormValues,
  type PostStatus,
} from "@/components/admin/post-editor"
import {
  mergeTaxonomyVocabulary,
  uniqueTaxonomyValues,
} from "@/components/admin/taxonomy-input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ApiError } from "@/lib/api"
import type { ApiEnvelope, MediaItem } from "@/lib/types"
import { cn } from "@/lib/utils"

type Notice = { kind: "success" | "error"; message: string }
type LoadState = "loading" | "ready" | "error"

const STATUS_FILTERS: Array<{ value: PostStatus; label: string }> = [
  { value: "draft", label: "Drafts" },
  { value: "published", label: "Published" },
]

const INVALID_POST = "The service returned an invalid post."

function errorText(error: unknown, fallback = "Something went wrong."): string {
  return error instanceof Error && error.message !== "" ? error.message : fallback
}

function normalizeMediaItem(raw: unknown): MediaItem | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const id = typeof row.id === "number" ? row.id : Number(row.id)
  if (!Number.isInteger(id) || typeof row.url !== "string") return null
  const optionalNumber = (value: unknown): number | null => {
    const parsed = typeof value === "number" ? value : value == null || value === "" ? NaN : Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return {
    id,
    url: row.url,
    original_name: typeof row.original_name === "string" ? row.original_name : "",
    mime_type: typeof row.mime_type === "string" ? row.mime_type : "",
    size_bytes: optionalNumber(row.size_bytes) ?? 0,
    width: optionalNumber(row.width),
    height: optionalNumber(row.height),
    alt_text: typeof row.alt_text === "string" ? row.alt_text : null,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
  }
}

/**
 * Builds the editor image for a media item: a safe http(s)/relative source (serialized as
 * `![alt](url)`) and normalized alt text, or null when the URL cannot be inserted safely.
 */
function imageForMedia(media: MediaItem): PostBodyImage | null {
  const src = markdownSafeUrl(media.url)
  if (src === null) return null
  const altText = (media.alt_text ?? "")
    .replace(/[\[\]\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  return { src, altText }
}

function formatDate(value: string | null): string {
  if (!value) return "Not yet"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export function PostWorkspace({
  insertImage,
  onImageInserted,
}: {
  insertImage: MediaItem | null
  onImageInserted: () => void
}): React.JSX.Element {
  const { request, status } = useAdminAuth()
  const authenticated = status === "authenticated"

  const [filter, setFilter] = useState<PostStatus>("draft")
  const [reloadToken, setReloadToken] = useState(0)
  const [posts, setPosts] = useState<AdminPost[]>([])
  const [listState, setListState] = useState<LoadState>("loading")
  const [listError, setListError] = useState<string | null>(null)
  const listRequestRef = useRef(0)

  const [media, setMedia] = useState<MediaItem[]>([])
  const [mediaState, setMediaState] = useState<LoadState>("loading")
  const [mediaError, setMediaError] = useState<string | null>(null)
  const mediaRequestRef = useRef(0)

  const [taxonomy, setTaxonomy] = useState<{ categories: string[]; tags: string[] }>({
    categories: [],
    tags: [],
  })

  const [form, setForm] = useState<PostFormValues>(() => emptyPostForm())
  const [fieldErrors, setFieldErrors] = useState<PostFieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState<EditorBusy>(null)

  const editorRef = useRef<HTMLDivElement>(null)
  const bodyEditorRef = useRef<PostBodyEditorHandle>(null)
  /** Bumped whenever the body editor must load new content with fresh selection and history. */
  const [bodyKey, setBodyKey] = useState(0)
  const handledInsertRef = useRef<MediaItem | null>(null)

  /* ---------- Loading ---------- */

  useEffect(() => {
    if (!authenticated) return
    const requestId = ++listRequestRef.current
    setListState("loading")
    setListError(null)
    request<ApiEnvelope<unknown>>(`/admin/posts?status=${encodeURIComponent(filter)}`)
      .then((payload) => {
        if (requestId !== listRequestRef.current) return
        const data: unknown = payload?.data
        const rows: unknown[] = Array.isArray(data) ? data : []
        setPosts(rows.flatMap((row) => normalizeAdminPost(row) ?? []))
        setListState("ready")
      })
      .catch((error: unknown) => {
        if (requestId !== listRequestRef.current) return
        setListError(errorText(error, "Posts could not be loaded."))
        setListState("error")
      })
  }, [authenticated, filter, reloadToken, request])

  const refreshPosts = useCallback((nextFilter?: PostStatus) => {
    if (nextFilter) setFilter(nextFilter)
    setReloadToken((token) => token + 1)
  }, [])

  const loadMedia = useCallback(async () => {
    const requestId = ++mediaRequestRef.current
    setMediaState("loading")
    setMediaError(null)
    try {
      const payload = await request<ApiEnvelope<unknown>>("/admin/media")
      if (requestId !== mediaRequestRef.current) return
      const data: unknown = payload?.data
      const rows: unknown[] = Array.isArray(data) ? data : []
      setMedia(rows.flatMap((row) => normalizeMediaItem(row) ?? []))
      setMediaState("ready")
    } catch (error) {
      if (requestId !== mediaRequestRef.current) return
      setMediaError(errorText(error, "Images could not be loaded."))
      setMediaState("error")
    }
  }, [request])

  useEffect(() => {
    if (!authenticated) return
    void loadMedia()
  }, [authenticated, loadMedia])

  useEffect(() => {
    if (!authenticated) return
    let cancelled = false
    request<ApiEnvelope<unknown>>("/admin/taxonomy")
      .then((payload) => {
        if (cancelled) return
        const raw: unknown = payload?.data
        const data: Record<string, unknown> =
          raw !== null && typeof raw === "object" && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : {}
        setTaxonomy((current) => ({
          categories: mergeTaxonomyVocabulary(current.categories, uniqueTaxonomyValues(data.categories)),
          tags: mergeTaxonomyVocabulary(current.tags, uniqueTaxonomyValues(data.tags)),
        }))
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setNotice({
          kind: "error",
          message: `Saved categories and tags could not be loaded: ${errorText(error)}`,
        })
      })
    return () => {
      cancelled = true
    }
  }, [authenticated, request])

  /* ---------- Form state ---------- */

  /**
   * Loads a server post into the form. Opening a post always reloads the body editor; after a
   * save the editor (and its selection/undo history) is kept unless the stored body differs.
   */
  const applyPost = useCallback((post: AdminPost, replaceBody = false) => {
    const currentBody = bodyEditorRef.current?.getMarkdown()
    setForm(postFormFromPost(post))
    if (replaceBody || currentBody !== post.body_markdown) setBodyKey((key) => key + 1)
    setFieldErrors({})
    setFormError(null)
    setTaxonomy((current) => ({
      categories: mergeTaxonomyVocabulary(current.categories, post.categories),
      tags: mergeTaxonomyVocabulary(current.tags, post.tags),
    }))
  }, [])

  const updateForm = useCallback((patch: Partial<PostFormValues>) => {
    setForm((current) => ({ ...current, ...patch }))
    const fields = new Set(
      (Object.keys(patch) as Array<keyof PostFormValues>).flatMap((key) => {
        const field = FORM_FIELD_TO_API[key]
        return field ? (field === "categories" ? [field, "category"] : [field]) : []
      })
    )
    if (fields.size === 0) return
    setFieldErrors((current) => {
      if (!Object.keys(current).some((field) => fields.has(field))) return current
      const next: PostFieldErrors = {}
      for (const [field, message] of Object.entries(current)) {
        if (!fields.has(field)) next[field] = message
      }
      return next
    })
  }, [])

  const reportMutationError = (error: unknown, prefix?: string) => {
    const message = errorText(error)
    setFormError(prefix ? `${prefix} ${message}` : message)
    setFieldErrors(error instanceof ApiError ? { ...error.fields } : {})
  }

  const scrollEditorIntoView = () => {
    if (typeof window === "undefined") return
    if (window.matchMedia("(max-width: 1023px)").matches) {
      editorRef.current?.scrollIntoView({ block: "start" })
    }
  }

  const startNewPost = () => {
    setNotice(null)
    setForm(emptyPostForm())
    setBodyKey((key) => key + 1)
    setFieldErrors({})
    setFormError(null)
    scrollEditorIntoView()
    requestAnimationFrame(() => document.getElementById("post-title")?.focus())
  }

  const openPost = async (id: number) => {
    setNotice(null)
    setBusy("loading")
    scrollEditorIntoView()
    try {
      const payload = await request<ApiEnvelope<unknown>>(`/admin/posts/${encodeURIComponent(id)}`)
      const post = normalizeAdminPost(payload?.data)
      if (!post) throw new Error(INVALID_POST)
      applyPost(post, true)
    } catch (error) {
      setNotice({ kind: "error", message: errorText(error, "The post could not be opened.") })
    } finally {
      setBusy(null)
    }
  }

  /**
   * Commits taxonomy drafts and validates locally. Returns the committed form, or null when the
   * form is invalid (field errors are shown and no request is made).
   */
  const prepareForm = (): PostFormValues | null => {
    // The editor reports changes as they commit; read its latest body so nothing typed is missed.
    const latestBody = bodyEditorRef.current?.getMarkdown()
    const committed = commitPostFormDrafts(
      latestBody === undefined ? form : { ...form, body_markdown: latestBody }
    )
    setForm(committed)
    setNotice(null)
    const errors = validatePostForm(committed)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setFormError("Fix the highlighted fields before saving.")
      const first = errors.title ? "post-title" : "post-slug"
      requestAnimationFrame(() => document.getElementById(first)?.focus())
      return null
    }
    setFieldErrors({})
    setFormError(null)
    return committed
  }

  /** Creates or updates the post; throws on failure without altering the form. */
  const persist = async (committed: PostFormValues): Promise<AdminPost> => {
    const creating = committed.id === null
    const path = creating ? "/admin/posts" : `/admin/posts/${encodeURIComponent(committed.id ?? "")}`
    const payload = await request<ApiEnvelope<unknown>>(path, {
      method: creating ? "POST" : "PUT",
      body: JSON.stringify(postPayload(committed)),
    })
    const post = normalizeAdminPost(payload?.data)
    if (!post) throw new Error(INVALID_POST)
    applyPost(post)
    return post
  }

  const savePost = async () => {
    if (busy !== null) return
    const committed = prepareForm()
    if (!committed) return
    setBusy("saving")
    try {
      const post = await persist(committed)
      refreshPosts(post.status)
      setNotice({
        kind: "success",
        message:
          post.status === "published" && post.has_draft
            ? "Draft saved. The published version is unchanged until you publish these changes."
            : "Draft saved.",
      })
    } catch (error) {
      reportMutationError(error)
    } finally {
      setBusy(null)
    }
  }

  const publishPost = async () => {
    if (busy !== null) return
    const committed = prepareForm()
    if (!committed) return
    setBusy("publishing")
    let saved: AdminPost | null = null
    try {
      saved = await persist(committed)
      const payload = await request<ApiEnvelope<unknown>>(
        `/admin/posts/${encodeURIComponent(saved.id)}/publish`,
        { method: "POST" }
      )
      const post = normalizeAdminPost(payload?.data)
      if (!post) throw new Error(INVALID_POST)
      applyPost(post)
      refreshPosts("published")
      setNotice({ kind: "success", message: "Post published." })
    } catch (error) {
      if (saved) {
        reportMutationError(error, "Your changes were saved, but the post was not published.")
        refreshPosts(saved.status)
      } else {
        reportMutationError(error)
      }
    } finally {
      setBusy(null)
    }
  }

  const unpublishPost = async () => {
    const id = form.id
    if (id === null || busy !== null) return
    setNotice(null)
    setBusy("unpublishing")
    try {
      const payload = await request<ApiEnvelope<unknown>>(
        `/admin/posts/${encodeURIComponent(id)}/unpublish`,
        { method: "POST" }
      )
      const post = normalizeAdminPost(payload?.data)
      if (!post) throw new Error(INVALID_POST)
      // Keep any unsaved edits; only the publication state changed on the server.
      setForm((current) =>
        current.id === post.id
          ? {
              ...current,
              status: post.status,
              has_draft: post.has_draft,
              published_at: post.published_at,
              updated_at: post.updated_at,
            }
          : current
      )
      refreshPosts("draft")
      setNotice({ kind: "success", message: "Post moved to drafts." })
    } catch (error) {
      setNotice({ kind: "error", message: errorText(error, "The post could not be unpublished.") })
    } finally {
      setBusy(null)
    }
  }

  const deletePost = async () => {
    const id = form.id
    if (id === null || busy !== null) return
    setNotice(null)
    setBusy("deleting")
    try {
      await request<undefined>(`/admin/posts/${encodeURIComponent(id)}`, { method: "DELETE" })
      setForm(emptyPostForm())
      setBodyKey((key) => key + 1)
      setFieldErrors({})
      setFormError(null)
      refreshPosts()
      setNotice({ kind: "success", message: "Post deleted." })
    } catch (error) {
      setNotice({ kind: "error", message: errorText(error, "The post could not be deleted.") })
    } finally {
      setBusy(null)
    }
  }

  /* ---------- Image insertion ---------- */

  useEffect(() => {
    if (insertImage === null) {
      handledInsertRef.current = null
      return
    }
    // Wait for in-flight loads/saves so their responses cannot overwrite the insertion.
    if (busy !== null || handledInsertRef.current === insertImage) return
    const image: MediaItem = insertImage
    handledInsertRef.current = image

    const source = imageForMedia(image)
    if (source === null) {
      setNotice({
        kind: "error",
        message: "That image does not have a URL that can be inserted safely.",
      })
      onImageInserted()
      return
    }

    // The editor inserts at its retained selection (or appends), syncs body_markdown through
    // its change callback, and focuses itself.
    const inserted = bodyEditorRef.current?.insertImage(source) ?? false
    if (!inserted) {
      setNotice({
        kind: "error",
        message: "The image could not be inserted into the post body. Try again from the Media tab.",
      })
      onImageInserted()
      return
    }
    setMedia((current) =>
      current.some((item) => item.id === image.id) ? current : [...current, image]
    )
    setNotice({ kind: "success", message: "Image inserted into the post body." })
    onImageInserted()
  }, [busy, insertImage, onImageInserted])

  /* ---------- Rendering ---------- */

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Resources</p>
          <h2 className="font-serif text-3xl font-semibold tracking-tight">Posts</h2>
        </div>
        <Button onClick={startNewPost} disabled={busy !== null}>
          <Plus aria-hidden="true" />
          New post
        </Button>
      </div>

      <div aria-live="polite">
        {notice ? (
          <Alert
            variant={notice.kind === "error" ? "destructive" : "default"}
            role={notice.kind === "error" ? "alert" : "status"}
            className={cn(
              "pr-12",
              notice.kind === "success" &&
                "border-emerald-600/30 bg-emerald-600/10 text-emerald-900 dark:text-emerald-200"
            )}
          >
            {notice.kind === "error" ? (
              <CircleAlert aria-hidden="true" />
            ) : (
              <CheckCircle2 aria-hidden="true" />
            )}
            <AlertTitle className="line-clamp-none">{notice.message}</AlertTitle>
            <button
              type="button"
              className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-label="Dismiss message"
              onClick={() => setNotice(null)}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </Alert>
        ) : null}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
        <Card className="gap-0 py-0 lg:sticky lg:top-4" role="region" aria-label="Post list">
          <div className="border-b p-3">
            <div
              role="group"
              aria-label="Filter posts by status"
              className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1"
            >
              {STATUS_FILTERS.map((option) => {
                const selected = filter === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    className={cn(
                      "min-h-8 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      selected
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => {
                      if (!selected) setFilter(option.value)
                    }}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div
            className="max-h-[24rem] overflow-y-auto p-2 lg:max-h-[calc(100vh-14rem)]"
            aria-busy={listState === "loading"}
          >
            {listState === "loading" ? (
              <div className="space-y-2 p-1" role="status">
                <span className="sr-only">Loading posts…</span>
                {[0, 1, 2].map((index) => (
                  <div key={index} className="space-y-2 rounded-lg border p-3" aria-hidden="true">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : listState === "error" ? (
              <Alert variant="destructive" className="m-1 w-auto">
                <CircleAlert aria-hidden="true" />
                <AlertTitle>Posts could not be loaded</AlertTitle>
                <AlertDescription>
                  <p>{listError}</p>
                  <Button variant="outline" size="sm" className="mt-1" onClick={() => refreshPosts()}>
                    <RefreshCw aria-hidden="true" />
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            ) : posts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
                <FileText className="size-6" aria-hidden="true" />
                <p>No posts in this view.</p>
              </div>
            ) : (
              <ul className="space-y-1">
                {posts.map((post) => {
                  const current = form.id === post.id
                  return (
                    <li key={post.id}>
                      <button
                        type="button"
                        aria-current={current ? "true" : undefined}
                        disabled={busy !== null}
                        className={cn(
                          "flex w-full flex-col gap-0.5 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed",
                          current
                            ? "border-primary/30 bg-secondary"
                            : "hover:bg-muted/60"
                        )}
                        onClick={() => void openPost(post.id)}
                      >
                        <span className="line-clamp-2 text-sm font-semibold">
                          {post.title || "Untitled"}
                        </span>
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          /{post.slug}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {post.has_draft ? "Draft updated" : "Updated"}{" "}
                          {formatDate(post.updated_at)}
                          {post.has_draft ? " · Pending changes" : null}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </Card>

        <div ref={editorRef} className="min-w-0 scroll-mt-4">
          <PostEditor
            form={form}
            onChange={updateForm}
            bodyEditorRef={bodyEditorRef}
            bodyKey={bodyKey}
            fieldErrors={fieldErrors}
            formError={formError}
            taxonomy={taxonomy}
            media={media}
            mediaState={mediaState}
            mediaError={mediaError}
            onReloadMedia={() => void loadMedia()}
            busy={busy}
            onSave={() => void savePost()}
            onPublish={() => void publishPost()}
            onUnpublish={() => void unpublishPost()}
            onDelete={() => void deletePost()}
          />
        </div>
      </div>
    </div>
  )
}
