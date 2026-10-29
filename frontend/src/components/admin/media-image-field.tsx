"use client"

import { FileImage, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { resolveMediaUrl } from "@/lib/api"
import type { MediaItem } from "@/lib/types"
import { cn } from "@/lib/utils"

const selectClassName =
  "flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20"

export type MediaImageFieldProps = {
  label: string
  path: string
  value: string
  onChange: (value: string) => void
  media: MediaItem[]
  mediaState: "loading" | "ready" | "error"
  mediaError: string | null
  onReloadMedia: () => void
  errors: Record<string, string>
  apiUrl: string
  disabled?: boolean
}

function mediaOptionLabel(media: MediaItem): string {
  const name = media.original_name.trim() || media.alt_text?.trim() || `Image ${media.id}`
  const alt = media.alt_text?.trim() ?? ""
  const description = alt !== "" && alt !== name ? ` — ${alt}` : ""
  const dimensions = media.width && media.height ? ` (${media.width}×${media.height})` : ""
  return `${name}${description}${dimensions}`
}

function missingOptionLabel(value: string): string {
  const name = value.split(/[?#]/, 1)[0].split("/").filter(Boolean).pop() ?? value
  return `${name || value} (not in library)`
}

export function MediaImageField({
  label,
  path,
  value,
  onChange,
  media,
  mediaState,
  mediaError,
  onReloadMedia,
  errors,
  apiUrl,
  disabled = false,
}: MediaImageFieldProps): React.JSX.Element {
  const id = `main-page-${path.replaceAll(".", "-")}`
  const statusId = `${id}-status`
  const errorId = `${id}-error`
  const error = errors[path]
  const missing = value !== "" && !media.some((item) => item.url === value)
  const previewUrl = value !== "" ? resolveMediaUrl(value, apiUrl) : ""

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
          <span className="font-normal text-muted-foreground"> (optional)</span>
        </label>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onReloadMedia}
          disabled={disabled || mediaState === "loading"}
          aria-label={`Refresh ${label.toLowerCase()} options`}
          title={`Refresh ${label.toLowerCase()} options`}
        >
          <RefreshCw className={cn(mediaState === "loading" && "animate-spin")} aria-hidden="true" />
        </Button>
      </div>
      <div className="flex items-start gap-3">
        <div
          className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/30"
          aria-hidden="true"
        >
          {previewUrl !== "" ? (
            <img src={previewUrl} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <FileImage className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <select
            id={id}
            className={selectClassName}
            value={value}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${statusId} ${errorId}` : statusId}
            onChange={(event) => onChange(event.currentTarget.value)}
          >
            <option value="">No image</option>
            {media.map((item) => (
              <option key={item.id} value={item.url}>
                {mediaOptionLabel(item)}
              </option>
            ))}
            {missing ? <option value={value}>{missingOptionLabel(value)}</option> : null}
          </select>
          <p
            id={statusId}
            className={cn("text-xs", mediaState === "error" ? "text-destructive" : "text-muted-foreground")}
            aria-live="polite"
          >
            {mediaState === "loading"
              ? "Loading images…"
              : mediaState === "error"
                ? `Images could not be loaded: ${mediaError ?? "Unknown error."}`
                : media.length === 0
                  ? "Upload images in the Media tab to choose one."
                  : `${media.length} image${media.length === 1 ? "" : "s"} available.`}
          </p>
        </div>
      </div>
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
