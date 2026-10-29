import Head from "next/head"
import * as React from "react"

import { PublicLayout } from "@/components/public-layout"
import { buttonVariants } from "@/components/ui/button"

export default function NotFoundPage(): React.JSX.Element {
  return (
    <>
      <Head>
        <title>Page not found | Forge Performance Therapy</title>
        <meta
          name="description"
          content="The page you were looking for could not be found."
        />
        <meta name="robots" content="noindex,follow" />
      </Head>
      <PublicLayout>
        <section
          aria-labelledby="error-title"
          className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28 lg:px-10"
        >
          <div className="flex max-w-2xl flex-col items-start gap-6">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">
              Error 404
            </p>
            <h1 id="error-title" className="text-4xl font-semibold leading-[1.05] sm:text-6xl">
              Page not found
            </h1>
            <p className="text-lg leading-8 text-muted-foreground">
              This page may have moved or no longer exists. Head back home or browse the
              latest resources.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
                Back to home
              </a>
              <a href="/resources/" className={buttonVariants({ variant: "ghost", size: "lg" })}>
                Browse resources
              </a>
            </div>
          </div>
        </section>
      </PublicLayout>
    </>
  )
}
