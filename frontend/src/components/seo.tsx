import Head from "next/head"
import * as React from "react"

type SeoProps = {
  title: string
  description: string
  canonical: string
  noindex?: boolean
  image?: string
  type?: "website" | "article"
  publishedTime?: string
  modifiedTime?: string
  tags?: string[]
  prev?: string
  next?: string
  jsonLd?: unknown
}

function encodeJsonLd(value: unknown): string | null {
  try {
    const json = JSON.stringify(value)
    if (typeof json !== "string") return null
    return json
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029")
  } catch {
    return null
  }
}

export function Seo({
  title,
  description,
  canonical,
  noindex = false,
  image,
  type = "website",
  publishedTime,
  modifiedTime,
  tags = [],
  prev,
  next,
  jsonLd,
}: SeoProps): React.JSX.Element {
  const encodedJsonLd = jsonLd === undefined ? null : encodeJsonLd(jsonLd)
  const twitterCard = image ? "summary_large_image" : "summary"

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta name="robots" content={noindex ? "noindex,follow" : "index,follow"} />

      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={canonical} />
      <meta property="og:site_name" content="Forge Performance Therapy" />
      {image ? <meta property="og:image" content={image} /> : null}

      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {image ? <meta name="twitter:image" content={image} /> : null}

      {type === "article" && publishedTime ? (
        <meta property="article:published_time" content={publishedTime} />
      ) : null}
      {type === "article" && modifiedTime ? (
        <meta property="article:modified_time" content={modifiedTime} />
      ) : null}
      {type === "article"
        ? tags.map((tag, index) => (
            <meta key={`${tag}-${index}`} property="article:tag" content={tag} />
          ))
        : null}

      {prev ? <link rel="prev" href={prev} /> : null}
      {next ? <link rel="next" href={next} /> : null}

      {encodedJsonLd !== null ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: encodedJsonLd }}
        />
      ) : null}
    </Head>
  )
}
