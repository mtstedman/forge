import type { PostDetail, PostSummary } from "@/lib/types"

/*
 * Pure helpers shared by the resource listing, resource detail, comments and
 * discovery surfaces. Nothing here touches server-only configuration, so the
 * module is safe to import from client components.
 */

export const SITE_NAME = "Forge Performance Therapy"
export const DEFAULT_AUTHOR = "Dr. Joseph Sperlak"
export const RESOURCES_PER_PAGE = 9
export const RELATED_CANDIDATES = 7
export const RELATED_LIMIT = 3
export const MAX_RESOURCE_PAGE = 100_000
export const RETRY_AFTER_SECONDS = "120"

export const LISTING_DESCRIPTION =
  "Evidence-based articles on injury recovery, rehabilitation and performance training from Dr. Joseph Sperlak of Forge Performance Therapy."

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

/** Machine-readable date in ATOM/ISO-8601 form ("2026-09-01T12:00:00+00:00"), or "" when invalid. */
export function isoDate(value: string | null | undefined): string {
  const raw = typeof value === "string" ? value.trim() : ""
  if (raw === "") return ""

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ""

  // Preserve an already well-formed offset timestamp exactly as the API sent it.
  if (ISO_WITH_OFFSET.test(raw)) return raw

  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}+00:00`
  )
}

const displayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

/** Human-readable date ("Sep 1, 2026"); formatted in UTC so server and client output match. */
export function displayDate(value: string | null | undefined): string {
  const raw = typeof value === "string" ? value.trim() : ""
  if (raw === "") return ""
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? "" : displayFormatter.format(date)
}

export function text(value: string | null | undefined, fallback = ""): string {
  const trimmed = typeof value === "string" ? value.trim() : ""
  return trimmed === "" ? fallback : trimmed
}

export function resourcePath(slug: string): string {
  return `/resources/${encodeURIComponent(slug)}`
}

export function listingPath(page: number): string {
  return page <= 1 ? "/resources/" : `/resources/?page=${page}`
}

/** Positive integer page number between 1 and MAX_RESOURCE_PAGE; anything else defaults to page 1. */
export function parsePageParam(value: string | string[] | undefined): number {
  const raw = typeof value === "string" ? value.trim() : ""
  if (!/^[+]?(0|[1-9]\d*)$/.test(raw)) return 1
  const page = Number(raw)
  return Number.isSafeInteger(page) && page >= 1 && page <= MAX_RESOURCE_PAGE ? page : 1
}

/** Absolute URL for SEO metadata: keeps http(s) URLs, upgrades protocol-relative URLs and resolves paths against the site. */
export function absoluteUrl(url: string | null | undefined, siteUrl: string): string {
  const value = typeof url === "string" ? url.trim() : ""
  if (value === "") return ""
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith("//")) return `https:${value}`
  return `${siteUrl}/${value.replace(/^\/+/, "")}`
}

/** Up to three related posts, excluding the current post, with same-category posts first (stable otherwise). */
export function selectRelated(
  candidates: PostSummary[],
  currentSlug: string,
  category: string
): PostSummary[] {
  const rank = (item: PostSummary): number =>
    category !== "" && item.category === category ? 0 : 1

  return candidates
    .filter((item) => item.slug !== "" && item.slug !== currentSlug)
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
    .slice(0, RELATED_LIMIT)
    .map(({ item }) => item)
}

export function buildListingJsonLd(options: {
  siteUrl: string
  canonical: string
  page: number
  name: string
  description: string
  posts: PostSummary[]
}): Record<string, unknown> {
  const { siteUrl, canonical, page, name, description, posts } = options
  const offset = (page - 1) * RESOURCES_PER_PAGE

  const breadcrumbs: Record<string, unknown>[] = [
    { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
    { "@type": "ListItem", position: 2, name: "Resources", item: `${siteUrl}/resources/` },
  ]
  if (page > 1) {
    breadcrumbs.push({ "@type": "ListItem", position: 3, name: `Page ${page}`, item: canonical })
  }

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name,
        description,
        isPartOf: { "@id": `${siteUrl}/#website` },
        breadcrumb: { "@id": `${canonical}#breadcrumb` },
        mainEntity: { "@id": `${canonical}#itemlist` },
      },
      {
        "@type": "ItemList",
        "@id": `${canonical}#itemlist`,
        numberOfItems: posts.length,
        itemListElement: posts.map((post, index) => ({
          "@type": "ListItem",
          position: offset + index + 1,
          url: `${siteUrl}${resourcePath(post.slug)}`,
          name: text(post.title, "Untitled resource"),
        })),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonical}#breadcrumb`,
        itemListElement: breadcrumbs,
      },
    ],
  }
}

export type PostSeo = {
  title: string
  metaTitle: string
  description: string
  canonical: string
  authorName: string
  category: string
  publishedIso: string
  updatedIso: string
  coverUrl: string
  coverAlt: string
  tags: string[]
  jsonLd: Record<string, unknown>
}

export function buildPostSeo(post: PostDetail, siteUrl: string): PostSeo {
  const title = text(post.title, "Untitled resource")
  const excerpt = text(post.excerpt)
  const category = text(post.category)
  const authorName = text(post.author_name, DEFAULT_AUTHOR)
  const publishedIso = isoDate(post.published_at)
  const updatedIso = isoDate(post.updated_at) || publishedIso
  const tags = post.tags.map((tag) => tag.trim()).filter((tag) => tag !== "")
  const coverUrl = post.cover ? absoluteUrl(post.cover.url, siteUrl) : ""
  const coverAlt = post.cover ? text(post.cover.alt) : ""
  const canonical = `${siteUrl}${resourcePath(post.slug)}`
  const metaTitle = text(post.meta_title, `${title} | ${SITE_NAME}`)
  const description = text(post.meta_description, excerpt)

  const blogPosting: Record<string, unknown> = {
    "@type": "BlogPosting",
    "@id": `${canonical}#article`,
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    url: canonical,
    headline: Array.from(title).slice(0, 110).join(""),
    description,
    datePublished: publishedIso,
    dateModified: updatedIso,
    author: { "@type": "Person", name: authorName },
    publisher: {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: SITE_NAME,
      url: `${siteUrl}/`,
    },
    inLanguage: "en-US",
  }
  if (coverUrl !== "") {
    blogPosting.image = { "@type": "ImageObject", url: coverUrl, caption: coverAlt }
  }
  if (category !== "") blogPosting.articleSection = category
  if (tags.length > 0) blogPosting.keywords = tags.join(", ")
  for (const [key, value] of Object.entries(blogPosting)) {
    if (value === "") delete blogPosting[key]
  }

  const graph: Record<string, unknown>[] = [
    blogPosting,
    {
      "@type": "BreadcrumbList",
      "@id": `${canonical}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: "Resources", item: `${siteUrl}/resources/` },
        { "@type": "ListItem", position: 3, name: title, item: canonical },
      ],
    },
  ]

  if (post.faq.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${canonical}#faq`,
      mainEntity: post.faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    })
  }

  return {
    title,
    metaTitle,
    description,
    canonical,
    authorName,
    category,
    publishedIso,
    updatedIso,
    coverUrl,
    coverAlt,
    tags,
    jsonLd: { "@context": "https://schema.org", "@graph": graph },
  }
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}
