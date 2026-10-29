import type { ApiEnvelope, MediaItem } from "@/lib/types"

export type AdminRequest = <T>(path: string, init?: RequestInit) => Promise<T>

export const ACCEPTED_IMAGE_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
])
export const ACCEPT_ATTRIBUTE: string =
  "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function finiteNumber(value: unknown): number | null {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN
  return Number.isFinite(number) ? number : null
}

export function normalizeMediaItem(value: unknown): MediaItem | null {
  const row = recordOf(value)
  if (!row) return null

  const id = finiteNumber(row.id)
  if (!Number.isInteger(id) || typeof row.url !== "string") return null

  return {
    id: id as number,
    url: row.url,
    original_name: typeof row.original_name === "string" ? row.original_name : "",
    mime_type: typeof row.mime_type === "string" ? row.mime_type : "",
    size_bytes: finiteNumber(row.size_bytes) ?? 0,
    width: finiteNumber(row.width),
    height: finiteNumber(row.height),
    alt_text: typeof row.alt_text === "string" ? row.alt_text : null,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
  }
}

export function mediaLabel(media: MediaItem): string {
  return media.original_name || `Image ${media.id}`
}

export async function fetchAdminMedia(request: AdminRequest): Promise<MediaItem[]> {
  const payload = await request<ApiEnvelope<unknown>>("/admin/media")
  const rows = Array.isArray(payload?.data) ? payload.data : []
  return rows.flatMap((row) => normalizeMediaItem(row) ?? [])
}

export async function uploadAdminMedia(
  request: AdminRequest,
  input: { file: File; altText: string }
): Promise<MediaItem> {
  const form = new FormData()
  form.append("file", input.file)
  form.append("alt_text", input.altText.trim())

  const payload = await request<ApiEnvelope<unknown>>("/admin/media", {
    method: "POST",
    body: form,
  })
  const item = normalizeMediaItem(payload?.data)
  if (!item) throw new Error("The uploaded image response could not be read.")
  return item
}
