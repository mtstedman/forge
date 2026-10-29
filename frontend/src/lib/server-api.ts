import { ApiError, requestJson } from "@/lib/api"
import { getFrontendConfig } from "@/lib/config.server"
import {
  normalizeMainPageContentResponse,
  type MainPageContent,
} from "@/lib/main-page-content"
import type {
  PostDetail,
  PostSummary,
  PostsResponse,
  PublicComment,
} from "@/lib/types"

const SERVER_TIMEOUT_MS = 4_000

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function malformedResponse(): ApiError {
  return new ApiError("The service returned an unexpected response.", 502)
}

function stringValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return fallback
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const normalized = stringValue(value)
  return normalized === "" ? null : normalized
}

function integerValue(value: unknown, fallback = 0): number {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN
  return Number.isFinite(number) ? Math.trunc(number) : fallback
}

function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    return normalized === "1" || normalized === "true"
  }
  return false
}

function normalizeSummary(raw: unknown): PostSummary {
  if (!isObject(raw)) throw malformedResponse()

  const slug = stringValue(raw.slug)
  if (slug === "") throw malformedResponse()

  let cover: PostSummary["cover"] = null
  if (isObject(raw.cover)) {
    const url = stringValue(raw.cover.url)
    if (url !== "") {
      cover = { url, alt: stringValue(raw.cover.alt) }
    }
  }

  return {
    id: integerValue(raw.id),
    slug,
    title: stringValue(raw.title),
    excerpt: nullableString(raw.excerpt),
    category: nullableString(raw.category),
    tags: Array.isArray(raw.tags)
      ? raw.tags.map((tag) => stringValue(tag)).filter((tag) => tag !== "")
      : [],
    cover,
    author_name: nullableString(raw.author_name),
    published_at: nullableString(raw.published_at),
    updated_at: nullableString(raw.updated_at),
  }
}

function normalizeComment(raw: unknown): PublicComment | null {
  if (!isObject(raw)) return null
  return {
    id: integerValue(raw.id),
    author_name: stringValue(raw.author_name),
    body: stringValue(raw.body),
    created_at: stringValue(raw.created_at),
  }
}

function normalizeDetail(raw: unknown): PostDetail {
  const summary = normalizeSummary(raw)
  const detail = raw as JsonObject

  const faq = Array.isArray(detail.faq)
    ? detail.faq
        .filter(isObject)
        .map((item) => ({
          question: stringValue(item.question),
          answer: stringValue(item.answer),
        }))
        .filter((item) => item.question !== "" && item.answer !== "")
    : []

  const comments = Array.isArray(detail.comments)
    ? detail.comments
        .map(normalizeComment)
        .filter((comment): comment is PublicComment => comment !== null)
    : []

  return {
    ...summary,
    body_html: stringValue(detail.body_html),
    faq,
    meta_title: nullableString(detail.meta_title),
    meta_description: nullableString(detail.meta_description),
    comments_enabled: booleanValue(detail.comments_enabled),
    comments,
  }
}

async function getJson(path: string): Promise<unknown> {
  const { apiBaseUrl } = getFrontendConfig()
  if (apiBaseUrl === "") {
    throw new ApiError("The API is not configured.", 503)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SERVER_TIMEOUT_MS)
  try {
    return await requestJson<unknown>(apiBaseUrl, path, {
      method: "GET",
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

export async function getMainPageContent(): Promise<MainPageContent> {
  const payload = await getJson("/main-page-content")
  return normalizeMainPageContentResponse(payload)
}

export async function getPosts(
  page: number,
  perPage: number,
  tags: string[] = []
): Promise<PostsResponse> {
  const safePage = Math.min(
    100_000,
    Math.max(1, Math.trunc(Number.isFinite(page) ? page : 1))
  )
  const safePerPage = Math.min(
    50,
    Math.max(1, Math.trunc(Number.isFinite(perPage) ? perPage : 10))
  )
  const query = new URLSearchParams({
    page: String(safePage),
    per_page: String(safePerPage),
  })
  const normalizedTags = Array.from(
    new Set(
      tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  )
  normalizedTags.forEach((tag) => query.append("tags[]", tag))

  const payload = await getJson(`/posts?${query.toString()}`)
  if (!isObject(payload) || !Array.isArray(payload.data)) {
    throw malformedResponse()
  }

  const meta = isObject(payload.meta) ? payload.meta : {}
  const availableTags = Array.isArray(meta.available_tags)
    ? Array.from(
        new Set(
          meta.available_tags
            .filter((tag): tag is string => typeof tag === "string")
            .map((tag) => tag.trim())
            .filter(Boolean)
        )
      )
    : []
  return {
    data: payload.data.map(normalizeSummary),
    meta: {
      page: integerValue(meta.page, safePage),
      per_page: integerValue(meta.per_page, safePerPage),
      total: integerValue(meta.total),
      available_tags: availableTags,
    },
  }
}

export async function getPost(slug: string): Promise<PostDetail> {
  const normalizedSlug = slug.trim()
  if (normalizedSlug === "" || normalizedSlug.length > 200) {
    throw new ApiError("Post not found.", 404)
  }

  const payload = await getJson(`/posts/${encodeURIComponent(normalizedSlug)}`)
  if (!isObject(payload) || !isObject(payload.data)) {
    throw malformedResponse()
  }

  return normalizeDetail(payload.data)
}
