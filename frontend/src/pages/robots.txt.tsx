import type { GetServerSideProps } from "next"

import { getFrontendConfig } from "@/lib/config.server"

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const { publicConfig } = getFrontendConfig()

  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin/",
    `Sitemap: ${publicConfig.siteUrl}/sitemap.xml`,
    "",
  ].join("\n")

  res.statusCode = 200
  res.setHeader("Content-Type", "text/plain; charset=UTF-8")
  res.end(body)

  return { props: {} }
}

export default function Robots(): null {
  return null
}
