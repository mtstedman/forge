import type { GetServerSideProps } from "next"
import Head from "next/head"
import * as React from "react"

import { PublicLayout } from "@/components/public-layout"
import { ResourceComments } from "@/components/resource-comments"
import { Seo } from "@/components/seo"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ApiError } from "@/lib/api"
import { getFrontendConfig } from "@/lib/config.server"
import {
  RELATED_CANDIDATES,
  RETRY_AFTER_SECONDS,
  SITE_NAME,
  buildPostSeo,
  displayDate,
  isoDate,
  resourcePath,
  selectRelated,
  text,
} from "@/lib/resource-seo"
import { getPost, getPosts } from "@/lib/server-api"
import type { PostDetail, PostSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

type ResourceErrorProps = {
  status: 404 | 503
  slug: string
  siteUrl: string
}

type ResourceSuccessProps = {
  status: 200
  post: PostDetail
  related: PostSummary[]
  siteUrl: string
  apiUrl: string
}

type ResourcePageProps = ResourceErrorProps | ResourceSuccessProps

export const getServerSideProps: GetServerSideProps<ResourcePageProps> = async ({
  params,
  res,
}) => {
  const { publicConfig } = getFrontendConfig()
  const rawSlug = params?.slug
  const slug = typeof rawSlug === "string" ? rawSlug.trim() : ""

  const fail = (status: 404 | 503) => {
    res.statusCode = status
    if (status === 503) res.setHeader("Retry-After", RETRY_AFTER_SECONDS)
    return { props: { status, slug, siteUrl: publicConfig.siteUrl } as ResourceErrorProps }
  }

  // Invalid slugs are missing resources; they never reach the API.
  if (slug === "" || slug.length > 200) return fail(404)

  // Fire both requests before waiting so they run concurrently.
  const [postResult, listResult] = await Promise.allSettled([
    getPost(slug),
    getPosts(1, RELATED_CANDIDATES),
  ])

  if (postResult.status === "rejected") {
    const reason = postResult.reason
    return fail(reason instanceof ApiError && reason.status === 404 ? 404 : 503)
  }

  const post = postResult.value
  const candidates = listResult.status === "fulfilled" ? listResult.value.data : []

  res.statusCode = 200
  return {
    props: {
      status: 200,
      post,
      related: selectRelated(candidates, post.slug, text(post.category)),
      siteUrl: publicConfig.siteUrl,
      apiUrl: publicConfig.apiUrl,
    },
  }
}

const containerClass = "mx-auto max-w-7xl px-5 sm:px-8 lg:px-10"
const eyebrowClass = "text-xs font-bold uppercase tracking-[0.22em] text-primary"

// Styles for API-rendered article HTML (no typography plugin is installed).
const articleBodyClass = cn(
  "text-[1.0625rem] leading-8",
  "[&>*+*]:mt-5 [&_h2]:mt-10 [&_h2]:text-3xl [&_h2]:font-semibold [&_h2]:leading-tight",
  "[&_h3]:mt-8 [&_h3]:text-2xl [&_h3]:font-semibold [&_h3]:leading-snug",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4",
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li+li]:mt-2",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-forge-gold [&_blockquote]:pl-5 [&_blockquote]:italic",
  "[&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg",
  "[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4 [&_code]:text-sm",
  "[&_table]:w-full [&_table]:text-sm [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2"
)

function ResourceError({ status, slug, siteUrl }: ResourceErrorProps): React.JSX.Element {
  const missing = status === 404
  const errorTitle = missing ? "Resource not found" : "Resources are temporarily unavailable"
  const retryPath = resourcePath(slug)

  return (
    <>
      <Seo
        title={`${errorTitle} | ${SITE_NAME}`}
        description={
          missing
            ? "The resource you were looking for could not be found."
            : "Our resources are temporarily unavailable. Please try again shortly."
        }
        canonical={slug === "" ? `${siteUrl}/resources/` : `${siteUrl}${retryPath}`}
        noindex
      />
      <PublicLayout active="resources">
        <section aria-labelledby="error-title" className={cn(containerClass, "py-20 sm:py-28")}>
          <div className="mx-auto flex max-w-2xl flex-col items-start gap-6">
            <p className={eyebrowClass}>{missing ? "Error 404" : "Error 503"}</p>
            <h1 id="error-title" className="text-4xl font-semibold leading-[1.05] sm:text-6xl">
              {errorTitle}
            </h1>
            {missing ? (
              <>
                <p className="text-lg leading-8 text-muted-foreground">
                  This article may have moved or is no longer published. Browse the full library
                  of resources instead.
                </p>
                <a href="/resources/" className={buttonVariants({ variant: "outline", size: "lg" })}>
                  Browse all resources
                </a>
              </>
            ) : (
              <>
                <p role="status" className="text-lg leading-8 text-muted-foreground">
                  We couldn&apos;t load this resource right now. Please wait a minute and try again.
                </p>
                <div className="flex flex-wrap gap-3">
                  <a href={retryPath} className={buttonVariants({ variant: "outline", size: "lg" })}>
                    Try again
                  </a>
                  <a href="/resources/" className={buttonVariants({ variant: "ghost", size: "lg" })}>
                    Back to resources
                  </a>
                </div>
              </>
            )}
          </div>
        </section>
      </PublicLayout>
    </>
  )
}

function RelatedResources({ related }: { related: PostSummary[] }): React.JSX.Element | null {
  if (related.length === 0) return null

  return (
    <section
      aria-labelledby="related-title"
      className="border-t border-border/80 bg-card py-16 sm:py-24"
    >
      <div className={containerClass}>
        <p className={cn(eyebrowClass, "mb-4")}>Keep reading</p>
        <h2 id="related-title" className="text-4xl font-semibold leading-[1.05] sm:text-5xl">
          Related resources
        </h2>
        <ul role="list" className="mt-10 grid gap-6 md:grid-cols-3">
          {related.map((item) => {
            const published = isoDate(item.published_at)
            return (
              <li key={`${item.id}-${item.slug}`} className="h-full">
                <Card className="h-full">
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      <span>{text(item.category, "Resource")}</span>
                      {published !== "" ? (
                        <time dateTime={published}>{displayDate(item.published_at)}</time>
                      ) : null}
                    </div>
                    <CardTitle>
                      <h3 className="mt-4 text-2xl leading-tight">
                        <a className="rounded-sm hover:text-primary" href={resourcePath(item.slug)}>
                          {text(item.title, "Untitled resource")}
                        </a>
                      </h3>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base leading-7">
                      {text(item.excerpt)}
                    </CardDescription>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

export default function ResourcePage(props: ResourcePageProps): React.JSX.Element {
  if (props.status !== 200) return <ResourceError {...props} />

  const { post, related, siteUrl, apiUrl } = props
  const seo = buildPostSeo(post, siteUrl)
  const excerpt = text(post.excerpt)

  return (
    <>
      <Seo
        title={seo.metaTitle}
        description={seo.description}
        canonical={seo.canonical}
        type="article"
        image={seo.coverUrl || undefined}
        publishedTime={seo.publishedIso || undefined}
        modifiedTime={seo.updatedIso || undefined}
        tags={seo.tags}
        jsonLd={seo.jsonLd}
      />
      <Head>
        <meta key="article:author" property="article:author" content={seo.authorName} />
        {seo.category !== "" ? (
          <meta key="article:section" property="article:section" content={seo.category} />
        ) : null}
        {seo.coverUrl !== "" && seo.coverAlt !== "" ? (
          <meta key="og:image:alt" property="og:image:alt" content={seo.coverAlt} />
        ) : null}
      </Head>

      <PublicLayout active="resources">
        <nav aria-label="Breadcrumb" className={cn(containerClass, "pt-8")}>
          <ol className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <li>
              <a href="/" className="rounded-sm text-primary hover:underline">
                Home
              </a>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <a href="/resources/" className="rounded-sm text-primary hover:underline">
                Resources
              </a>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="max-w-full truncate">
              {seo.title}
            </li>
          </ol>
        </nav>

        <article
          aria-labelledby="article-title"
          className="mx-auto flex max-w-3xl flex-col gap-8 px-5 py-10 sm:px-8 sm:py-16"
        >
          <header className="flex flex-col gap-5">
            {seo.category !== "" ? <p className={eyebrowClass}>{seo.category}</p> : null}
            <h1 id="article-title" className="text-4xl font-semibold leading-[1.04] sm:text-6xl">
              {seo.title}
            </h1>
            {excerpt !== "" ? (
              <p className="border-l-2 border-forge-gold pl-5 text-lg leading-8 sm:text-xl">
                {excerpt}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
              <span>By {seo.authorName}</span>
              {seo.publishedIso !== "" ? (
                <span>
                  Published{" "}
                  <time dateTime={seo.publishedIso}>{displayDate(post.published_at)}</time>
                </span>
              ) : null}
              {seo.updatedIso !== "" && seo.updatedIso !== seo.publishedIso ? (
                <span>
                  Updated{" "}
                  <time dateTime={seo.updatedIso}>
                    {displayDate(post.updated_at || post.published_at)}
                  </time>
                </span>
              ) : null}
            </div>
          </header>

          {seo.coverUrl !== "" ? (
            <figure className="m-0">
              <img
                src={seo.coverUrl}
                alt={seo.coverAlt}
                decoding="async"
                className="block h-auto w-full rounded-xl"
              />
            </figure>
          ) : null}

          {/* body_html is generated by the API's CommonMark renderer with raw HTML stripped and unsafe links disabled. */}
          <div className={articleBodyClass} dangerouslySetInnerHTML={{ __html: post.body_html }} />

          {seo.tags.length > 0 ? (
            <ul aria-label="Tags" className="flex flex-wrap gap-2">
              {seo.tags.map((tag, index) => (
                <li
                  key={`${tag}-${index}`}
                  className="rounded-full border px-3 py-1 text-xs text-muted-foreground"
                >
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}

          {post.faq.length > 0 ? (
            <section
              id="faq"
              aria-labelledby="faq-title"
              className="flex flex-col gap-5 border-t pt-8"
            >
              <h2 id="faq-title" className="text-3xl font-semibold leading-tight sm:text-4xl">
                Frequently asked questions
              </h2>
              <div className="divide-y rounded-xl border bg-card">
                {post.faq.map((item, index) => (
                  <details key={`${item.question}-${index}`} open={index === 0} className="group px-5 py-4">
                    <summary className="cursor-pointer list-none font-semibold marker:hidden">
                      {item.question}
                    </summary>
                    <p className="mt-3 whitespace-pre-line leading-7 text-muted-foreground">
                      {item.answer}
                    </p>
                  </details>
                ))}
              </div>
            </section>
          ) : null}

          <ResourceComments
            apiUrl={apiUrl}
            slug={post.slug}
            initialComments={post.comments}
            commentsEnabled={post.comments_enabled}
          />
        </article>

        <RelatedResources related={related} />
      </PublicLayout>
    </>
  )
}
