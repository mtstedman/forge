import type { GetServerSideProps, InferGetServerSidePropsType } from "next"

import { HomeSections } from "@/components/home-sections"
import { PublicLayout } from "@/components/public-layout"
import { Seo } from "@/components/seo"
import { getFrontendConfig } from "@/lib/config.server"
import { getPosts } from "@/lib/server-api"
import type { PostSummary } from "@/lib/types"

type HomePageProps = {
  posts: PostSummary[]
  resourcesUnavailable: boolean
  siteUrl: string
}

const title = "Forge Performance Therapy — Twin Cities"
const description =
  "One-on-one mobile physical therapy, rehabilitation and performance care with Dr. Joseph Sperlak, PT, DPT, CSCS across the Twin Cities."

export const getServerSideProps: GetServerSideProps<HomePageProps> = async () => {
  const { publicConfig } = getFrontendConfig()
  let posts: PostSummary[] = []
  let resourcesUnavailable = false

  try {
    const response = await getPosts(1, 3)
    posts = response.data.slice(0, 3)
  } catch {
    resourcesUnavailable = true
  }

  return {
    props: {
      posts,
      resourcesUnavailable,
      siteUrl: publicConfig.siteUrl,
    },
  }
}

export default function HomePage({
  posts,
  resourcesUnavailable,
  siteUrl,
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
        email: "hello@forgeperformance.com",
        telephone: "+1-612-555-0148",
        description:
          "Mobile, one-on-one physical therapy and performance rehabilitation in the Twin Cities metro area.",
        areaServed: {
          "@type": "AdministrativeArea",
          name: "Twin Cities Metro Area, Minnesota",
        },
        founder: {
          "@type": "Person",
          name: "Dr. Joseph Sperlak",
          honorificSuffix: "PT, DPT, CSCS",
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
      <Seo title={title} description={description} canonical={canonical} jsonLd={jsonLd} />
      <PublicLayout active="home">
        <HomeSections posts={posts} resourcesUnavailable={resourcesUnavailable} />
      </PublicLayout>
    </>
  )
}
