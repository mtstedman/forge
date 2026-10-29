export type ApiEnvelope<T> = { data: T }

export type PublicComment = {
  id: number
  author_name: string
  body: string
  created_at: string
}

export type PostSummary = {
  id: number
  slug: string
  title: string
  excerpt: string | null
  category: string | null
  tags: string[]
  cover: { url: string; alt: string } | null
  author_name: string | null
  published_at: string | null
  updated_at: string | null
}

export type PostDetail = PostSummary & {
  body_html: string
  faq: { question: string; answer: string }[]
  meta_title: string | null
  meta_description: string | null
  comments_enabled: boolean
  comments: PublicComment[]
}

export type PostsResponse = {
  data: PostSummary[]
  meta: { page: number; per_page: number; total: number; available_tags: string[] }
}

export type PublicConfig = {
  siteUrl: string
  apiUrl: string
  oauth: {
    authorizeUrl: string
    tokenUrl: string
    clientId: string
    audience: string
    scope: string
    redirectUri: string
  } | null
  turnstileSiteKey?: string
}

export type AdminUser = {
  sub: string
  name: string
  email: string
}

export type ConsultationStatus = "pending" | "completed" | "ignored"

export type ConsultationBestTime = "Morning" | "Midday" | "Afternoon" | "Evening"

export type ConsultationRequest = {
  id: number
  name: string
  phone: string
  email: string | null
  best_time: ConsultationBestTime
  message: string
  status: ConsultationStatus
  consented_at: string
  created_at: string
  resolved_at: string | null
}

export type ConsultationRequestInput = {
  name: string
  phone: string
  email?: string
  best_time: ConsultationBestTime
  message?: string
  consent: true
  captcha_token: string
}

export type ConsultationRequestsResponse = {
  data: ConsultationRequest[]
  meta: { page: number; per_page: number }
}

export type MediaItem = {
  id: number
  url: string
  original_name: string
  mime_type: string
  size_bytes: number
  width: number | null
  height: number | null
  alt_text: string | null
  created_at: string
}
