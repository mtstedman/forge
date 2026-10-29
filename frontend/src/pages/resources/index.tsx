import type { GetServerSideProps } from "next"
import { ArrowLeft, ArrowRight } from "lucide-react"
import * as React from "react"

import { PublicLayout } from "@/components/public-layout"
import { Seo } from "@/components/seo"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getFrontendConfig } from "@/lib/config.server"
import {
  DEFAULT_AUTHOR,
  LISTING_DESCRIPTION,
  RESOURCES_PER_PAGE,
  RETRY_AFTER_SECONDS,
  SITE_NAME,
  buildListingJsonLd,
  displayDate,
  isoDate,
  listingPath,
  parsePageParam,
  resourcePath,
  text,
} from "@/lib/resource-seo"
import { getPosts } from "@/lib/server-api"
import type { PostSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

type ResourcesPageProps = {
  status: 200 | 404 | 503
  page: number
  totalPages: number
  posts: PostSummary[]
  selectedTags: string[]
  availableTags: string[]
  siteUrl: string
}

function normalizeTagQuery(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return Array.from(new Set(values.map((tag) => tag.trim()).filter(Boolean)))
}

function listingPathWithTags(page: number, tags: string[]): string {
  const query = new URLSearchParams()
  if (page > 1) query.set("page", String(page))
  tags.forEach((tag) => query.append("tag", tag))
  const encodedQuery = query.toString()
  return encodedQuery === "" ? listingPath(1) : `${listingPath(1)}?${encodedQuery}`
}

export const getServerSideProps: GetServerSideProps<ResourcesPageProps> = async ({
  query,
  res,
}) => {
  const { publicConfig } = getFrontendConfig()
  const page = parsePageParam(query.page)
  const selectedTags = normalizeTagQuery(query.tag)

  let status: ResourcesPageProps["status"] = 200
  let posts: PostSummary[] = []
  let availableTags: string[] = []
  let total = 0

  try {
    const response = await getPosts(page, RESOURCES_PER_PAGE, selectedTags)
    posts = response.data.filter((post) => post.slug !== "").slice(0, RESOURCES_PER_PAGE)
    total = response.meta.total >= 0 ? response.meta.total : posts.length
    availableTags = response.meta.available_tags
  } catch {
    status = 503
  }

  const totalPages = Math.max(1, Math.ceil(total / RESOURCES_PER_PAGE))
  if (status === 200 && page > totalPages) {
    status = 404
    posts = []
  }

  res.statusCode = status
  if (status === 503) {
    res.setHeader("Retry-After", RETRY_AFTER_SECONDS)
    posts = []
  }

  return {
    props: {
      status,
      page,
      totalPages,
      posts,
      selectedTags,
      availableTags,
      siteUrl: publicConfig.siteUrl,
    },
  }
}

const containerClass = "mx-auto max-w-7xl px-5 sm:px-8 lg:px-10"
const eyebrowClass = "text-xs font-bold uppercase tracking-[0.22em] text-primary"

function ListingError({
  status,
  retryPath,
}: {
  status: 404 | 503
  retryPath: string
}): React.JSX.Element {
  const missing = status === 404
  return (
    <section
      aria-labelledby="error-title"
      className={cn(containerClass, "py-20 sm:py-28")}
    >
      <div className="flex max-w-2xl flex-col items-start gap-6">
        <p className={eyebrowClass}>{missing ? "Error 404" : "Error 503"}</p>
        <h1 id="error-title" className="text-4xl font-semibold leading-[1.05] sm:text-6xl">
          {missing ? "Page not found" : "Resources are temporarily unavailable"}
        </h1>
        {missing ? (
          <>
            <p className="text-lg leading-8 text-muted-foreground">
              There are no resources on this page. Head back to the first page to see the
              latest articles.
            </p>
            <a href={retryPath} className={buttonVariants({ variant: "outline", size: "lg" })}>
              View the latest resources
            </a>
          </>
        ) : (
          <>
            <p role="status" className="text-lg leading-8 text-muted-foreground">
              We couldn&apos;t load our articles right now. Please wait a minute and try again.
            </p>
            <a href={retryPath} className={buttonVariants({ variant: "outline", size: "lg" })}>
              Try again
            </a>
          </>
        )}
      </div>
    </section>
  )
}

function ResourceCard({ post }: { post: PostSummary }): React.JSX.Element {
  const published = isoDate(post.published_at)
  const coverUrl = post.cover ? text(post.cover.url) : ""
  const safeCover = /^(https?:)?\/\//i.test(coverUrl) || coverUrl.startsWith("/") ? coverUrl : ""

  return (
    <li className="h-full">
      <Card className="h-full overflow-hidden">
        {safeCover !== "" ? (
          <img
            src={safeCover}
            alt={text(post.cover?.alt)}
            loading="lazy"
            decoding="async"
            className="-mt-6 aspect-[16/10] w-full object-cover"
          />
        ) : null}
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
            <span>{text(post.category, "Resource")}</span>
            {published !== "" ? (
              <time dateTime={published}>{displayDate(post.published_at)}</time>
            ) : null}
          </div>
          <CardTitle>
            <h2 className="mt-4 text-2xl leading-tight">
              <a className="rounded-sm hover:text-primary" href={resourcePath(post.slug)}>
                {text(post.title, "Untitled resource")}
              </a>
            </h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1">
          <CardDescription className="text-base leading-7">{text(post.excerpt)}</CardDescription>
        </CardContent>
        <CardFooter className="text-sm text-muted-foreground">
          By {text(post.author_name, DEFAULT_AUTHOR)}
        </CardFooter>
      </Card>
    </li>
  )
}

export default function ResourcesPage({
  status,
  page,
  totalPages,
  posts,
  selectedTags,
  availableTags,
  siteUrl,
}: ResourcesPageProps): React.JSX.Element {
  const canonicalPath = listingPathWithTags(page, selectedTags)
  const canonical = `${siteUrl}${canonicalPath}`

  if (status !== 200) {
    const missing = status === 404
    return (
      <>
        <Seo
          title={`${missing ? "Page not found" : "Resources are temporarily unavailable"} | ${SITE_NAME}`}
          description={
            missing
              ? "This page of resources does not exist."
              : "Our resources are temporarily unavailable. Please try again shortly."
          }
          canonical={canonical}
          noindex
        />
        <PublicLayout active="resources">
          <ListingError
            status={status}
            retryPath={
              status === 404 ? listingPathWithTags(1, selectedTags) : canonicalPath
            }
          />
        </PublicLayout>
      </>
    )
  }

  const pageSuffix = page > 1 ? ` — Page ${page} of ${totalPages}` : ""
  const description =
    page > 1 ? `${LISTING_DESCRIPTION} Page ${page} of ${totalPages}.` : LISTING_DESCRIPTION
  const jsonLd = buildListingJsonLd({
    siteUrl,
    canonical,
    page,
    name: `Resources${pageSuffix}`,
    description,
    posts,
  })

  return (
    <>
      <Seo
        title={`Resources${pageSuffix} | ${SITE_NAME}`}
        description={description}
        canonical={canonical}
        prev={
          page > 1 ? `${siteUrl}${listingPathWithTags(page - 1, selectedTags)}` : undefined
        }
        next={
          page < totalPages
            ? `${siteUrl}${listingPathWithTags(page + 1, selectedTags)}`
            : undefined
        }
        jsonLd={jsonLd}
      />
      <PublicLayout active="resources">
        <header className={cn(containerClass, "flex flex-col gap-5 pt-16 sm:pt-24")}>
          <p className={eyebrowClass}>
            Resources{page > 1 ? ` · Page ${page} of ${totalPages}` : ""}
          </p>
          <h1 className="max-w-4xl text-5xl font-semibold leading-none sm:text-6xl lg:text-7xl">
            Notes from the training floor
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
            Practical, evidence-based guidance on recovering from injury, returning to sport and
            training for the long haul.
          </p>
        </header>

        <section aria-label="Articles" className={cn(containerClass, "py-12 sm:py-16")}>
          {availableTags.length > 0 ? (
            <div
              role="group"
              className="mb-10 border-b pb-8"
              aria-labelledby="resource-tag-filter-title"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="resource-tag-filter-title" className="text-sm font-semibold">
                  Filter resources by tag
                </h2>
                {selectedTags.length > 0 ? (
                  <a
                    href={listingPath(1)}
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                  >
                    Clear filters
                  </a>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {availableTags.map((tag) => {
                  const selected = selectedTags.includes(tag)
                  const nextTags = selected
                    ? selectedTags.filter((selectedTag) => selectedTag !== tag)
                    : [...selectedTags, tag]

                  return (
                    <form key={tag} action={listingPath(1)} method="get">
                      {nextTags.map((nextTag) => (
                        <input key={nextTag} type="hidden" name="tag" value={nextTag} />
                      ))}
                      <button
                        type="submit"
                        aria-pressed={selected}
                        className={buttonVariants({
                          variant: selected ? "default" : "outline",
                          size: "sm",
                        })}
                      >
                        {tag}
                      </button>
                    </form>
                  )
                })}
              </div>
            </div>
          ) : null}

          {posts.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-muted-foreground">
              {selectedTags.length > 0 ? (
                <div className="flex flex-col items-start gap-4">
                  <p>No resources match the selected tags.</p>
                  <a href={listingPath(1)} className={buttonVariants({ variant: "outline" })}>
                    Clear filters
                  </a>
                </div>
              ) : (
                <p>New articles are on the way. Visit the resources page again soon.</p>
              )}
            </div>
          ) : (
            <ul role="list" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <ResourceCard key={`${post.id}-${post.slug}`} post={post} />
              ))}
            </ul>
          )}

          {totalPages > 1 ? (
            <nav
              aria-label="Pagination"
              className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t pt-6 text-sm text-muted-foreground"
            >
              {page > 1 ? (
                <a
                  rel="prev"
                  href={listingPathWithTags(page - 1, selectedTags)}
                  className={buttonVariants({ variant: "ghost" })}
                >
                  <ArrowLeft className="size-4" aria-hidden="true" /> Newer resources
                </a>
              ) : (
                <span className="min-w-px" />
              )}
              <span aria-current="page">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <a
                  rel="next"
                  href={listingPathWithTags(page + 1, selectedTags)}
                  className={buttonVariants({ variant: "ghost" })}
                >
                  Older resources <ArrowRight className="size-4" aria-hidden="true" />
                </a>
              ) : (
                <span className="min-w-px" />
              )}
            </nav>
          ) : null}
        </section>
      </PublicLayout>
    </>
  )
}
