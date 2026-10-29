import type { GetServerSideProps, InferGetServerSidePropsType } from "next"

import { HomeSections } from "@/components/home-sections"
import { PublicLayout } from "@/components/public-layout"
import { Seo } from "@/components/seo"
import { getFrontendConfig } from "@/lib/config.server"
import {
  DEFAULT_MAIN_PAGE_CONTENT,
  type MainPageContent,
} from "@/lib/main-page-content"
import { getMainPageContent, getPosts } from "@/lib/server-api"
import type { PostSummary } from "@/lib/types"

type HomePageProps = {
  content: MainPageContent
  posts: PostSummary[]
  resourcesUnavailable: boolean
  siteUrl: string
  apiUrl: string
  turnstileSiteKey: string
}

export const getServerSideProps: GetServerSideProps<HomePageProps> = async () => {
  const { publicConfig } = getFrontendConfig()
  let content = DEFAULT_MAIN_PAGE_CONTENT
  let posts: PostSummary[] = []
  let resourcesUnavailable = false

  const [contentResult, postsResult] = await Promise.allSettled([
    getMainPageContent(),
    getPosts(1, 3),
  ])
  if (contentResult.status === "fulfilled") content = contentResult.value
  if (postsResult.status === "fulfilled") posts = postsResult.value.data.slice(0, 3)
  else resourcesUnavailable = true

  return {
    props: {
      content,
      posts,
      resourcesUnavailable,
      siteUrl: publicConfig.siteUrl,
      apiUrl: publicConfig.apiUrl,
      turnstileSiteKey: publicConfig.turnstileSiteKey ?? "",
    },
  }
}

export default function HomePage({
  content,
  posts,
  resourcesUnavailable,
  siteUrl,
  apiUrl,
  turnstileSiteKey,
}: InferGetServerSidePropsType<typeof getServerSideProps>): React.JSX.Element {
  const canonical = `${siteUrl}/`
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["Organization", "LocalBusiness"],
        "@id": `${siteUrl}/#organization`,
        name: "Forge Performance Therapy",
        url: canonical,
        email: content.contact.email,
        telephone: content.contact.phone,
        description: content.seo.description,
        areaServed: {
          "@type": "AdministrativeArea",
          name: content.contact.service_area,
        },
        founder: {
          "@type": "Person",
          name: content.about.name,
          honorificSuffix: content.about.suffix,
          jobTitle: content.about.role,
        },
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: canonical,
        name: "Forge Performance Therapy",
        publisher: { "@id": `${siteUrl}/#organization` },
      },
    ],
  }

  return (
    <>
      <Seo
        title={content.seo.title}
        description={content.seo.description}
        canonical={canonical}
        jsonLd={jsonLd}
      />
      <PublicLayout active="home">
        <HomeSections
          content={content}
          posts={posts}
          resourcesUnavailable={resourcesUnavailable}
          apiUrl={apiUrl}
          turnstileSiteKey={turnstileSiteKey}
        />
      </PublicLayout>
    </>
  )
}
