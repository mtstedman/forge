"use client"

import {
  CircleAlert,
  Globe,
  LoaderCircle,
  RefreshCw,
  Save,
  Trash2,
  Undo2,
} from "lucide-react"
import { useState } from "react"

import {
  FaqEditor,
  faqEntriesFrom,
  faqPayload,
  type FaqEntry,
} from "@/components/admin/faq-editor"
import {
  TaxonomyInput,
  commitTaxonomyDraft,
  uniqueTaxonomyValues,
} from "@/components/admin/taxonomy-input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { MediaItem } from "@/lib/types"
import { cn } from "@/lib/utils"

export type PostStatus = "draft" | "published"

/** Admin post row returned by /admin/posts endpoints, normalized at the boundary. */
export type AdminPost = {
  id: number
  slug: string
  title: string
  excerpt: string | null
  body_markdown: string
  category: string | null
  categories: string[]
  tags: string[]
  faq: { question: string; answer: string }[]
  meta_title: string | null
  meta_description: string | null
  cover_media_id: number | null
  comments_enabled: boolean
  status: PostStatus
  published_at: string | null
  updated_at: string | null
}

export type PostFormValues = {
  id: number | null
  /** null while creating a post that has not been saved yet. */
  status: PostStatus | null
  title: string
  slug: string
  excerpt: string
  body_markdown: string
  categories: string[]
  categoryDraft: string
  tags: string[]
  tagDraft: string
  meta_title: string
  meta_description: string
  /** Selected media id as a string; "" means no cover. */
  cover_media_id: string
  comments_enabled: boolean
  faq: FaqEntry[]
  published_at: string | null
  updated_at: string | null
}

export type PostFieldErrors = Record<string, string>

export type EditorBusy = "loading" | "saving" | "publishing" | "unpublishing" | "deleting" | null

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const SLUG_MESSAGE = "Use lowercase letters, numbers, and single hyphens only."

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  slug: "Slug",
  excerpt: "Excerpt",
  body_markdown: "Markdown body",
  category: "Category",
  categories: "Categories",
  tags: "Tags",
  meta_title: "Meta title",
  meta_description: "Meta description",
  cover_media_id: "Cover image",
  comments_enabled: "Comments",
  faq: "FAQs",
  author_name: "Author",
  status: "Status",
}

/** Maps editable form keys to the API field names used in validation errors. */
export const FORM_FIELD_TO_API: Partial<Record<keyof PostFormValues, string>> = {
  title: "title",
  slug: "slug",
  excerpt: "excerpt",
  body_markdown: "body_markdown",
  categories: "categories",
  categoryDraft: "categories",
  tags: "tags",
  tagDraft: "tags",
  meta_title: "meta_title",
  meta_description: "meta_description",
  cover_media_id: "cover_media_id",
  comments_enabled: "comments_enabled",
  faq: "faq",
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function integerOrNull(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN
  return Number.isInteger(parsed) ? parsed : null
}

function stringOr(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

export function normalizeAdminPost(raw: unknown): AdminPost | null {
  const row = recordOf(raw)
  if (!row) return null
  const id = integerOrNull(row.id)
  if (id === null) return null

  const category = nullableString(row.category)
  const faq: AdminPost["faq"] = Array.isArray(row.faq)
    ? row.faq.flatMap((item) => {
        const entry = recordOf(item)
        return entry ? [{ question: stringOr(entry.question), answer: stringOr(entry.answer) }] : []
      })
    : []

  return {
    id,
    slug: stringOr(row.slug),
    title: stringOr(row.title),
    excerpt: nullableString(row.excerpt),
    body_markdown: stringOr(row.body_markdown),
    category,
    categories: Array.isArray(row.categories)
      ? uniqueTaxonomyValues(row.categories)
      : category
        ? uniqueTaxonomyValues([category])
        : [],
    tags: uniqueTaxonomyValues(row.tags),
    faq,
    meta_title: nullableString(row.meta_title),
    meta_description: nullableString(row.meta_description),
    cover_media_id: integerOrNull(row.cover_media_id),
    comments_enabled: row.comments_enabled === true || Number(row.comments_enabled) === 1,
    status: row.status === "published" ? "published" : "draft",
    published_at: nullableString(row.published_at),
    updated_at: nullableString(row.updated_at),
  }
}

export function emptyPostForm(): PostFormValues {
  return {
    id: null,
    status: null,
    title: "",
    slug: "",
    excerpt: "",
    body_markdown: "",
    categories: [],
    categoryDraft: "",
    tags: [],
    tagDraft: "",
    meta_title: "",
    meta_description: "",
    cover_media_id: "",
    comments_enabled: false,
    faq: [],
    published_at: null,
    updated_at: null,
  }
}

export function postFormFromPost(post: AdminPost): PostFormValues {
  return {
    id: post.id,
    status: post.status,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt ?? "",
    body_markdown: post.body_markdown,
    categories: post.categories,
    categoryDraft: "",
    tags: post.tags,
    tagDraft: "",
    meta_title: post.meta_title ?? "",
    meta_description: post.meta_description ?? "",
    cover_media_id: post.cover_media_id === null ? "" : String(post.cover_media_id),
    comments_enabled: post.comments_enabled,
    faq: faqEntriesFrom(post.faq),
    published_at: post.published_at,
    updated_at: post.updated_at,
  }
}

/** Moves uncommitted taxonomy text into the chip selections. */
export function commitPostFormDrafts(form: PostFormValues): PostFormValues {
  return {
    ...form,
    categories: commitTaxonomyDraft(form.categories, form.categoryDraft),
    categoryDraft: "",
    tags: commitTaxonomyDraft(form.tags, form.tagDraft),
    tagDraft: "",
  }
}

/** Builds the create/update request body; taxonomy drafts must already be committed. */
export function postPayload(form: PostFormValues): Record<string, unknown> {
  const cover = integerOrNull(form.cover_media_id)
  return {
    title: form.title.trim(),
    slug: form.slug.trim(),
    excerpt: form.excerpt,
    body_markdown: form.body_markdown,
    categories: form.categories.slice(),
    tags: form.tags.slice(),
    faq: faqPayload(form.faq),
    meta_title: form.meta_title.trim() || null,
    meta_description: form.meta_description.trim() || null,
    cover_media_id: cover,
    comments_enabled: form.comments_enabled,
  }
}

export function validatePostForm(form: PostFormValues): PostFieldErrors {
  const errors: PostFieldErrors = {}
  if (form.title.trim() === "") errors.title = "Title is required."
  const slug = form.slug.trim()
  if (slug === "") errors.slug = "Slug is required."
  else if (!SLUG_PATTERN.test(slug)) errors.slug = SLUG_MESSAGE
  return errors
}

export function mediaOptionLabel(media: MediaItem): string {
  return media.alt_text?.trim() || media.original_name.trim() || `Image ${media.id}`
}

function formatDate(value: string | null): string {
  if (!value) return "Not yet"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function describedBy(...ids: Array<string | false | null | undefined>): string | undefined {
  const value = ids.filter(Boolean).join(" ")
  return value === "" ? undefined : value
}

const selectClassName =
  "flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20"

function FieldError({ id, message }: { id: string; message?: string }): React.JSX.Element | null {
  return message ? (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  ) : null
}

function StatusBadge({ status }: { status: PostStatus | null }): React.JSX.Element {
  const label = status === "published" ? "Published" : status === "draft" ? "Draft" : "New draft"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        status === "published"
          ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300"
          : "border-primary/25 bg-secondary text-secondary-foreground"
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "published" ? "bg-emerald-600" : "bg-primary"
        )}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}

export type PostEditorProps = {
  form: PostFormValues
  onChange: (patch: Partial<PostFormValues>) => void
  bodyRef: React.Ref<HTMLTextAreaElement>
  onBodyFocus?: () => void
  fieldErrors: PostFieldErrors
  formError: string | null
  taxonomy: { categories: string[]; tags: string[] }
  media: MediaItem[]
  mediaState: "loading" | "ready" | "error"
  mediaError: string | null
  onReloadMedia: () => void
  busy: EditorBusy
  onSave: () => void
  onPublish: () => void
  onUnpublish: () => void
  onDelete: () => void
}

export function PostEditor({
  form,
  onChange,
  bodyRef,
  onBodyFocus,
  fieldErrors,
  formError,
  taxonomy,
  media,
  mediaState,
  mediaError,
  onReloadMedia,
  busy,
  onSave,
  onPublish,
  onUnpublish,
  onDelete,
}: PostEditorProps): React.JSX.Element {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const disabled = busy !== null
  const isNew = form.id === null
  const isPublished = form.status === "published"

  const trimmedSlug = form.slug.trim()
  const liveSlugError =
    trimmedSlug !== "" && !SLUG_PATTERN.test(trimmedSlug) ? SLUG_MESSAGE : undefined
  const slugError = fieldErrors.slug ?? liveSlugError
  const categoriesError = fieldErrors.categories ?? fieldErrors.category

  const coverMissing =
    form.cover_media_id !== "" && !media.some((item) => String(item.id) === form.cover_media_id)

  const errorEntries = Object.entries(fieldErrors)
  const heading = isNew ? "Create post" : form.title.trim() || "Edit post"

  return (
    <Card className="gap-0 overflow-visible py-0" aria-busy={busy === "loading"}>
      <form
        noValidate
        aria-labelledby="post-editor-title"
        onSubmit={(event) => {
          event.preventDefault()
          if (!disabled) onSave()
        }}
      >
        <div className="flex flex-col gap-4 border-b px-4 py-4 sm:px-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 space-y-2">
            <StatusBadge status={form.status} />
            <h2
              id="post-editor-title"
              className="break-words font-serif text-2xl font-semibold leading-tight"
            >
              {heading}
            </h2>
            {!isNew ? (
              <p className="text-xs text-muted-foreground">
                Updated {formatDate(form.updated_at)}
                {isPublished ? ` · Published ${formatDate(form.published_at)}` : null}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">New posts are saved as drafts.</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 xl:justify-end">
            <Button
              variant="outline"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmingDelete(true)}
              disabled={isNew || disabled}
            >
              {busy === "deleting" ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
              Delete
            </Button>
            <Button variant="outline" onClick={onUnpublish} disabled={!isPublished || disabled}>
              {busy === "unpublishing" ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Undo2 aria-hidden="true" />
              )}
              Unpublish
            </Button>
            <Button variant="secondary" onClick={onPublish} disabled={isPublished || disabled}>
              {busy === "publishing" ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Globe aria-hidden="true" />
              )}
              {busy === "publishing" ? "Publishing…" : "Publish"}
            </Button>
            <Button type="submit" disabled={disabled}>
              {busy === "saving" ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Save aria-hidden="true" />
              )}
              {busy === "saving" ? "Saving…" : isPublished ? "Save changes" : "Save draft"}
            </Button>
          </div>
        </div>

        {busy === "loading" ? (
          <div
            className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2 text-sm text-muted-foreground sm:px-6"
            role="status"
          >
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Loading post…
          </div>
        ) : null}

        <fieldset disabled={disabled} className="min-w-0 space-y-8 px-4 py-6 sm:px-6">
          <legend className="sr-only">Post details</legend>

          {formError || errorEntries.length > 0 ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>{formError ?? "Validation failed."}</AlertTitle>
              {errorEntries.length > 0 ? (
                <AlertDescription>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {errorEntries.map(([field, message]) => (
                      <li key={field}>
                        <span className="font-medium">{FIELD_LABELS[field] ?? field}:</span>{" "}
                        {message}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              ) : null}
            </Alert>
          ) : null}

          <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium" htmlFor="post-title">
                Title <span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <Input
                id="post-title"
                name="title"
                value={form.title}
                required
                aria-invalid={fieldErrors.title ? true : undefined}
                aria-describedby={describedBy(fieldErrors.title && "post-title-error")}
                onChange={(event) => onChange({ title: event.target.value })}
              />
              <FieldError id="post-title-error" message={fieldErrors.title} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="post-slug">
                Slug <span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <div className="flex items-center rounded-md">
                <span className="hidden h-9 items-center rounded-l-md border border-r-0 border-input bg-muted/50 px-3 text-sm text-muted-foreground sm:inline-flex">
                  /resources/
                </span>
                <Input
                  id="post-slug"
                  name="slug"
                  value={form.slug}
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  className="sm:rounded-l-none"
                  aria-invalid={slugError ? true : undefined}
                  aria-describedby={describedBy("post-slug-hint", slugError && "post-slug-error")}
                  onChange={(event) => onChange({ slug: event.target.value })}
                />
              </div>
              <p id="post-slug-hint" className="text-xs text-muted-foreground">
                Lowercase letters, numbers and single hyphens, e.g. knee-pain-basics.
              </p>
              <FieldError id="post-slug-error" message={slugError} />
            </div>

            <TaxonomyInput
              id="post-category"
              label="Categories"
              itemLabel="category"
              values={form.categories}
              draft={form.categoryDraft}
              options={taxonomy.categories}
              error={categoriesError}
              disabled={disabled}
              onChange={(categories, categoryDraft) => onChange({ categories, categoryDraft })}
            />

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium" htmlFor="post-excerpt">
                Excerpt
              </label>
              <Textarea
                id="post-excerpt"
                name="excerpt"
                rows={3}
                className="min-h-20"
                value={form.excerpt}
                aria-invalid={fieldErrors.excerpt ? true : undefined}
                aria-describedby={describedBy(fieldErrors.excerpt && "post-excerpt-error")}
                onChange={(event) => onChange({ excerpt: event.target.value })}
              />
              <FieldError id="post-excerpt-error" message={fieldErrors.excerpt} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <label className="text-sm font-medium" htmlFor="post-body">
                  Markdown body
                </label>
                <span id="post-body-hint" className="text-xs text-muted-foreground">
                  Insert images from the Media tab at the cursor position.
                </span>
              </div>
              <Textarea
                ref={bodyRef}
                id="post-body"
                name="body_markdown"
                rows={18}
                className="min-h-80 font-mono text-sm leading-relaxed md:text-sm"
                value={form.body_markdown}
                aria-invalid={fieldErrors.body_markdown ? true : undefined}
                aria-describedby={describedBy(
                  "post-body-hint",
                  fieldErrors.body_markdown && "post-body-error"
                )}
                onFocus={onBodyFocus}
                onChange={(event) => onChange({ body_markdown: event.target.value })}
              />
              <FieldError id="post-body-error" message={fieldErrors.body_markdown} />
            </div>

            <TaxonomyInput
              id="post-tags"
              label="Tags"
              itemLabel="tag"
              className="md:col-span-2"
              values={form.tags}
              draft={form.tagDraft}
              options={taxonomy.tags}
              error={fieldErrors.tags}
              disabled={disabled}
              onChange={(tags, tagDraft) => onChange({ tags, tagDraft })}
            />

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="post-meta-title">
                Meta title
              </label>
              <Input
                id="post-meta-title"
                name="meta_title"
                value={form.meta_title}
                aria-invalid={fieldErrors.meta_title ? true : undefined}
                aria-describedby={describedBy(
                  "post-meta-title-hint",
                  fieldErrors.meta_title && "post-meta-title-error"
                )}
                onChange={(event) => onChange({ meta_title: event.target.value })}
              />
              <p id="post-meta-title-hint" className="text-xs text-muted-foreground">
                Optional. Defaults to the post title.
              </p>
              <FieldError id="post-meta-title-error" message={fieldErrors.meta_title} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="post-meta-description">
                Meta description
              </label>
              <Textarea
                id="post-meta-description"
                name="meta_description"
                rows={3}
                className="min-h-20"
                value={form.meta_description}
                aria-invalid={fieldErrors.meta_description ? true : undefined}
                aria-describedby={describedBy(
                  fieldErrors.meta_description && "post-meta-description-error"
                )}
                onChange={(event) => onChange({ meta_description: event.target.value })}
              />
              <FieldError
                id="post-meta-description-error"
                message={fieldErrors.meta_description}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium" htmlFor="post-cover">
                  Cover image
                </label>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onReloadMedia}
                  disabled={disabled || mediaState === "loading"}
                  aria-label="Refresh cover image options"
                  title="Refresh cover image options"
                >
                  <RefreshCw
                    className={cn(mediaState === "loading" && "animate-spin")}
                    aria-hidden="true"
                  />
                </Button>
              </div>
              <select
                id="post-cover"
                name="cover_media_id"
                className={selectClassName}
                value={form.cover_media_id}
                aria-invalid={fieldErrors.cover_media_id ? true : undefined}
                aria-describedby={describedBy(
                  "post-cover-status",
                  fieldErrors.cover_media_id && "post-cover-error"
                )}
                onChange={(event) => onChange({ cover_media_id: event.target.value })}
              >
                <option value="">No cover image</option>
                {media.map((item) => (
                  <option key={item.id} value={String(item.id)}>
                    {mediaOptionLabel(item)}
                  </option>
                ))}
                {coverMissing ? (
                  <option value={form.cover_media_id}>
                    Image {form.cover_media_id} (not in library)
                  </option>
                ) : null}
              </select>
              <p
                id="post-cover-status"
                className={cn(
                  "text-xs",
                  mediaState === "error" ? "text-destructive" : "text-muted-foreground"
                )}
                aria-live="polite"
              >
                {mediaState === "loading"
                  ? "Loading images…"
                  : mediaState === "error"
                    ? `Images could not be loaded: ${mediaError ?? "Unknown error."}`
                    : media.length === 0
                      ? "Upload images in the Media tab to choose a cover."
                      : `${media.length} image${media.length === 1 ? "" : "s"} available.`}
              </p>
              <FieldError id="post-cover-error" message={fieldErrors.cover_media_id} />
            </div>

            <div className="space-y-2">
              <span className="text-sm font-medium" aria-hidden="true">
                Discussion
              </span>
              <label
                htmlFor="post-comments-enabled"
                className="flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/20 p-3 has-[:disabled]:cursor-not-allowed"
              >
                <input
                  id="post-comments-enabled"
                  name="comments_enabled"
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  checked={form.comments_enabled}
                  aria-describedby={describedBy(
                    "post-comments-hint",
                    fieldErrors.comments_enabled && "post-comments-error"
                  )}
                  onChange={(event) => onChange({ comments_enabled: event.target.checked })}
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">Enable comments</span>
                  <span id="post-comments-hint" className="block text-xs text-muted-foreground">
                    Visitors can submit comments for moderation when comments are enabled site-wide.
                  </span>
                </span>
              </label>
              <FieldError id="post-comments-error" message={fieldErrors.comments_enabled} />
            </div>
          </div>

          <div className="border-t pt-6">
            <FaqEditor
              id="post-faq"
              items={form.faq}
              error={fieldErrors.faq}
              disabled={disabled}
              onChange={(faq) => onChange({ faq })}
            />
          </div>
        </fieldset>
      </form>

      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this post?</DialogTitle>
            <DialogDescription>
              {form.title.trim() ? `“${form.title.trim()}”` : "This post"} will be deleted
              permanently. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmingDelete(false)
                onDelete()
              }}
              disabled={disabled}
            >
              <Trash2 aria-hidden="true" />
              Delete post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
