import type { GetServerSideProps } from "next"

import { getFrontendConfig } from "@/lib/config.server"
import { RETRY_AFTER_SECONDS, escapeXml, isoDate, resourcePath } from "@/lib/resource-seo"
import { getPosts } from "@/lib/server-api"
import type { PostSummary } from "@/lib/types"

/*
 * XML sitemap: the home page, the resources index and every published resource.
 * Posts are fetched in pages of 50, capped at 200 pages.
 */

const PER_PAGE = 50
const MAX_PAGES = 200
const CONCURRENCY = 8

type SitemapEntry = { loc: string; lastmod: string }

async function fetchAllPosts(): Promise<PostSummary[][]> {
  const first = await getPosts(1, PER_PAGE)
  const total = first.meta.total
  const pageCount = total > 0 ? Math.min(MAX_PAGES, Math.ceil(total / PER_PAGE)) : 1

  const pages: PostSummary[][] = [first.data]
  const remaining: number[] = []
  for (let number = 2; number <= pageCount; number += 1) remaining.push(number)

  // Fetch the remaining pages concurrently in bounded batches; any failure fails the sitemap.
  for (let index = 0; index < remaining.length; index += CONCURRENCY) {
    const batch = remaining.slice(index, index + CONCURRENCY)
    const responses = await Promise.all(batch.map((number) => getPosts(number, PER_PAGE)))
    for (const response of responses) pages.push(response.data)
  }

  return pages
}

function buildEntries(siteUrl: string, pages: PostSummary[][]): SitemapEntry[] {
  const entries: SitemapEntry[] = []
  const seen = new Set<string>()
  let newest = ""
  let newestTime = Number.NEGATIVE_INFINITY

  for (const items of pages) {
    for (const item of items) {
      if (item.slug === "") continue
      // Only published resources: drafts have no published_at.
      const published = isoDate(item.published_at)
      if (published === "" || seen.has(item.slug)) continue
      seen.add(item.slug)

      const lastmod = isoDate(item.updated_at) || published
      const time = Date.parse(lastmod)
      if (newest === "" || time > newestTime) {
        newest = lastmod
        newestTime = time
      }

      entries.push({ loc: `${siteUrl}${resourcePath(item.slug)}`, lastmod })
    }
  }

  return [
    { loc: `${siteUrl}/`, lastmod: newest },
    { loc: `${siteUrl}/resources/`, lastmod: newest },
    ...entries,
  ]
}

function renderXml(entries: SitemapEntry[]): string {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
  for (const entry of entries) {
    lines.push("  <url>")
    lines.push(`    <loc>${escapeXml(entry.loc)}</loc>`)
    if (entry.lastmod !== "") lines.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`)
    lines.push("  </url>")
  }
  lines.push("</urlset>")
  return `${lines.join("\n")}\n`
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const { publicConfig } = getFrontendConfig()

  let status = 200
  let pages: PostSummary[][] = []
  try {
    pages = await fetchAllPosts()
  } catch {
    status = 503
    pages = []
  }

  res.statusCode = status
  res.setHeader("Content-Type", "application/xml; charset=UTF-8")
  if (status === 503) res.setHeader("Retry-After", RETRY_AFTER_SECONDS)
  res.end(renderXml(buildEntries(publicConfig.siteUrl, pages)))

  return { props: {} }
}

export default function Sitemap(): null {
  return null
}
