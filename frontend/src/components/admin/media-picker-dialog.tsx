"use client"

import {
  Check,
  CircleAlert,
  FileImage,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  Upload,
} from "lucide-react"
import { useCallback, useEffect, useId, useRef, useState } from "react"

import { useAdminAuth } from "@/components/admin/auth-provider"
import { readPublicApiUrl } from "@/components/admin/media-panel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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
  fetchAdminMedia,
  mediaLabel,
  uploadAdminMedia,
} from "@/lib/admin-media"
import { ApiError, resolveMediaUrl } from "@/lib/api"
import type { MediaItem } from "@/lib/types"
import { cn } from "@/lib/utils"

export type MediaPickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (media: MediaItem) => void
  title?: string
  description?: string
  selectedId?: number | null
  selectedUrl?: string | null
}

type LoadState = "loading" | "ready" | "error"

const UNSUPPORTED_TYPE_MESSAGE = "Choose a JPEG, PNG, WebP, or GIF image."

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== "" ? error.message : fallback
}

export function MediaPickerDialog({
  open,
  onOpenChange,
  onSelect,
  title = "Choose an image",
  description = "Pick an image from the media library or upload a new one.",
  selectedId = null,
  selectedUrl = null,
}: MediaPickerDialogProps): React.JSX.Element {
  const { request } = useAdminAuth()
  const fieldId = useId()
  const fileFieldId = `${fieldId}-file`
  const altFieldId = `${fieldId}-alt`

  const [media, setMedia] = useState<MediaItem[]>([])
  const [loadState, setLoadState] = useState<LoadState>("loading")
  const [loadError, setLoadError] = useState<string | null>(null)
  const loadRequestRef = useRef(0)

  const [file, setFile] = useState<File | null>(null)
  const [altText, setAltText] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const uploadRequestRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectingRef = useRef(false)
  const [apiUrl, setApiUrl] = useState("")

  useEffect(() => {
    setApiUrl(readPublicApiUrl())
  }, [])

  const loadMedia = useCallback(async () => {
    const requestId = ++loadRequestRef.current
    setLoadState("loading")
    setLoadError(null)

    try {
      const items = await fetchAdminMedia(request)
      if (requestId !== loadRequestRef.current) return
      setMedia(items)
      setLoadState("ready")
    } catch (error) {
      if (requestId !== loadRequestRef.current) return
      setLoadError(errorText(error, "Images could not be loaded."))
      setLoadState("error")
    }
  }, [request])

  useEffect(() => {
    if (!open) {
      // Invalidate in-flight list and upload requests so late responses are ignored.
      loadRequestRef.current += 1
      uploadRequestRef.current += 1
      return
    }

    selectingRef.current = false
    setFile(null)
    setAltText("")
    setFieldErrors({})
    setUploadError(null)
    setUploading(false)
    void loadMedia()
  }, [open, loadMedia])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && uploading) return
    onOpenChange(nextOpen)
  }

  const choose = (item: MediaItem) => {
    if (selectingRef.current) return
    selectingRef.current = true
    onSelect(item)
    onOpenChange(false)
  }

  const chooseFile = (nextFile: File | null) => {
    setFile(nextFile)
    setUploadError(null)
    setFieldErrors((current) => {
      if (!("file" in current)) return current
      const { file: _file, ...rest } = current
      return rest
    })

    if (nextFile && nextFile.type !== "" && !ACCEPTED_IMAGE_TYPES.has(nextFile.type)) {
      setFieldErrors((current) => ({ ...current, file: UNSUPPORTED_TYPE_MESSAGE }))
    }
  }

  const upload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (uploading) return

    setUploadError(null)
    const errors: Record<string, string> = {}
    if (!file) errors.file = "Choose an image to upload."
    else if (file.type !== "" && !ACCEPTED_IMAGE_TYPES.has(file.type)) {
      errors.file = UNSUPPORTED_TYPE_MESSAGE
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    const uploadId = ++uploadRequestRef.current
    setUploading(true)
    setFieldErrors({})

    try {
      const uploaded = await uploadAdminMedia(request, { file: file as File, altText })
      if (uploadId !== uploadRequestRef.current) return
      setFile(null)
      setAltText("")
      if (fileInputRef.current) fileInputRef.current.value = ""
      setMedia((current) => [uploaded, ...current.filter((item) => item.id !== uploaded.id)])
      setUploading(false)
      choose(uploaded)
    } catch (error) {
      if (uploadId !== uploadRequestRef.current) return
      setFieldErrors(error instanceof ApiError ? { ...error.fields } : {})
      setUploadError(errorText(error, "The image could not be uploaded."))
      setUploading(false)
    }
  }

  const isSelected = (item: MediaItem): boolean => {
    if (selectedId !== null && selectedId !== undefined && item.id === selectedId) return true
    if (!selectedUrl) return false
    return item.url === selectedUrl || resolveMediaUrl(item.url, apiUrl) === selectedUrl
  }

  const focusUploadForm = () => {
    fileInputRef.current?.focus()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-4xl overflow-y-auto sm:max-w-4xl">
        <DialogHeader className="pr-8">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <section className="min-w-0 space-y-3" aria-labelledby={`${fieldId}-library`}>
            <div className="flex items-center justify-between gap-3">
              <h3 id={`${fieldId}-library`} className="text-sm font-semibold">
                Library
              </h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadMedia()}
                disabled={loadState === "loading"}
              >
                <RefreshCw
                  className={loadState === "loading" ? "animate-spin" : undefined}
                  aria-hidden="true"
                />
                Refresh
              </Button>
            </div>

            {loadState === "loading" ? (
              <div
                className="flex min-h-48 items-center justify-center gap-3 rounded-lg border border-dashed text-sm text-muted-foreground"
                aria-busy="true"
              >
                <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
                Loading images…
              </div>
            ) : loadState === "error" ? (
              <Alert variant="destructive">
                <CircleAlert aria-hidden="true" />
                <AlertTitle>Images could not be loaded</AlertTitle>
                <AlertDescription className="gap-3">
                  <p>{loadError}</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => void loadMedia()}>
                    <RefreshCw aria-hidden="true" />
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            ) : media.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center">
                <div className="rounded-full bg-muted p-3 text-muted-foreground">
                  <FileImage className="size-6" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-medium">No images in the library yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Use the upload form in this dialog to add the first image. It will be selected
                    automatically.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={focusUploadForm}>
                  <ImagePlus aria-hidden="true" />
                  Upload an image
                </Button>
              </div>
            ) : (
              <ul
                className="grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto p-1 sm:grid-cols-3 xl:grid-cols-4"
                aria-label="Media library"
              >
                {media.map((item) => {
                  const imageUrl = resolveMediaUrl(item.url, apiUrl)
                  const selected = isSelected(item)
                  const label = mediaLabel(item)

                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => choose(item)}
                        disabled={uploading}
                        aria-pressed={selected}
                        aria-label={selected ? `${label} (current selection)` : `Select ${label}`}
                        title={label}
                        className={cn(
                          "group relative flex w-full flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors outline-none hover:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60",
                          selected && "border-primary ring-2 ring-primary"
                        )}
                      >
                        <span className="flex aspect-square items-center justify-center bg-muted/45">
                          {imageUrl ? (
                            // Admin-managed URLs may point at the separately hosted PHP API.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imageUrl}
                              alt=""
                              loading="lazy"
                              className="size-full object-cover transition-transform group-hover:scale-[1.02]"
                            />
                          ) : (
                            <FileImage className="size-7 text-muted-foreground" aria-hidden="true" />
                          )}
                        </span>
                        <span className="truncate border-t px-2 py-1.5 text-xs font-medium">
                          {label}
                        </span>
                        {selected ? (
                          <span className="absolute right-1.5 top-1.5 rounded-full bg-primary p-1 text-primary-foreground shadow-sm">
                            <Check className="size-3.5" aria-hidden="true" />
                          </span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section
            className="space-y-4 border-t pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0"
            aria-labelledby={`${fieldId}-upload`}
          >
            <div>
              <h3 id={`${fieldId}-upload`} className="text-sm font-semibold">
                Upload
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                JPEG, PNG, WebP, and GIF files are supported.
              </p>
            </div>

            {uploadError ? (
              <Alert variant="destructive" aria-live="polite">
                <CircleAlert aria-hidden="true" />
                <AlertTitle>Upload failed</AlertTitle>
                <AlertDescription>{uploadError}</AlertDescription>
              </Alert>
            ) : null}

            <form className="space-y-4" onSubmit={upload} noValidate>
              <div className="space-y-2">
                <label htmlFor={fileFieldId} className="text-sm font-medium">
                  Image file
                </label>
                <Input
                  ref={fileInputRef}
                  id={fileFieldId}
                  type="file"
                  accept={ACCEPT_ATTRIBUTE}
                  disabled={uploading}
                  aria-invalid={fieldErrors.file ? true : undefined}
                  aria-describedby={fieldErrors.file ? `${fileFieldId}-error` : undefined}
                  onChange={(event) => chooseFile(event.currentTarget.files?.[0] ?? null)}
                />
                {fieldErrors.file ? (
                  <p id={`${fileFieldId}-error`} className="text-sm text-destructive">
                    {fieldErrors.file}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label htmlFor={altFieldId} className="text-sm font-medium">
                  Alternative text{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <Input
                  id={altFieldId}
                  value={altText}
                  disabled={uploading}
                  aria-invalid={fieldErrors.alt_text ? true : undefined}
                  aria-describedby={
                    fieldErrors.alt_text ? `${altFieldId}-error` : `${altFieldId}-help`
                  }
                  onChange={(event) => {
                    setAltText(event.currentTarget.value)
                    setFieldErrors((current) => {
                      if (!("alt_text" in current)) return current
                      const { alt_text: _altText, ...rest } = current
                      return rest
                    })
                  }}
                />
                {fieldErrors.alt_text ? (
                  <p id={`${altFieldId}-error`} className="text-sm text-destructive">
                    {fieldErrors.alt_text}
                  </p>
                ) : (
                  <p id={`${altFieldId}-help`} className="text-xs text-muted-foreground">
                    Describe the image for people using assistive technology.
                  </p>
                )}
              </div>

              <Button type="submit" disabled={uploading} className="w-full">
                {uploading ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : (
                  <Upload aria-hidden="true" />
                )}
                {uploading ? "Uploading…" : "Upload and use image"}
              </Button>
            </form>
          </section>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={uploading}>
              Cancel
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
