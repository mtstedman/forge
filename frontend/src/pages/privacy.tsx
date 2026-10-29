import type { GetServerSideProps, InferGetServerSidePropsType } from "next"
import * as React from "react"

import { PublicLayout } from "@/components/public-layout"
import { Seo } from "@/components/seo"
import { buttonVariants } from "@/components/ui/button"
import { getFrontendConfig } from "@/lib/config.server"

type PrivacyPageProps = {
  siteUrl: string
}

const title = "Privacy notice | Forge Performance Therapy"
const description =
  "How Forge Performance Therapy uses the details you submit with the consultation request form, and how the Cloudflare Turnstile security check works."

const CLOUDFLARE_PRIVACY_URL = "https://www.cloudflare.com/privacypolicy/"
const TURNSTILE_PRIVACY_URL = "https://www.cloudflare.com/turnstile-privacy-policy/"

const linkClass =
  "font-semibold text-foreground underline decoration-forge-gold decoration-2 underline-offset-4"

export const getServerSideProps: GetServerSideProps<PrivacyPageProps> = async () => {
  const { publicConfig } = getFrontendConfig()
  return { props: { siteUrl: publicConfig.siteUrl } }
}

function NoticeSection({
  id,
  title: heading,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section aria-labelledby={id} className="border-t border-border pt-8">
      <h2 id={id} className="text-2xl font-semibold leading-tight sm:text-3xl">
        {heading}
      </h2>
      <div className="mt-4 space-y-4 leading-7 text-muted-foreground">{children}</div>
    </section>
  )
}

export default function PrivacyPage({
  siteUrl,
}: InferGetServerSidePropsType<typeof getServerSideProps>): React.JSX.Element {
  return (
    <>
      <Seo title={title} description={description} canonical={`${siteUrl}/privacy`} />
      <PublicLayout>
        <article
          aria-labelledby="privacy-title"
          className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-24 lg:px-10"
        >
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Privacy</p>
          <h1 id="privacy-title" className="mt-4 text-4xl font-semibold leading-[1.05] sm:text-6xl">
            Privacy notice
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            This notice explains what happens to the information you submit with the free
            consultation request form on this site, and how the security check that protects the
            form works.
          </p>

          <div className="mt-12 space-y-10">
            <NoticeSection id="privacy-collected" title="What the consultation form collects">
              <p>When you send a consultation request, Forge Performance Therapy receives:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>your name and phone number;</li>
                <li>your email address, if you choose to provide one;</li>
                <li>the best time of day to call you;</li>
                <li>anything you choose to write about what's going on;</li>
                <li>a record that you agreed to be contacted, and when the request was made.</li>
              </ul>
              <p>
                You don't need to include detailed health information in the form. You can share
                that during your phone consultation instead.
              </p>
            </NoticeSection>

            <NoticeSection id="privacy-use" title="How your request is used">
              <p>
                Your request is stored so that an authorized Forge administrator can review it and
                contact you about your free consultation. It is used only for that purpose.
              </p>
              <p className="font-semibold text-foreground">
                Forge will never sell or share the consultation information you submit.
              </p>
            </NoticeSection>

            <NoticeSection id="privacy-security-check" title="The security check (Cloudflare Turnstile)">
              <p>
                To protect the form from spam and automated abuse, it uses Cloudflare Turnstile, a
                security check provided by Cloudflare, Inc. The Turnstile script loads from
                Cloudflare's servers in your browser when the form is about to come into view on the
                home page.
              </p>
              <p>
                Turnstile processes technical information to tell people apart from automated
                traffic, such as your IP address, browser and device details (for example your
                user agent), and the website and form the check is running on. This is separate
                from your consultation details.
              </p>
              <p>
                When the check is complete, Cloudflare gives your browser a one-time token. Forge's
                server sends only that token, together with Forge's private Turnstile key, to
                Cloudflare to confirm it is valid. Your name, phone
                number, email address, best time to call and message are not sent to Cloudflare.
              </p>
              <p>
                Cloudflare handles this technical data under its own policies. See the{" "}
                <a className={linkClass} href={TURNSTILE_PRIVACY_URL} rel="noopener noreferrer">
                  Cloudflare Turnstile privacy addendum
                </a>{" "}
                and the{" "}
                <a className={linkClass} href={CLOUDFLARE_PRIVACY_URL} rel="noopener noreferrer">
                  Cloudflare privacy policy
                </a>
                .
              </p>
            </NoticeSection>

            <NoticeSection id="privacy-alternatives" title="Prefer not to use the form?">
              <p>
                You can always request a consultation by calling{" "}
                <a className={linkClass} href="tel:+16125550148">
                  (612) 555-0148
                </a>{" "}
                or emailing{" "}
                <a className={`${linkClass} break-all`} href="mailto:hello@forgeperformance.com">
                  hello@forgeperformance.com
                </a>
                . Neither option uses the Cloudflare security check. You can use the same contact
                details with questions about a request you have submitted.
              </p>
            </NoticeSection>
          </div>

          <div className="mt-12">
            <a href="/#contact" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Back to the consultation form
            </a>
          </div>
        </article>
      </PublicLayout>
    </>
  )
}
