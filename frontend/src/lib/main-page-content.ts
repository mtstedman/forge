export type MainPageContent = {
  seo: { title: string; description: string }
  hero: {
    eyebrow: string
    heading: string
    introduction: string
    primary_cta_label: string
    secondary_cta_label: string
    credential_chips: string[]
    location_chip: string
    image_alt: string
  }
  approach: {
    eyebrow: string
    title: string
    description: string
    principles: Array<{ marker: string; title: string; description: string }>
    service_area: string
  }
  services: {
    eyebrow: string
    title: string
    items: Array<{ number: string; title: string; description: string }>
  }
  about: {
    eyebrow: string
    title: string
    name: string
    suffix: string
    role: string
    biography: string
    portrait_alt: string
    credentials: Array<{ credential: string; label: string }>
  }
  pricing: {
    eyebrow: string
    title: string
    description: string
    items: Array<{
      step: string
      title: string
      price: string
      detail: string
      description: string
      featured: boolean
    }>
  }
  testimonials: {
    eyebrow: string
    title: string
    items: Array<{ quote: string; attribution: string }>
  }
  resources: {
    eyebrow: string
    title: string
    description: string
    all_resources_label: string
    unavailable_message: string
    empty_message: string
    category_fallback: string
    read_article_label: string
  }
  faq: {
    eyebrow: string
    title: string
    items: Array<{ question: string; answer: string }>
    cta_prefix: string
    cta_label: string
  }
  contact: {
    eyebrow: string
    title: string
    description: string
    phone: string
    email: string
    service_area: string
    venue: string
    form: {
      name_label: string
      phone_label: string
      email_label: string
      email_optional_label: string
      best_time_label: string
      message_label: string
      message_optional_label: string
      consent_label: string
      submit_label: string
      sending_label: string
      success_message: string
      generic_error_message: string
      captcha_retry_message: string
    }
  }
}

export const DEFAULT_MAIN_PAGE_CONTENT: MainPageContent = {
  seo: {
    title: "Forge Performance Therapy — Twin Cities",
    description:
      "One-on-one mobile physical therapy, rehabilitation and performance care with Dr. Joseph Sperlak, PT, DPT, CSCS across the Twin Cities.",
  },
  hero: {
    eyebrow: "",
    heading: "Find the root cause. Then forge your path to recovery.",
    introduction:
      "Private, one-on-one physical therapy with Dr. Joseph Sperlak, PT, DPT, CSCS. Full 60-minute sessions at your home or gym, with the same provider every appointment.",
    primary_cta_label: "Book a free 15-min phone consult",
    secondary_cta_label: "What I treat",
    credential_chips: ["DPT", "CSCS"],
    location_chip: "Twin Cities Metro, MN",
    image_alt: "Photo placeholder: Joseph treating a patient at home or in a gym",
  },
  approach: {
    eyebrow: "I. Approach",
    title: "Treatment built around you, not a clinic schedule.",
    description:
      "Every plan starts by identifying the root cause of your pain and dysfunction. From there, you get a specialized rehabilitation protocol designed to support sustainable lifestyle changes.",
    principles: [
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
        description: "A thorough assessment drives a rehabilitation plan specific to your body and goals.",
      },
      {
        marker: "—",
        title: "Conservative care first",
        description: "The goal is to help you avoid unnecessary injections and surgeries.",
      },
    ],
    service_area: "Serving the Twin Cities Metro Area",
  },
  services: {
    eyebrow: "II. Services & conditions",
    title: "What I treat",
    items: [
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
    ],
  },
  about: {
    eyebrow: "III. About",
    title: "",
    name: "Dr. Joseph Sperlak",
    suffix: "PT, DPT, CSCS",
    role: "Founder",
    biography:
      "Joseph is a Doctor of Physical Therapy and Certified Strength & Conditioning Specialist. He trains and competes himself, so he understands what it takes to get back to the work you care about.",
    portrait_alt: "Portrait placeholder for Dr. Joseph Sperlak",
    credentials: [
      { credential: "Doctor of Physical Therapy", label: "DPT" },
      { credential: "Certified Strength & Conditioning Specialist", label: "CSCS" },
      { credential: "Collegiate strength & conditioning coach", label: "Coaching" },
      { credential: "Self-trained Ironman & Strongman athlete", label: "Athlete" },
      { credential: "Hyrox competitor", label: "Athlete" },
    ],
  },
  pricing: {
    eyebrow: "IV. Getting started & pricing",
    title: "Three steps to a plan",
    description: "Forge is a cash-based, out-of-network practice. Pricing is simple and shared up front.",
    items: [
      {
        step: "Step 1",
        title: "Free phone consult",
        price: "$0",
        detail: "15 min",
        description: "Talk through what's going on and whether Forge is the right fit.",
        featured: false,
      },
      {
        step: "Step 2",
        title: "In-person initial consultation",
        price: "$49.99",
        detail: "",
        description: "A hands-on assessment at your home or gym to identify the root cause of your pain.",
        featured: true,
      },
      {
        step: "Step 3",
        title: "Your protocol",
        price: "60",
        detail: "min sessions",
        description:
          "A specialized rehabilitation plan with one-on-one sessions, always with the same provider.",
        featured: false,
      },
    ],
  },
  testimonials: {
    eyebrow: "V. Patient stories",
    title: "In their words",
    items: [
      {
        quote: "Placeholder testimonial. Replace with a patient quote about recovering from a sports injury.",
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
    ],
  },
  resources: {
    eyebrow: "Latest resources",
    title: "Notes from the training floor",
    description: "",
    all_resources_label: "View all resources",
    unavailable_message: "Please visit the resources page again soon. The rest of the site is ready for you.",
    empty_message: "New articles are on the way. Visit the resources page again soon.",
    category_fallback: "Resource",
    read_article_label: "Read article",
  },
  faq: {
    eyebrow: "VI. Questions",
    title: "Common questions",
    items: [
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
    ],
    cta_prefix: "Don't see yours?",
    cta_label: "Ask during your free phone consult.",
  },
  contact: {
    eyebrow: "VII. Contact",
    title: "Book a free 15-minute phone consult.",
    description: "Leave your details and Joseph will call you back to talk through your goals and next steps.",
    phone: "(612) 555-0148",
    email: "hello@forgeperformance.com",
    service_area: "Twin Cities Metro Area",
    venue: "Your home or gym",
    form: {
      name_label: "Name",
      phone_label: "Phone",
      email_label: "Email",
      email_optional_label: "(optional)",
      best_time_label: "Best time to call",
      message_label: "What's going on?",
      message_optional_label: "(optional)",
      consent_label:
        "I agree to share this information with Forge Performance Therapy for the purpose of contacting me about my consultation only. Forge will never sell or share the information I submit.",
      submit_label: "Request my free consult",
      sending_label: "Sending…",
      success_message:
        "Thank you. Your request was received, and Joseph will contact you to schedule your free consultation.",
      generic_error_message:
        "Your request could not be sent. Your details are still here, so please try again, or call (612) 555-0148 or email hello@forgeperformance.com.",
      captcha_retry_message: "The security check wasn't accepted. Please complete it again and resend.",
    },
  },
}

type JsonObject = Record<string, unknown>

function malformed(path: string): never {
  throw new Error(`The service returned malformed main-page content${path ? ` at ${path}` : ""}.`)
}

function object(value: unknown, path: string, keys: readonly string[]): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) malformed(path)
  const result = value as JsonObject
  const actual = Object.keys(result)
  if (actual.length !== keys.length || keys.some((key) => !Object.prototype.hasOwnProperty.call(result, key))) {
    malformed(path)
  }
  return result
}

function text(value: unknown, path: string, max: number, required = true): string {
  if (typeof value !== "string" || value.length > max) malformed(path)
  if (required && value.trim() === "") malformed(path)
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) malformed(path)
  return value
}

function flag(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") malformed(path)
  return value
}

function list<T>(
  value: unknown,
  path: string,
  min: number,
  max: number,
  normalize: (item: unknown, path: string) => T
): T[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) malformed(path)
  return value.map((item, index) => normalize(item, `${path}.${index}`))
}

function simpleSection(row: JsonObject, path: string): { eyebrow: string; title: string } {
  return {
    eyebrow: text(row.eyebrow, `${path}.eyebrow`, 120),
    title: text(row.title, `${path}.title`, 200),
  }
}

export function normalizeMainPageContentResponse(value: unknown): MainPageContent {
  const envelope = object(value, "", ["data"])
  const data = object(envelope.data, "data", [
    "seo",
    "hero",
    "approach",
    "services",
    "about",
    "pricing",
    "testimonials",
    "resources",
    "faq",
    "contact",
  ])

  const seo = object(data.seo, "data.seo", ["title", "description"])
  const hero = object(data.hero, "data.hero", [
    "eyebrow",
    "heading",
    "introduction",
    "primary_cta_label",
    "secondary_cta_label",
    "credential_chips",
    "location_chip",
    "image_alt",
  ])
  const approach = object(data.approach, "data.approach", [
    "eyebrow",
    "title",
    "description",
    "principles",
    "service_area",
  ])
  const services = object(data.services, "data.services", ["eyebrow", "title", "items"])
  const about = object(data.about, "data.about", [
    "eyebrow",
    "title",
    "name",
    "suffix",
    "role",
    "biography",
    "portrait_alt",
    "credentials",
  ])
  const pricing = object(data.pricing, "data.pricing", ["eyebrow", "title", "description", "items"])
  const testimonials = object(data.testimonials, "data.testimonials", ["eyebrow", "title", "items"])
  const resources = object(data.resources, "data.resources", [
    "eyebrow",
    "title",
    "description",
    "all_resources_label",
    "unavailable_message",
    "empty_message",
    "category_fallback",
    "read_article_label",
  ])
  const faq = object(data.faq, "data.faq", ["eyebrow", "title", "items", "cta_prefix", "cta_label"])
  const contact = object(data.contact, "data.contact", [
    "eyebrow",
    "title",
    "description",
    "phone",
    "email",
    "service_area",
    "venue",
    "form",
  ])
  const contactForm = object(contact.form, "data.contact.form", [
    "name_label",
    "phone_label",
    "email_label",
    "email_optional_label",
    "best_time_label",
    "message_label",
    "message_optional_label",
    "consent_label",
    "submit_label",
    "sending_label",
    "success_message",
    "generic_error_message",
    "captcha_retry_message",
  ])

  return {
    seo: {
      title: text(seo.title, "data.seo.title", 120),
      description: text(seo.description, "data.seo.description", 320),
    },
    hero: {
      eyebrow: text(hero.eyebrow, "data.hero.eyebrow", 120, false),
      heading: text(hero.heading, "data.hero.heading", 200),
      introduction: text(hero.introduction, "data.hero.introduction", 1000),
      primary_cta_label: text(hero.primary_cta_label, "data.hero.primary_cta_label", 120),
      secondary_cta_label: text(hero.secondary_cta_label, "data.hero.secondary_cta_label", 120),
      credential_chips: list(hero.credential_chips, "data.hero.credential_chips", 0, 6, (item, path) =>
        text(item, path, 120)
      ),
      location_chip: text(hero.location_chip, "data.hero.location_chip", 120),
      image_alt: text(hero.image_alt, "data.hero.image_alt", 200),
    },
    approach: {
      eyebrow: text(approach.eyebrow, "data.approach.eyebrow", 120),
      title: text(approach.title, "data.approach.title", 200),
      description: text(approach.description, "data.approach.description", 1000),
      principles: list(approach.principles, "data.approach.principles", 1, 8, (item, path) => {
        const row = object(item, path, ["marker", "title", "description"])
        return {
          marker: text(row.marker, `${path}.marker`, 16),
          title: text(row.title, `${path}.title`, 200),
          description: text(row.description, `${path}.description`, 1000),
        }
      }),
      service_area: text(approach.service_area, "data.approach.service_area", 120),
    },
    services: {
      ...simpleSection(services, "data.services"),
      items: list(services.items, "data.services.items", 1, 12, (item, path) => {
        const row = object(item, path, ["number", "title", "description"])
        return {
          number: text(row.number, `${path}.number`, 16),
          title: text(row.title, `${path}.title`, 200),
          description: text(row.description, `${path}.description`, 1000),
        }
      }),
    },
    about: {
      eyebrow: text(about.eyebrow, "data.about.eyebrow", 120),
      title: text(about.title, "data.about.title", 200, false),
      name: text(about.name, "data.about.name", 120),
      suffix: text(about.suffix, "data.about.suffix", 120),
      role: text(about.role, "data.about.role", 120),
      biography: text(about.biography, "data.about.biography", 2000),
      portrait_alt: text(about.portrait_alt, "data.about.portrait_alt", 200),
      credentials: list(about.credentials, "data.about.credentials", 0, 12, (item, path) => {
        const row = object(item, path, ["credential", "label"])
        return {
          credential: text(row.credential, `${path}.credential`, 200),
          label: text(row.label, `${path}.label`, 120),
        }
      }),
    },
    pricing: {
      eyebrow: text(pricing.eyebrow, "data.pricing.eyebrow", 120),
      title: text(pricing.title, "data.pricing.title", 200),
      description: text(pricing.description, "data.pricing.description", 1000),
      items: list(pricing.items, "data.pricing.items", 1, 6, (item, path) => {
        const row = object(item, path, ["step", "title", "price", "detail", "description", "featured"])
        return {
          step: text(row.step, `${path}.step`, 120),
          title: text(row.title, `${path}.title`, 200),
          price: text(row.price, `${path}.price`, 32),
          detail: text(row.detail, `${path}.detail`, 120, false),
          description: text(row.description, `${path}.description`, 1000),
          featured: flag(row.featured, `${path}.featured`),
        }
      }),
    },
    testimonials: {
      ...simpleSection(testimonials, "data.testimonials"),
      items: list(testimonials.items, "data.testimonials.items", 0, 12, (item, path) => {
        const row = object(item, path, ["quote", "attribution"])
        return {
          quote: text(row.quote, `${path}.quote`, 1000),
          attribution: text(row.attribution, `${path}.attribution`, 120),
        }
      }),
    },
    resources: {
      eyebrow: text(resources.eyebrow, "data.resources.eyebrow", 120),
      title: text(resources.title, "data.resources.title", 200),
      description: text(resources.description, "data.resources.description", 1000, false),
      all_resources_label: text(resources.all_resources_label, "data.resources.all_resources_label", 120),
      unavailable_message: text(resources.unavailable_message, "data.resources.unavailable_message", 1000),
      empty_message: text(resources.empty_message, "data.resources.empty_message", 1000),
      category_fallback: text(resources.category_fallback, "data.resources.category_fallback", 120),
      read_article_label: text(resources.read_article_label, "data.resources.read_article_label", 120),
    },
    faq: {
      eyebrow: text(faq.eyebrow, "data.faq.eyebrow", 120),
      title: text(faq.title, "data.faq.title", 200),
      items: list(faq.items, "data.faq.items", 0, 20, (item, path) => {
        const row = object(item, path, ["question", "answer"])
        return {
          question: text(row.question, `${path}.question`, 200),
          answer: text(row.answer, `${path}.answer`, 2000),
        }
      }),
      cta_prefix: text(faq.cta_prefix, "data.faq.cta_prefix", 120),
      cta_label: text(faq.cta_label, "data.faq.cta_label", 120),
    },
    contact: {
      eyebrow: text(contact.eyebrow, "data.contact.eyebrow", 120),
      title: text(contact.title, "data.contact.title", 200),
      description: text(contact.description, "data.contact.description", 1000),
      phone: text(contact.phone, "data.contact.phone", 40),
      email: text(contact.email, "data.contact.email", 254),
      service_area: text(contact.service_area, "data.contact.service_area", 120),
      venue: text(contact.venue, "data.contact.venue", 120),
      form: {
        name_label: text(contactForm.name_label, "data.contact.form.name_label", 120),
        phone_label: text(contactForm.phone_label, "data.contact.form.phone_label", 120),
        email_label: text(contactForm.email_label, "data.contact.form.email_label", 120),
        email_optional_label: text(
          contactForm.email_optional_label,
          "data.contact.form.email_optional_label",
          120,
          false
        ),
        best_time_label: text(contactForm.best_time_label, "data.contact.form.best_time_label", 120),
        message_label: text(contactForm.message_label, "data.contact.form.message_label", 120),
        message_optional_label: text(
          contactForm.message_optional_label,
          "data.contact.form.message_optional_label",
          120,
          false
        ),
        consent_label: text(contactForm.consent_label, "data.contact.form.consent_label", 1000),
        submit_label: text(contactForm.submit_label, "data.contact.form.submit_label", 120),
        sending_label: text(contactForm.sending_label, "data.contact.form.sending_label", 120),
        success_message: text(contactForm.success_message, "data.contact.form.success_message", 1000),
        generic_error_message: text(
          contactForm.generic_error_message,
          "data.contact.form.generic_error_message",
          1000
        ),
        captcha_retry_message: text(
          contactForm.captcha_retry_message,
          "data.contact.form.captcha_retry_message",
          1000
        ),
      },
    },
  }
}
