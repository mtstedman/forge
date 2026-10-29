import { ArrowRight, Mail, MapPin, Phone } from "lucide-react"
import { useState, type FormEvent } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { PostSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

type HomeSectionsProps = {
  posts: PostSummary[]
  resourcesUnavailable: boolean
}

type SectionHeadingProps = {
  eyebrow: string
  title: string
  id: string
  description?: string
  eyebrowClassName?: string
}

const principles = [
  {
    marker: "60",
    title: "Full 60-minute sessions",
    description: "One-on-one for the entire hour. No aides, no splitting time between patients.",
  },
  {
    marker: "1",
    title: "Same provider, every visit",
    description: "You work with Dr. Sperlak from the first assessment to your final session.",
  },
  {
    marker: "§",
    title: "Root cause, then protocol",
    description:
      "A thorough assessment drives a rehabilitation plan specific to your body and goals.",
  },
  {
    marker: "—",
    title: "Conservative care first",
    description: "The goal is to help you avoid unnecessary injections and surgeries.",
  },
] as const

const services = [
  {
    number: "i.",
    title: "Sports injuries",
    description:
      "Sprains, strains, tendon pain and overuse injuries, with a return-to-sport plan for training and competition.",
  },
  {
    number: "ii.",
    title: "Post-surgical rehab",
    description:
      "Structured recovery after joint, ligament and spine procedures, progressing from early mobility to full strength.",
  },
  {
    number: "iii.",
    title: "Back & neck pain",
    description:
      "Assessment of posture, movement and load to address the source of spinal pain, not only the symptoms.",
  },
  {
    number: "iv.",
    title: "Chronic pain",
    description:
      "Gradual, measurable plans for long-standing pain that hasn't resolved with rest, medication or prior treatment.",
  },
  {
    number: "v.",
    title: "Performing arts & dancers",
    description:
      "Care for the range, control and repetitive demands of dance and performance, built around rehearsal schedules.",
  },
  {
    number: "vi.",
    title: "Work injuries",
    description:
      "Rehab for lifting, repetitive-motion and job-related injuries, focused on a safe return to full duty.",
  },
] as const

const credentials = [
  ["Doctor of Physical Therapy", "DPT"],
  ["Certified Strength & Conditioning Specialist", "CSCS"],
  ["Collegiate strength & conditioning coach", "Coaching"],
  ["Self-trained Ironman & Strongman athlete", "Athlete"],
  ["Hyrox competitor", "Athlete"],
] as const

const pricing = [
  {
    step: "Step 1",
    title: "Free phone consult",
    price: "$0",
    detail: "15 min",
    description: "Talk through what's going on and whether Forge is the right fit.",
  },
  {
    step: "Step 2",
    title: "In-person initial consultation",
    price: "$49.99",
    detail: "",
    description:
      "A hands-on assessment at your home or gym to identify the root cause of your pain.",
    featured: true,
  },
  {
    step: "Step 3",
    title: "Your protocol",
    price: "60",
    detail: "min sessions",
    description:
      "A specialized rehabilitation plan with one-on-one sessions, always with the same provider.",
  },
] as const

const testimonials = [
  {
    quote:
      "Placeholder testimonial. Replace with a patient quote about recovering from a sports injury.",
    attribution: "Patient name, sports injury",
  },
  {
    quote: "Placeholder testimonial. Replace with a patient quote about post-surgical rehab.",
    attribution: "Patient name, post-surgical rehab",
  },
  {
    quote: "Placeholder testimonial. Replace with a patient quote about chronic back pain.",
    attribution: "Patient name, chronic pain",
  },
] as const

const faqs = [
  {
    question: "Do I need a doctor's referral?",
    answer:
      "Minnesota allows direct access to physical therapy, so you can typically start without a referral. We'll confirm what applies to you during the phone consult.",
  },
  {
    question: "Do you take insurance?",
    answer:
      "Forge is a cash-based, out-of-network practice. You pay at the time of service. If your plan offers out-of-network benefits, you can request documentation to submit for possible reimbursement.",
  },
  {
    question: "What does the $49.99 initial consultation include?",
    answer:
      "An in-person assessment at your home or gym to identify the root cause of your pain or dysfunction, followed by a recommended rehabilitation plan.",
  },
  {
    question: "Where do sessions take place?",
    answer:
      "At your home, your gym, or on-field, anywhere in the Twin Cities Metro Area. There is no clinic to travel to.",
  },
  {
    question: "How long is each session?",
    answer: "Every session is a full 60 minutes, one-on-one with Dr. Sperlak.",
  },
  {
    question: "How many visits will I need?",
    answer:
      "It depends on your condition and goals. You'll get a clear plan after your initial consultation, designed for lasting results rather than an open-ended schedule.",
  },
] as const

const sectionClass = "scroll-mt-24 border-t border-border/80 py-20 sm:py-24 lg:py-28"
const containerClass = "mx-auto max-w-7xl px-5 sm:px-8 lg:px-10"

function SectionHeading({
  eyebrow,
  title,
  id,
  description,
  eyebrowClassName,
}: SectionHeadingProps): React.JSX.Element {
  return (
    <div className="max-w-2xl">
      <p className={cn("mb-4 text-xs font-bold uppercase tracking-[0.22em] text-primary", eyebrowClassName)}>
        {eyebrow}
      </p>
      <h2 id={id} className="text-4xl font-semibold leading-[1.05] sm:text-5xl lg:text-6xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-6 max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">
          {description}
        </p>
      ) : null}
    </div>
  )
}

function formatPostDate(value: string | null): string {
  if (!value) return ""

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}

function ConsultationForm(): React.JSX.Element {
  const [showNotice, setShowNotice] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setShowNotice(true)
  }

  return (
    <form
      className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8 lg:p-10"
      onSubmit={handleSubmit}
      aria-describedby="consult-form-note"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-semibold" htmlFor="consult-name">
            Name
          </label>
          <Input id="consult-name" name="name" autoComplete="name" required />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold" htmlFor="consult-phone">
            Phone
          </label>
          <Input id="consult-phone" name="phone" type="tel" autoComplete="tel" required />
        </div>
      </div>
      <div className="mt-5 space-y-2">
        <label className="text-sm font-semibold" htmlFor="consult-email">
          Email
        </label>
        <Input id="consult-email" name="email" type="email" autoComplete="email" />
      </div>
      <div className="mt-5 space-y-2">
        <label className="text-sm font-semibold" htmlFor="consult-time">
          Best time to call
        </label>
        <select
          id="consult-time"
          name="best_time"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option>Morning</option>
          <option>Midday</option>
          <option>Afternoon</option>
          <option>Evening</option>
        </select>
      </div>
      <div className="mt-5 space-y-2">
        <label className="text-sm font-semibold" htmlFor="consult-message">
          What's going on?
        </label>
        <Textarea id="consult-message" name="message" rows={4} />
      </div>
      <button
        className={cn(buttonVariants({ variant: "outline", size: "lg" }), "mt-6 w-full")}
        type="submit"
      >
        Request my free consult
      </button>
      <p id="consult-form-note" className="mt-3 text-xs leading-5 text-muted-foreground">
        This form is for planning only and does not send your information. Call or email Forge to
        request your consultation.
      </p>
      {showNotice ? (
        <Alert className="mt-5" role="status">
          <AlertTitle>Your details have not been sent</AlertTitle>
          <AlertDescription>
            Please call (612) 555-0148 or email hello@forgeperformance.com to request your free
            consultation.
          </AlertDescription>
        </Alert>
      ) : null}
    </form>
  )
}

export function HomeSections({
  posts,
  resourcesUnavailable,
}: HomeSectionsProps): React.JSX.Element {
  const latestPosts = posts.slice(0, 3)

  return (
    <>
      <section className="overflow-hidden border-b border-border/80" aria-labelledby="hero-title">
        <div className={cn(containerClass, "grid min-h-[calc(100svh-5rem)] items-center gap-12 py-16 lg:grid-cols-[1.12fr_0.88fr] lg:py-20")}>
          <div className="max-w-3xl">
            <h1 id="hero-title" className="text-5xl font-normal leading-[1.06] sm:text-6xl lg:text-7xl">
              <span className="block text-balance">Find the root cause.</span>
              <span className="block text-balance">
                Then{" "}
                <span className="font-semibold text-primary underline decoration-forge-gold decoration-1 underline-offset-[0.12em]">
                  forge
                </span>{" "}
                your path to recovery.
              </span>
            </h1>
            <p className="mt-7 max-w-[52ch] text-lg leading-8 text-muted-foreground">
              Private, one-on-one physical therapy with Dr. Joseph Sperlak, PT, DPT, CSCS. Full
              60-minute sessions at your home or gym, with the same provider every appointment.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a href="#contact" className={buttonVariants({ variant: "outline", size: "lg" })}>
                Book a free 15-min phone consult
              </a>
              <a href="#services" className={buttonVariants({ variant: "ghost", size: "lg" })}>
                What I treat
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-2 text-xs font-semibold" aria-label="Credentials and service area">
              <li className="rounded-sm border border-primary px-2.5 py-1 text-primary">DPT</li>
              <li className="rounded-sm border border-primary px-2.5 py-1 text-primary">CSCS</li>
              <li className="rounded-sm bg-secondary px-2.5 py-1 text-secondary-foreground">Twin Cities Metro, MN</li>
            </ul>
          </div>
          <figure
            className="relative min-h-[28rem] overflow-hidden rounded-[2rem] border bg-primary shadow-xl lg:min-h-[38rem]"
            role="img"
            aria-label="Photo placeholder: Joseph treating a patient at home or in a gym"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_65%_20%,color-mix(in_oklab,var(--forge-gold)_45%,transparent),transparent_38%),linear-gradient(145deg,transparent_35%,color-mix(in_oklab,var(--forge-gold)_20%,transparent))]" />
          </figure>
        </div>
      </section>

      <section id="approach" className={sectionClass} aria-labelledby="approach-title">
        <div className={cn(containerClass, "grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20")}>
          <SectionHeading
            eyebrow="I. Approach"
            title="Treatment built around you, not a clinic schedule."
            id="approach-title"
            description="Every plan starts by identifying the root cause of your pain and dysfunction. From there, you get a specialized rehabilitation protocol designed to support sustainable lifestyle changes."
          />
          <div className="divide-y divide-border border-y border-border">
            {principles.map((principle) => (
              <article key={principle.title} className="grid grid-cols-[2.5rem_1fr] gap-5 py-7 sm:grid-cols-[3.5rem_1fr] sm:py-9">
                <span className="font-serif text-2xl text-primary" aria-hidden="true">{principle.marker}</span>
                <div>
                  <h3 className="text-2xl font-semibold sm:text-3xl">{principle.title}</h3>
                  <p className="mt-3 max-w-xl leading-7 text-muted-foreground">{principle.description}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-9 gap-y-3 border-y border-forge-gold py-5 lg:col-span-2">
            <p className="font-serif text-2xl font-semibold">Care comes to you</p>
            <p className="flex flex-wrap items-baseline gap-x-4 gap-y-2 text-sm">
              <span>Home visits</span>
              <span className="text-forge-gold" aria-hidden="true">·</span>
              <span>At your gym or on-field</span>
              <span className="text-forge-gold" aria-hidden="true">·</span>
              <span className="text-muted-foreground">Serving the Twin Cities Metro Area</span>
            </p>
          </div>
        </div>
      </section>

      <section id="services" className={cn(sectionClass, "bg-primary text-primary-foreground")} aria-labelledby="services-title">
        <div className={containerClass}>
          <SectionHeading
            eyebrow="II. Services & conditions"
            title="What I treat"
            id="services-title"
            eyebrowClassName="text-forge-gold"
          />
          <div className="mt-14 grid border-t border-primary-foreground/20 md:grid-cols-2">
            {services.map((service) => (
              <article key={service.number} className="grid grid-cols-[2.5rem_1fr] gap-4 border-b border-primary-foreground/20 py-7 md:px-7 md:odd:border-r lg:grid-cols-[3rem_1fr] lg:py-9">
                <span className="font-serif text-xl text-forge-gold">{service.number}</span>
                <div>
                  <h3 className="text-2xl font-semibold">{service.title}</h3>
                  <p className="mt-3 leading-7 text-primary-foreground/70">{service.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="about" className={sectionClass} aria-labelledby="about-title">
        <div className={cn(containerClass, "grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20")}>
          <figure
            className="min-h-[28rem] rounded-[2rem] border bg-[linear-gradient(145deg,var(--secondary),var(--accent))] shadow-sm lg:min-h-[40rem]"
            role="img"
            aria-label="Portrait placeholder for Dr. Joseph Sperlak"
          />
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-primary">III. About</p>
            <div className="border-b border-border pb-6">
              <h2 id="about-title" className="text-4xl font-semibold leading-none sm:text-6xl">Dr. Joseph Sperlak</h2>
              <p className="mt-4 text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">PT, DPT, CSCS · Founder</p>
            </div>
            <p className="py-7 text-lg leading-8 text-muted-foreground">
              Joseph is a Doctor of Physical Therapy and Certified Strength & Conditioning
              Specialist. He trains and competes himself, so he understands what it takes to get
              back to the work you care about.
            </p>
            <dl className="divide-y divide-border border-y border-border">
              {credentials.map(([credential, label]) => (
                <div key={credential} className="flex items-start justify-between gap-6 py-4">
                  <dt className="font-semibold">{credential}</dt>
                  <dd className="shrink-0 text-sm text-muted-foreground">{label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section id="pricing" className={cn(sectionClass, "bg-secondary/55")} aria-labelledby="pricing-title">
        <div className={containerClass}>
          <div className="grid gap-8 lg:grid-cols-2 lg:items-end">
            <SectionHeading eyebrow="IV. Getting started & pricing" title="Three steps to a plan" id="pricing-title" />
            <p className="max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">
              Forge is a cash-based, out-of-network practice. Pricing is simple and shared up front.
            </p>
          </div>
          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {pricing.map((item) => (
              <Card key={item.step} className={cn("h-full", "featured" in item && item.featured ? "border-primary bg-primary text-primary-foreground shadow-lg" : "")}>
                <CardHeader>
                  <p className={cn("text-xs font-bold uppercase tracking-[0.2em] text-primary", "featured" in item && item.featured ? "text-forge-gold" : "")}>{item.step}</p>
                  <CardTitle><h3 className="mt-3 text-2xl leading-tight">{item.title}</h3></CardTitle>
                </CardHeader>
                <CardContent className="flex-1">
                  <p className="font-serif text-5xl font-semibold">
                    {item.price} {item.detail ? <small className="font-sans text-sm font-medium opacity-70">{item.detail}</small> : null}
                  </p>
                  <CardDescription className={cn("mt-5 text-base leading-7", "featured" in item && item.featured ? "text-primary-foreground/75" : "")}>
                    {item.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="reviews" className={sectionClass} aria-labelledby="reviews-title">
        <div className={containerClass}>
          <SectionHeading eyebrow="V. Patient stories" title="In their words" id="reviews-title" />
          <div className="mt-14 grid gap-8 lg:grid-cols-3">
            {testimonials.map((testimonial) => (
              <figure key={testimonial.attribution} className="flex h-full flex-col border-t-2 border-primary pt-7">
                <blockquote className="flex-1 font-serif text-2xl leading-9">“{testimonial.quote}”</blockquote>
                <figcaption className="mt-7 text-sm text-muted-foreground">— {testimonial.attribution}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section id="resources" className={cn(sectionClass, "bg-card")} aria-labelledby="resources-title">
        <div className={containerClass}>
          <div className="flex flex-col justify-between gap-8 sm:flex-row sm:items-end">
            <SectionHeading eyebrow="Latest resources" title="Notes from the training floor" id="resources-title" />
            <a href="/resources/" className={cn(buttonVariants({ variant: "ghost" }), "w-fit")}>
              View all resources <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </div>
          {resourcesUnavailable ? (
            <Alert className="mt-12">
              <AlertTitle>Resources are temporarily unavailable</AlertTitle>
              <AlertDescription>
                Please visit the resources page again soon. The rest of the site is ready for you.
              </AlertDescription>
            </Alert>
          ) : latestPosts.length === 0 ? (
            <div className="mt-12 rounded-xl border border-dashed p-8 text-muted-foreground">
              <p>New articles are on the way. Visit the resources page again soon.</p>
            </div>
          ) : (
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {latestPosts.map((post) => {
                const formattedDate = formatPostDate(post.published_at)
                return (
                  <Card key={post.id} className="h-full">
                    <CardHeader>
                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                        <span>{post.category || "Resource"}</span>
                        {formattedDate ? <time dateTime={post.published_at || undefined}>{formattedDate}</time> : null}
                      </div>
                      <CardTitle>
                        <h3 className="mt-4 text-2xl leading-tight">
                          <a className="rounded-sm hover:text-primary" href={`/resources/${encodeURIComponent(post.slug)}`}>{post.title || "Untitled resource"}</a>
                        </h3>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <CardDescription className="text-base leading-7">{post.excerpt || ""}</CardDescription>
                    </CardContent>
                    <CardFooter className="text-sm text-muted-foreground">By {post.author_name || "Dr. Joseph Sperlak"}</CardFooter>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <section id="faq" className={sectionClass} aria-labelledby="faq-title">
        <div className={cn(containerClass, "grid gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:gap-20")}>
          <div>
            <SectionHeading eyebrow="VI. Questions" title="Common questions" id="faq-title" />
            <p className="mt-6 text-muted-foreground">
              Don't see yours? <a className="font-semibold text-foreground underline decoration-forge-gold decoration-2 underline-offset-4" href="#contact">Ask during your free phone consult.</a>
            </p>
          </div>
          <div className="divide-y divide-border border-y border-border">
            {faqs.map((faq, index) => (
              <details key={faq.question} className="group py-6" open={index === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-sm font-serif text-xl font-semibold marker:hidden sm:text-2xl">
                  {faq.question}
                  <span className="text-2xl font-normal text-primary transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <p className="max-w-2xl pt-4 leading-7 text-muted-foreground">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className={cn(sectionClass, "bg-secondary/55")} aria-labelledby="contact-title">
        <div className={cn(containerClass, "grid gap-12 lg:grid-cols-2 lg:gap-20")}>
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-primary">VII. Contact</p>
            <h2 id="contact-title" className="text-4xl font-semibold leading-[1.05] sm:text-6xl">Book a free 15-minute phone consult.</h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
              Leave your details and Joseph will call you back to talk through your goals and next steps.
            </p>
            <div className="mt-10 grid gap-6 border-t border-border pt-8 sm:grid-cols-2">
              <div className="flex gap-3">
                <Phone className="mt-1 size-5 text-primary" aria-hidden="true" />
                <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Phone</p><a className="mt-1 block font-semibold" href="tel:+16125550148">(612) 555-0148</a></div>
              </div>
              <div className="flex gap-3">
                <Mail className="mt-1 size-5 text-primary" aria-hidden="true" />
                <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Email</p><a className="mt-1 block break-all font-semibold" href="mailto:hello@forgeperformance.com">hello@forgeperformance.com</a></div>
              </div>
              <div className="flex gap-3">
                <MapPin className="mt-1 size-5 text-primary" aria-hidden="true" />
                <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Service area</p><p className="mt-1 font-semibold">Twin Cities Metro Area</p></div>
              </div>
              <div className="flex gap-3">
                <MapPin className="mt-1 size-5 text-primary" aria-hidden="true" />
                <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Where</p><p className="mt-1 font-semibold">Your home or gym</p></div>
              </div>
            </div>
          </div>
          <ConsultationForm />
        </div>
      </section>
    </>
  )
}
