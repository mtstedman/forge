const DEFAULT_TIMEOUT_MS = 10_000

export class ApiError extends Error {
  status: number
  fields: Record<string, string>
  retryAfter: string | null

  constructor(
    message: string,
    status: number,
    fields: Record<string, string> = {},
    retryAfter: string | null = null
  ) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.fields = fields
    this.retryAfter = retryAfter
  }
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "")
  return path === "" ? base : `${base}${path.startsWith("/") ? path : `/${path}`}`
}

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData
}

function normalizeFields(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  const fields: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string") {
      fields[key] = raw
    } else if (typeof raw === "number" || typeof raw === "boolean") {
      fields[key] = String(raw)
    } else if (Array.isArray(raw)) {
      const firstMessage = raw.find((item) => typeof item === "string")
      if (typeof firstMessage === "string") fields[key] = firstMessage
    }
  }

  return fields
}

function defaultMessage(status: number): string {
  switch (status) {
    case 400:
      return "The request was invalid."
    case 401:
      return "Authentication is required."
    case 403:
      return "You do not have permission to do that."
    case 404:
      return "Not found."
    case 413:
      return "The upload is too large."
    case 422:
      return "Validation failed."
    case 429:
      return "Too many requests. Please try again later."
    default:
      return status >= 500
        ? "The service is temporarily unavailable."
        : `Request failed with HTTP status ${status}.`
  }
}

export async function requestJson<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  if (baseUrl.trim() === "") {
    throw new ApiError("The API is not configured.", 503)
  }

  const headers = new Headers(init?.headers)
  if (!headers.has("Accept")) headers.set("Accept", "application/json")

  const body = init?.body
  if (isFormData(body)) {
    // The runtime must provide the multipart boundary.
    headers.delete("Content-Type")
  } else if (typeof body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, DEFAULT_TIMEOUT_MS)

  const callerSignal = init?.signal ?? null
  const abortFromCaller = () => controller.abort()
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort()
    } else {
      callerSignal.addEventListener("abort", abortFromCaller, { once: true })
    }
  }

  let response: Response
  let responseText: string

  try {
    response = await fetch(joinUrl(baseUrl, path), {
      ...init,
      body,
      headers,
      signal: controller.signal,
    })
    responseText = await response.text()
  } catch {
    throw new ApiError(
      timedOut || callerSignal?.aborted
        ? "The request timed out."
        : "The service could not be reached.",
      0
    )
  } finally {
    clearTimeout(timeout)
    callerSignal?.removeEventListener("abort", abortFromCaller)
  }

  let payload: unknown = undefined
  let invalidJson = false
  if (response.status !== 204 && responseText.trim() !== "") {
    try {
      payload = JSON.parse(responseText)
    } catch {
      invalidJson = true
    }
  }

  if (!response.ok) {
    const errorBody =
      payload !== null && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {}
    const message =
      typeof errorBody.error === "string" && errorBody.error !== ""
        ? errorBody.error
        : typeof errorBody.message === "string" && errorBody.message !== ""
          ? errorBody.message
          : defaultMessage(response.status)

    throw new ApiError(
      message,
      response.status,
      normalizeFields(errorBody.fields),
      response.headers.get("Retry-After")
    )
  }

  if (invalidJson) {
    throw new ApiError("The service returned an invalid response.", 502)
  }

  return payload as T
}

export function resolveMediaUrl(url: string, apiUrl: string): string {
  const value = url.trim()
  if (value === "") return ""

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return /^https?:\/\//i.test(value) ? value : ""
  }

  const publicApiUrl = apiUrl.trim()
  if (value.startsWith("//")) {
    if (publicApiUrl === "") return value
    try {
      return new URL(value, publicApiUrl).toString()
    } catch {
      return value
    }
  }

  if (publicApiUrl === "") return value

  try {
    const origin = new URL(publicApiUrl)
    if (origin.protocol !== "http:" && origin.protocol !== "https:") return value
    return new URL(`/${value.replace(/^\/+/, "")}`, origin.origin).toString()
  } catch {
    return value
  }
}
