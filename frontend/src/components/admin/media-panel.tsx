"use client"

import {
  CheckCircle2,
  CircleAlert,
  FileImage,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { useAdminAuth } from "@/components/admin/auth-provider"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import {
  ACCEPTED_IMAGE_TYPES,
  ACCEPT_ATTRIBUTE,
  mediaLabel,
  normalizeMediaItem,
} from "@/lib/admin-media"
import { ApiError, resolveMediaUrl } from "@/lib/api"
import type { ApiEnvelope, MediaItem } from "@/lib/types"

type LoadState = "loading" | "ready" | "error"
type Notice = { kind: "success" | "error"; message: string }

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== "" ? error.message : fallback
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}
export function readPublicApiUrl(): string {
  if (typeof document === "undefined") return ""

  const data = document.getElementById("__NEXT_DATA__")?.textContent
  if (!data) return ""

  try {
    const root = recordOf(JSON.parse(data))
    const props = recordOf(root?.props)
    const pageProps = recordOf(props?.pageProps)
    const config = recordOf(pageProps?.config) ?? recordOf(pageProps?.publicConfig)
    return typeof config?.apiUrl === "string" ? config.apiUrl : ""
  } catch {
    return ""
  }
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "Unknown size"
  if (value < 1024) return `${Math.round(value)} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(value: string): string {
  if (value === "") return "Upload date unavailable"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export function MediaPanel({
  onInsertImage,
}: {
  onInsertImage: (media: MediaItem) => void
}): React.JSX.Element {
  const { request, status } = useAdminAuth()
  const authenticated = status === "authenticated"
  const [media, setMedia] = useState<MediaItem[]>([])
  const [loadState, setLoadState] = useState<LoadState>("loading")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const loadRequestRef = useRef(0)

  const [file, setFile] = useState<File | null>(null)
  const [altText, setAltText] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [apiUrl, setApiUrl] = useState("")

  useEffect(() => {
    setApiUrl(readPublicApiUrl())
  }, [])

  const loadMedia = useCallback(async () => {
    const requestId = ++loadRequestRef.current
    setLoadState("loading")
    setLoadError(null)

    try {
      const payload = await request<ApiEnvelope<unknown>>("/admin/media")
      if (requestId !== loadRequestRef.current) return
      const rows = Array.isArray(payload?.data) ? payload.data : []
      setMedia(rows.flatMap((row) => normalizeMediaItem(row) ?? []))
      setLoadState("ready")
    } catch (error) {
      if (requestId !== loadRequestRef.current) return
      setLoadError(errorText(error, "Images could not be loaded."))
      setLoadState("error")
    }
  }, [request])

  useEffect(() => {
    if (!authenticated) {
      loadRequestRef.current += 1
      setMedia([])
      return
    }
    void loadMedia()
  }, [authenticated, loadMedia, reloadToken])

  const refresh = () => setReloadToken((token) => token + 1)

  const chooseFile = (nextFile: File | null) => {
    setFile(nextFile)
    setNotice(null)
    setFieldErrors((current) => {
      if (!("file" in current)) return current
      const { file: _file, ...rest } = current
      return rest
    })

    if (nextFile && nextFile.type !== "" && !ACCEPTED_IMAGE_TYPES.has(nextFile.type)) {
      setFieldErrors((current) => ({
        ...current,
        file: "Choose a JPEG, PNG, WebP, or GIF image.",
      }))
    }
  }

  const upload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (uploading || !authenticated) return

    setNotice(null)
    const errors: Record<string, string> = {}
    if (!file) errors.file = "Choose an image to upload."
    else if (file.type !== "" && !ACCEPTED_IMAGE_TYPES.has(file.type)) {
      errors.file = "Choose a JPEG, PNG, WebP, or GIF image."
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    const form = new FormData()
    form.append("file", file as File)
    form.append("alt_text", altText.trim())
    setUploading(true)
    setFieldErrors({})

    try {
      await request<ApiEnvelope<unknown>>("/admin/media", { method: "POST", body: form })
      setFile(null)
      setAltText("")
      if (fileInputRef.current) fileInputRef.current.value = ""
      await loadMedia()
      setNotice({ kind: "success", message: "Image uploaded." })
    } catch (error) {
      setFieldErrors(error instanceof ApiError ? { ...error.fields } : {})
      setNotice({
        kind: "error",
        message: errorText(error, "The image could not be uploaded."),
      })
    } finally {
      setUploading(false)
    }
  }

  const deleteMedia = async () => {
    if (!deleteTarget || deletingId !== null || !authenticated) return
    const target = deleteTarget
    setDeletingId(target.id)
    setNotice(null)

    try {
      await request<undefined>(`/admin/media/${encodeURIComponent(target.id)}`, {
        method: "DELETE",
      })
      setDeleteTarget(null)
      await loadMedia()
      setNotice({ kind: "success", message: "Image deleted." })
    } catch (error) {
      setNotice({
        kind: "error",
        message: errorText(error, "The image could not be deleted."),
      })
    } finally {
      setDeletingId(null)
    }
  }

  if (!authenticated) return <></>

  return (
    <section className="space-y-6" aria-labelledby="media-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Library</p>
          <h2 id="media-heading" className="font-serif text-3xl font-semibold tracking-tight">
            Media
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Upload image assets, review their metadata, and insert them into a post draft.
          </p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={loadState === "loading"}>
          <RefreshCw className={loadState === "loading" ? "animate-spin" : undefined} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {notice ? (
        <Alert variant={notice.kind === "error" ? "destructive" : "default"} aria-live="polite">
          {notice.kind === "error" ? (
            <CircleAlert aria-hidden="true" />
          ) : (
            <CheckCircle2 aria-hidden="true" />
          )}
          <AlertTitle>{notice.kind === "error" ? "Media action failed" : "Media updated"}</AlertTitle>
          <AlertDescription>{notice.message}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Upload an image</CardTitle>
          <CardDescription>JPEG, PNG, WebP, and GIF files are supported.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end" onSubmit={upload}>
            <div className="space-y-2">
              <label htmlFor="media-file" className="text-sm font-medium">
                Image file
              </label>
              <Input
                ref={fileInputRef}
                id="media-file"
                type="file"
                accept={ACCEPT_ATTRIBUTE}
                disabled={uploading}
                aria-invalid={fieldErrors.file ? true : undefined}
                aria-describedby={fieldErrors.file ? "media-file-error" : "media-file-help"}
                onChange={(event) => chooseFile(event.currentTarget.files?.[0] ?? null)}
              />
              <p id="media-file-help" className="text-xs text-muted-foreground">
                The server validates the file contents and upload size.
              </p>
              {fieldErrors.file ? (
                <p id="media-file-error" className="text-sm text-destructive">
                  {fieldErrors.file}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label htmlFor="media-alt" className="text-sm font-medium">
                Alternative text <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="media-alt"
                value={altText}
                disabled={uploading}
                aria-invalid={fieldErrors.alt_text ? true : undefined}
                aria-describedby={fieldErrors.alt_text ? "media-alt-error" : "media-alt-help"}
                onChange={(event) => {
                  setAltText(event.currentTarget.value)
                  setFieldErrors((current) => {
                    if (!("alt_text" in current)) return current
                    const { alt_text: _altText, ...rest } = current
                    return rest
                  })
                }}
              />
              <p id="media-alt-help" className="text-xs text-muted-foreground">
                Describe the image's purpose for people using assistive technology.
              </p>
              {fieldErrors.alt_text ? (
                <p id="media-alt-error" className="text-sm text-destructive">
                  {fieldErrors.alt_text}
                </p>
              ) : null}
            </div>

            <Button type="submit" disabled={uploading} className="lg:mb-8">
              {uploading ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Upload aria-hidden="true" />
              )}
              {uploading ? "Uploading…" : "Upload image"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {loadState === "loading" ? (
        <Card aria-busy="true">
          <CardContent className="flex min-h-40 items-center justify-center gap-3 text-sm text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
            Loading media…
          </CardContent>
        </Card>
      ) : loadState === "error" ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Media could not be loaded</AlertTitle>
          <AlertDescription className="gap-3">
            <p>{loadError}</p>
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw aria-hidden="true" />
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : media.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-44 flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-full bg-muted p-3 text-muted-foreground">
              <FileImage className="size-6" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-serif text-xl font-semibold">No images uploaded</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Upload the first image to build the media library.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Uploaded media">
          {media.map((item) => {
            const imageUrl = resolveMediaUrl(item.url, apiUrl)
            const dimensions =
              item.width !== null && item.height !== null
                ? `${item.width} × ${item.height}`
                : "Dimensions unavailable"

            return (
              <Card key={item.id} className="overflow-hidden py-0">
                <div className="flex aspect-[4/3] items-center justify-center border-b bg-muted/45">
                  {imageUrl ? (
                    // Admin-managed URLs may point at the separately hosted PHP API.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl}
                      alt={item.alt_text ?? ""}
                      loading="lazy"
                      className="size-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                      <FileImage className="size-7" aria-hidden="true" />
                      Preview unavailable
                    </div>
                  )}
                </div>
                <CardHeader className="pt-5">
                  <CardTitle className="break-words">{mediaLabel(item)}</CardTitle>
                  <CardDescription>{item.alt_text || "No alternative text"}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <dt className="text-muted-foreground">Type</dt>
                    <dd className="min-w-0 truncate text-right">{item.mime_type || "Unknown"}</dd>
                    <dt className="text-muted-foreground">Dimensions</dt>
                    <dd className="text-right">{dimensions}</dd>
                    <dt className="text-muted-foreground">Size</dt>
                    <dd className="text-right">{formatBytes(item.size_bytes)}</dd>
                    <dt className="text-muted-foreground">Uploaded</dt>
                    <dd className="text-right">{formatDate(item.created_at)}</dd>
                  </dl>
                </CardContent>
                <CardFooter className="flex flex-wrap gap-2 pb-5">
                  <Button size="sm" onClick={() => onInsertImage(item)}>
                    <ImagePlus aria-hidden="true" />
                    Insert image
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteTarget(item)}
                    disabled={deletingId !== null}
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

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && deletingId === null) setDeleteTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete image?</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `${mediaLabel(deleteTarget)} will be permanently removed. Posts using it as a cover will lose that cover.`
                : "This image will be permanently removed."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={deletingId !== null}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={deleteMedia} disabled={deletingId !== null}>
              {deletingId !== null ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
              {deletingId !== null ? "Deleting…" : "Delete image"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
