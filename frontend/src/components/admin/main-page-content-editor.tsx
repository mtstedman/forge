"use client"

import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react"
import { useEffect, useRef, useState, type FormEvent } from "react"

import { useAdminAuth } from "@/components/admin/auth-provider"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/lib/api"
import {
  normalizeMainPageContentResponse,
  type MainPageContent,
} from "@/lib/main-page-content"

const fieldClass = "space-y-2"
const gridClass = "grid gap-5 md:grid-cols-2"

type LoadState = "loading" | "ready" | "error"
type Notice = { kind: "saved" | "error"; message: string } | null

type TextFieldProps = {
  label: string
  value: string
  path: string
  onChange: (value: string) => void
  errors: Record<string, string>
  maxLength: number
  required?: boolean
  multiline?: boolean
  rows?: number
  type?: "text" | "email" | "tel"
}

function TextField({
  label,
  value,
  path,
  onChange,
  errors,
  maxLength,
  required = true,
  multiline = false,
  rows = 3,
  type = "text",
}: TextFieldProps): React.JSX.Element {
  const id = `main-page-${path.replaceAll(".", "-")}`
  const error = errors[path]
  const common = {
    id,
    value,
    maxLength,
    required,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": error ? `${id}-error` : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.currentTarget.value),
  }

  return (
    <div className={fieldClass}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {!required ? <span className="font-normal text-muted-foreground"> (optional)</span> : null}
      </label>
      {multiline ? <Textarea {...common} rows={rows} /> : <Input {...common} type={type} />}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function EditorSection({
  title,
  description,
  children,
  open = false,
}: {
  title: string
  description: string
  children: React.ReactNode
  open?: boolean
}): React.JSX.Element {
  return (
    <details className="group rounded-xl border bg-background shadow-xs" open={open}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-5 rounded-xl px-5 py-4 marker:hidden sm:px-6">
        <span>
          <span className="block font-serif text-xl font-semibold">{title}</span>
          <span className="mt-1 block text-sm leading-6 text-muted-foreground">{description}</span>
        </span>
        <span
          className="mt-1 text-2xl font-light text-primary transition-transform group-open:rotate-45"
          aria-hidden="true"
        >
          +
        </span>
      </summary>
      <div className="space-y-6 border-t px-5 py-6 sm:px-6">{children}</div>
    </details>
  )
}

function RepeaterActions({
  index,
  length,
  minimum = 0,
  onMove,
  onRemove,
}: {
  index: number
  length: number
  minimum?: number
  onMove: (from: number, to: number) => void
  onRemove: (index: number) => void
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        aria-label="Move item up"
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
      >
        <ArrowUp aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        aria-label="Move item down"
        disabled={index === length - 1}
        onClick={() => onMove(index, index + 1)}
      >
        <ArrowDown aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Remove item"
        disabled={length <= minimum}
        onClick={() => onRemove(index)}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  )
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== "" ? error.message : fallback
}

function cloneDocument(document: MainPageContent): MainPageContent {
  return structuredClone(document)
}

function nestedValue(root: Record<string, unknown>, path: readonly string[]): unknown {
  let current: unknown = root
  for (const segment of path) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function setNested(document: MainPageContent, path: readonly string[], value: unknown): MainPageContent {
  const next = cloneDocument(document)
  let current = next as unknown as Record<string, unknown>
  for (const segment of path.slice(0, -1)) {
    current = current[segment] as Record<string, unknown>
  }
  current[path[path.length - 1]] = value
  return next
}

function mutateArray(
  document: MainPageContent,
  path: readonly string[],
  mutation: (items: unknown[]) => void
): MainPageContent {
  const next = cloneDocument(document)
  const items = nestedValue(next as unknown as Record<string, unknown>, path)
  if (!Array.isArray(items)) return document
  mutation(items)
  return next
}

export function MainPageContentEditor(): React.JSX.Element {
  const { request, status } = useAdminAuth()
  const authenticated = status === "authenticated"
  const [document, setDocument] = useState<MainPageContent | null>(null)
  const [baseline, setBaseline] = useState<MainPageContent | null>(null)
  const [loadState, setLoadState] = useState<LoadState>("loading")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const loadRequestRef = useRef(0)

  useEffect(() => {
    if (!authenticated) {
      loadRequestRef.current += 1
      setDocument(null)
      setBaseline(null)
      setLoadState("loading")
      setLoadError(null)
      setSaving(false)
      setNotice(null)
      setFieldErrors({})
      return
    }

    const requestId = ++loadRequestRef.current
    setLoadState("loading")
    setLoadError(null)
    setNotice(null)
    setFieldErrors({})

    request<unknown>("/admin/main-page-content")
      .then((payload) => {
        if (requestId !== loadRequestRef.current) return
        const loaded = normalizeMainPageContentResponse(payload)
        setDocument(loaded)
        setBaseline(cloneDocument(loaded))
        setLoadState("ready")
      })
      .catch((error: unknown) => {
        if (requestId !== loadRequestRef.current) return
        setLoadError(errorText(error, "Main-page content could not be loaded."))
        setLoadState("error")
      })
  }, [authenticated, reloadToken, request])

  const dirty = document !== null && baseline !== null && JSON.stringify(document) !== JSON.stringify(baseline)

  const change = (path: string, value: string | boolean) => {
    setDocument((current) => (current ? setNested(current, path.split("."), value) : current))
    setNotice(null)
    setFieldErrors((current) => {
      if (!current[path]) return current
      const next = { ...current }
      delete next[path]
      return next
    })
  }

  const updateItem = (
    path: string,
    index: number,
    field: string,
    value: string | boolean
  ) => {
    setDocument((current) =>
      current
        ? mutateArray(current, path.split("."), (items) => {
            const row = items[index]
            if (row && typeof row === "object" && !Array.isArray(row)) {
              ;(row as Record<string, unknown>)[field] = value
            }
          })
        : current
    )
    const fieldPath = `${path}.${index}.${field}`
    setNotice(null)
    setFieldErrors((current) => {
      if (!current[fieldPath]) return current
      const next = { ...current }
      delete next[fieldPath]
      return next
    })
  }

  const updateStringItem = (path: string, index: number, value: string) => {
    setDocument((current) =>
      current
        ? mutateArray(current, path.split("."), (items) => {
            items[index] = value
          })
        : current
    )
    setNotice(null)
  }

  const addItem = (path: string, item: unknown) => {
    setDocument((current) =>
      current
        ? mutateArray(current, path.split("."), (items) => {
            items.push(item)
          })
        : current
    )
    setNotice(null)
  }

  const removeItem = (path: string, index: number) => {
    setDocument((current) =>
      current
        ? mutateArray(current, path.split("."), (items) => {
            items.splice(index, 1)
          })
        : current
    )
    setNotice(null)
    setFieldErrors({})
  }

  const moveItem = (path: string, from: number, to: number) => {
    setDocument((current) =>
      current
        ? mutateArray(current, path.split("."), (items) => {
            if (to < 0 || to >= items.length) return
            const [item] = items.splice(from, 1)
            items.splice(to, 0, item)
          })
        : current
    )
    setNotice(null)
    setFieldErrors({})
  }

  const reset = () => {
    if (!baseline || saving) return
    setDocument(cloneDocument(baseline))
    setNotice(null)
    setFieldErrors({})
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!document || !dirty || saving || !authenticated) return

    setSaving(true)
    setNotice(null)
    setFieldErrors({})
    try {
      const payload = await request<unknown>("/admin/main-page-content", {
        method: "PUT",
        body: JSON.stringify(document),
      })
      const saved = normalizeMainPageContentResponse(payload)
      setDocument(saved)
      setBaseline(cloneDocument(saved))
      setNotice({ kind: "saved", message: "The main page was saved. New public requests will use this content." })
    } catch (error) {
      if (error instanceof ApiError) setFieldErrors(error.fields)
      setNotice({ kind: "error", message: errorText(error, "The main page could not be saved.") })
    } finally {
      setSaving(false)
    }
  }

  if (!authenticated) return <></>

  if (loadState === "loading") {
    return (
      <Card aria-busy="true">
        <CardContent className="flex min-h-56 items-center justify-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
          Loading main-page content…
        </CardContent>
      </Card>
    )
  }

  if (loadState === "error" || !document || !baseline) {
    return (
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Main-page content could not be loaded</AlertTitle>
        <AlertDescription className="gap-3">
          <p>{loadError}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setReloadToken((value) => value + 1)}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  const addButton = (label: string, path: string, item: unknown, disabled = false) => (
    <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => addItem(path, item)}>
      <Plus aria-hidden="true" />
      {label}
    </Button>
  )

  return (
    <form className="space-y-6" onSubmit={save} aria-busy={saving || undefined}>
      <div className="flex flex-col gap-4 rounded-xl border bg-background p-5 shadow-xs lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Public website</p>
          <h2 className="font-serif text-3xl font-semibold tracking-tight">Main Page</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Edit the page section by section. Navigation destinations, layout, resources, and consultation behavior stay protected in code.
          </p>
          <p className="mt-3 text-sm font-medium" role="status" aria-live="polite">
            {saving ? "Saving the full document…" : dirty ? "Unsaved changes" : "All changes saved"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={reset} disabled={!dirty || saving}>
            <RotateCcw aria-hidden="true" />
            Reset changes
          </Button>
          <Button type="submit" disabled={!dirty || saving}>
            {saving ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
            {saving ? "Saving…" : "Save Main Page"}
          </Button>
        </div>
      </div>

      {notice ? (
        <Alert variant={notice.kind === "error" ? "destructive" : "default"} aria-live="polite">
          {notice.kind === "error" ? <CircleAlert aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
          <AlertTitle>{notice.kind === "error" ? "Save failed" : "Main page saved"}</AlertTitle>
          <AlertDescription>{notice.message}</AlertDescription>
        </Alert>
      ) : null}

      <fieldset className="space-y-4 disabled:opacity-70" disabled={saving}>
        <EditorSection title="SEO" description="Browser title and search-result description." open>
          <div className={gridClass}>
            <TextField label="Page title" value={document.seo.title} path="seo.title" onChange={(value) => change("seo.title", value)} errors={fieldErrors} maxLength={120} />
            <TextField label="Meta description" value={document.seo.description} path="seo.description" onChange={(value) => change("seo.description", value)} errors={fieldErrors} maxLength={320} multiline rows={4} />
          </div>
        </EditorSection>

        <EditorSection title="Hero" description="Opening message, call-to-action labels, credentials, and image description.">
          <div className={gridClass}>
            <TextField label="Eyebrow" value={document.hero.eyebrow} path="hero.eyebrow" onChange={(value) => change("hero.eyebrow", value)} errors={fieldErrors} maxLength={120} required={false} />
            <TextField label="Heading" value={document.hero.heading} path="hero.heading" onChange={(value) => change("hero.heading", value)} errors={fieldErrors} maxLength={200} />
            <TextField label="Introduction" value={document.hero.introduction} path="hero.introduction" onChange={(value) => change("hero.introduction", value)} errors={fieldErrors} maxLength={1000} multiline rows={4} />
            <TextField label="Image alternative text" value={document.hero.image_alt} path="hero.image_alt" onChange={(value) => change("hero.image_alt", value)} errors={fieldErrors} maxLength={200} />
            <TextField label="Primary button label" value={document.hero.primary_cta_label} path="hero.primary_cta_label" onChange={(value) => change("hero.primary_cta_label", value)} errors={fieldErrors} maxLength={120} />
            <TextField label="Secondary button label" value={document.hero.secondary_cta_label} path="hero.secondary_cta_label" onChange={(value) => change("hero.secondary_cta_label", value)} errors={fieldErrors} maxLength={120} />
            <TextField label="Location chip" value={document.hero.location_chip} path="hero.location_chip" onChange={(value) => change("hero.location_chip", value)} errors={fieldErrors} maxLength={120} />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">Credential chips</h3>
              {addButton("Add chip", "hero.credential_chips", "", document.hero.credential_chips.length >= 6)}
            </div>
            {document.hero.credential_chips.map((chip, index) => (
              <div key={index} className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
                <div className="min-w-0 flex-1">
                  <TextField label={`Chip ${index + 1}`} value={chip} path={`hero.credential_chips.${index}`} onChange={(value) => updateStringItem("hero.credential_chips", index, value)} errors={fieldErrors} maxLength={120} />
                </div>
                <RepeaterActions index={index} length={document.hero.credential_chips.length} onMove={(from, to) => moveItem("hero.credential_chips", from, to)} onRemove={(itemIndex) => removeItem("hero.credential_chips", itemIndex)} />
              </div>
            ))}
          </div>
        </EditorSection>

        <EditorSection title="Approach" description="Approach heading, principles, and service-area statement.">
          <div className={gridClass}>
            <TextField label="Eyebrow" value={document.approach.eyebrow} path="approach.eyebrow" onChange={(value) => change("approach.eyebrow", value)} errors={fieldErrors} maxLength={120} />
            <TextField label="Title" value={document.approach.title} path="approach.title" onChange={(value) => change("approach.title", value)} errors={fieldErrors} maxLength={200} />
            <TextField label="Description" value={document.approach.description} path="approach.description" onChange={(value) => change("approach.description", value)} errors={fieldErrors} maxLength={1000} multiline rows={4} />
            <TextField label="Service area statement" value={document.approach.service_area} path="approach.service_area" onChange={(value) => change("approach.service_area", value)} errors={fieldErrors} maxLength={120} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">Principles</h3>
            {addButton("Add principle", "approach.principles", { marker: "", title: "", description: "" }, document.approach.principles.length >= 8)}
          </div>
          <div className="space-y-4">
            {document.approach.principles.map((item, index) => (
              <div key={index} className="space-y-4 rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3"><h4 className="font-medium">Principle {index + 1}</h4><RepeaterActions index={index} length={document.approach.principles.length} minimum={1} onMove={(from, to) => moveItem("approach.principles", from, to)} onRemove={(itemIndex) => removeItem("approach.principles", itemIndex)} /></div>
                <div className={gridClass}>
                  <TextField label="Marker" value={item.marker} path={`approach.principles.${index}.marker`} onChange={(value) => updateItem("approach.principles", index, "marker", value)} errors={fieldErrors} maxLength={16} />
                  <TextField label="Title" value={item.title} path={`approach.principles.${index}.title`} onChange={(value) => updateItem("approach.principles", index, "title", value)} errors={fieldErrors} maxLength={200} />
                </div>
                <TextField label="Description" value={item.description} path={`approach.principles.${index}.description`} onChange={(value) => updateItem("approach.principles", index, "description", value)} errors={fieldErrors} maxLength={1000} multiline />
              </div>
            ))}
          </div>
        </EditorSection>

        <EditorSection title="Services" description="Conditions and services shown in their public order.">
          <div className={gridClass}>
            <TextField label="Eyebrow" value={document.services.eyebrow} path="services.eyebrow" onChange={(value) => change("services.eyebrow", value)} errors={fieldErrors} maxLength={120} />
            <TextField label="Title" value={document.services.title} path="services.title" onChange={(value) => change("services.title", value)} errors={fieldErrors} maxLength={200} />
          </div>
          <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Service items</h3>{addButton("Add service", "services.items", { number: "", title: "", description: "" }, document.services.items.length >= 12)}</div>
          <div className="space-y-4">
            {document.services.items.map((item, index) => (
              <div key={index} className="space-y-4 rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3"><h4 className="font-medium">Service {index + 1}</h4><RepeaterActions index={index} length={document.services.items.length} minimum={1} onMove={(from, to) => moveItem("services.items", from, to)} onRemove={(itemIndex) => removeItem("services.items", itemIndex)} /></div>
                <div className={gridClass}>
                  <TextField label="Number" value={item.number} path={`services.items.${index}.number`} onChange={(value) => updateItem("services.items", index, "number", value)} errors={fieldErrors} maxLength={16} />
                  <TextField label="Title" value={item.title} path={`services.items.${index}.title`} onChange={(value) => updateItem("services.items", index, "title", value)} errors={fieldErrors} maxLength={200} />
                </div>
                <TextField label="Description" value={item.description} path={`services.items.${index}.description`} onChange={(value) => updateItem("services.items", index, "description", value)} errors={fieldErrors} maxLength={1000} multiline />
              </div>
            ))}
          </div>
        </EditorSection>

        <EditorSection title="About" description="Provider identity, biography, portrait description, and credentials.">
          <div className={gridClass}>
            <TextField label="Eyebrow" value={document.about.eyebrow} path="about.eyebrow" onChange={(value) => change("about.eyebrow", value)} errors={fieldErrors} maxLength={120} />
            <TextField label="Section title" value={document.about.title} path="about.title" onChange={(value) => change("about.title", value)} errors={fieldErrors} maxLength={200} required={false} />
            <TextField label="Name" value={document.about.name} path="about.name" onChange={(value) => change("about.name", value)} errors={fieldErrors} maxLength={120} />
            <TextField label="Credentials suffix" value={document.about.suffix} path="about.suffix" onChange={(value) => change("about.suffix", value)} errors={fieldErrors} maxLength={120} />
            <TextField label="Role" value={document.about.role} path="about.role" onChange={(value) => change("about.role", value)} errors={fieldErrors} maxLength={120} />
            <TextField label="Portrait alternative text" value={document.about.portrait_alt} path="about.portrait_alt" onChange={(value) => change("about.portrait_alt", value)} errors={fieldErrors} maxLength={200} />
          </div>
          <TextField label="Biography" value={document.about.biography} path="about.biography" onChange={(value) => change("about.biography", value)} errors={fieldErrors} maxLength={2000} multiline rows={5} />
          <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Credentials</h3>{addButton("Add credential", "about.credentials", { credential: "", label: "" }, document.about.credentials.length >= 12)}</div>
          <div className="space-y-4">
            {document.about.credentials.map((item, index) => (
              <div key={index} className="space-y-4 rounded-lg border bg-muted/20 p-4">
                <div className="flex justify-end"><RepeaterActions index={index} length={document.about.credentials.length} onMove={(from, to) => moveItem("about.credentials", from, to)} onRemove={(itemIndex) => removeItem("about.credentials", itemIndex)} /></div>
                <div className={gridClass}>
                  <TextField label="Credential" value={item.credential} path={`about.credentials.${index}.credential`} onChange={(value) => updateItem("about.credentials", index, "credential", value)} errors={fieldErrors} maxLength={200} />
                  <TextField label="Short label" value={item.label} path={`about.credentials.${index}.label`} onChange={(value) => updateItem("about.credentials", index, "label", value)} errors={fieldErrors} maxLength={120} />
                </div>
              </div>
            ))}
          </div>
        </EditorSection>

        <EditorSection title="Pricing" description="Getting-started copy and ordered pricing steps.">
          <div className={gridClass}>
            <TextField label="Eyebrow" value={document.pricing.eyebrow} path="pricing.eyebrow" onChange={(value) => change("pricing.eyebrow", value)} errors={fieldErrors} maxLength={120} />
            <TextField label="Title" value={document.pricing.title} path="pricing.title" onChange={(value) => change("pricing.title", value)} errors={fieldErrors} maxLength={200} />
          </div>
          <TextField label="Description" value={document.pricing.description} path="pricing.description" onChange={(value) => change("pricing.description", value)} errors={fieldErrors} maxLength={1000} multiline />
          <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Pricing items</h3>{addButton("Add pricing item", "pricing.items", { step: "", title: "", price: "", detail: "", description: "", featured: false }, document.pricing.items.length >= 6)}</div>
          <div className="space-y-4">
            {document.pricing.items.map((item, index) => (
              <div key={index} className="space-y-4 rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3"><h4 className="font-medium">Pricing item {index + 1}</h4><RepeaterActions index={index} length={document.pricing.items.length} minimum={1} onMove={(from, to) => moveItem("pricing.items", from, to)} onRemove={(itemIndex) => removeItem("pricing.items", itemIndex)} /></div>
                <div className={gridClass}>
                  <TextField label="Step" value={item.step} path={`pricing.items.${index}.step`} onChange={(value) => updateItem("pricing.items", index, "step", value)} errors={fieldErrors} maxLength={120} />
                  <TextField label="Title" value={item.title} path={`pricing.items.${index}.title`} onChange={(value) => updateItem("pricing.items", index, "title", value)} errors={fieldErrors} maxLength={200} />
                  <TextField label="Price" value={item.price} path={`pricing.items.${index}.price`} onChange={(value) => updateItem("pricing.items", index, "price", value)} errors={fieldErrors} maxLength={32} />
                  <TextField label="Price detail" value={item.detail} path={`pricing.items.${index}.detail`} onChange={(value) => updateItem("pricing.items", index, "detail", value)} errors={fieldErrors} maxLength={120} required={false} />
                </div>
                <TextField label="Description" value={item.description} path={`pricing.items.${index}.description`} onChange={(value) => updateItem("pricing.items", index, "description", value)} errors={fieldErrors} maxLength={1000} multiline />
                <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={item.featured} onChange={(event) => updateItem("pricing.items", index, "featured", event.currentTarget.checked)} className="size-4 accent-primary" /> Feature this item</label>
                {fieldErrors[`pricing.items.${index}.featured`] ? <p className="text-sm text-destructive">{fieldErrors[`pricing.items.${index}.featured`]}</p> : null}
              </div>
            ))}
          </div>
        </EditorSection>

        <EditorSection title="Patient Stories" description="Section heading and ordered patient quotations.">
          <div className={gridClass}>
            <TextField label="Eyebrow" value={document.testimonials.eyebrow} path="testimonials.eyebrow" onChange={(value) => change("testimonials.eyebrow", value)} errors={fieldErrors} maxLength={120} />
            <TextField label="Title" value={document.testimonials.title} path="testimonials.title" onChange={(value) => change("testimonials.title", value)} errors={fieldErrors} maxLength={200} />
          </div>
          <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Stories</h3>{addButton("Add story", "testimonials.items", { quote: "", attribution: "" }, document.testimonials.items.length >= 12)}</div>
          <div className="space-y-4">
            {document.testimonials.items.map((item, index) => (
              <div key={index} className="space-y-4 rounded-lg border bg-muted/20 p-4">
                <div className="flex justify-end"><RepeaterActions index={index} length={document.testimonials.items.length} onMove={(from, to) => moveItem("testimonials.items", from, to)} onRemove={(itemIndex) => removeItem("testimonials.items", itemIndex)} /></div>
                <TextField label="Quote" value={item.quote} path={`testimonials.items.${index}.quote`} onChange={(value) => updateItem("testimonials.items", index, "quote", value)} errors={fieldErrors} maxLength={1000} multiline />
                <TextField label="Attribution" value={item.attribution} path={`testimonials.items.${index}.attribution`} onChange={(value) => updateItem("testimonials.items", index, "attribution", value)} errors={fieldErrors} maxLength={120} />
              </div>
            ))}
          </div>
        </EditorSection>

        <EditorSection title="Latest Resources" description="Labels and fallback messages surrounding dynamically loaded articles.">
          <div className={gridClass}>
            <TextField label="Eyebrow" value={document.resources.eyebrow} path="resources.eyebrow" onChange={(value) => change("resources.eyebrow", value)} errors={fieldErrors} maxLength={120} />
            <TextField label="Title" value={document.resources.title} path="resources.title" onChange={(value) => change("resources.title", value)} errors={fieldErrors} maxLength={200} />
            <TextField label="Description" value={document.resources.description} path="resources.description" onChange={(value) => change("resources.description", value)} errors={fieldErrors} maxLength={1000} required={false} multiline />
            <TextField label="All resources link label" value={document.resources.all_resources_label} path="resources.all_resources_label" onChange={(value) => change("resources.all_resources_label", value)} errors={fieldErrors} maxLength={120} />
            <TextField label="Unavailable message" value={document.resources.unavailable_message} path="resources.unavailable_message" onChange={(value) => change("resources.unavailable_message", value)} errors={fieldErrors} maxLength={1000} multiline />
            <TextField label="No articles message" value={document.resources.empty_message} path="resources.empty_message" onChange={(value) => change("resources.empty_message", value)} errors={fieldErrors} maxLength={1000} multiline />
            <TextField label="Category fallback" value={document.resources.category_fallback} path="resources.category_fallback" onChange={(value) => change("resources.category_fallback", value)} errors={fieldErrors} maxLength={120} />
            <TextField label="Read article label" value={document.resources.read_article_label} path="resources.read_article_label" onChange={(value) => change("resources.read_article_label", value)} errors={fieldErrors} maxLength={120} />
          </div>
        </EditorSection>

        <EditorSection title="FAQ" description="Common questions and the consultation prompt.">
          <div className={gridClass}>
            <TextField label="Eyebrow" value={document.faq.eyebrow} path="faq.eyebrow" onChange={(value) => change("faq.eyebrow", value)} errors={fieldErrors} maxLength={120} />
            <TextField label="Title" value={document.faq.title} path="faq.title" onChange={(value) => change("faq.title", value)} errors={fieldErrors} maxLength={200} />
            <TextField label="Prompt prefix" value={document.faq.cta_prefix} path="faq.cta_prefix" onChange={(value) => change("faq.cta_prefix", value)} errors={fieldErrors} maxLength={120} />
            <TextField label="Prompt link label" value={document.faq.cta_label} path="faq.cta_label" onChange={(value) => change("faq.cta_label", value)} errors={fieldErrors} maxLength={120} />
          </div>
          <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Questions</h3>{addButton("Add question", "faq.items", { question: "", answer: "" }, document.faq.items.length >= 20)}</div>
          <div className="space-y-4">
            {document.faq.items.map((item, index) => (
              <div key={index} className="space-y-4 rounded-lg border bg-muted/20 p-4">
                <div className="flex justify-end"><RepeaterActions index={index} length={document.faq.items.length} onMove={(from, to) => moveItem("faq.items", from, to)} onRemove={(itemIndex) => removeItem("faq.items", itemIndex)} /></div>
                <TextField label="Question" value={item.question} path={`faq.items.${index}.question`} onChange={(value) => updateItem("faq.items", index, "question", value)} errors={fieldErrors} maxLength={200} />
                <TextField label="Answer" value={item.answer} path={`faq.items.${index}.answer`} onChange={(value) => updateItem("faq.items", index, "answer", value)} errors={fieldErrors} maxLength={2000} multiline rows={4} />
              </div>
            ))}
          </div>
        </EditorSection>

        <EditorSection title="Contact & Consultation" description="Contact identity, service location, form labels, and client-facing form messages.">
          <div className={gridClass}>
            <TextField label="Eyebrow" value={document.contact.eyebrow} path="contact.eyebrow" onChange={(value) => change("contact.eyebrow", value)} errors={fieldErrors} maxLength={120} />
            <TextField label="Title" value={document.contact.title} path="contact.title" onChange={(value) => change("contact.title", value)} errors={fieldErrors} maxLength={200} />
            <TextField label="Description" value={document.contact.description} path="contact.description" onChange={(value) => change("contact.description", value)} errors={fieldErrors} maxLength={1000} multiline />
            <TextField label="Phone" value={document.contact.phone} path="contact.phone" onChange={(value) => change("contact.phone", value)} errors={fieldErrors} maxLength={40} type="tel" />
            <TextField label="Email" value={document.contact.email} path="contact.email" onChange={(value) => change("contact.email", value)} errors={fieldErrors} maxLength={254} type="email" />
            <TextField label="Service area" value={document.contact.service_area} path="contact.service_area" onChange={(value) => change("contact.service_area", value)} errors={fieldErrors} maxLength={120} />
            <TextField label="Venue" value={document.contact.venue} path="contact.venue" onChange={(value) => change("contact.venue", value)} errors={fieldErrors} maxLength={120} />
          </div>
          <h3 className="border-t pt-5 font-semibold">Consultation form</h3>
          <div className={gridClass}>
            <TextField label="Name label" value={document.contact.form.name_label} path="contact.form.name_label" onChange={(value) => change("contact.form.name_label", value)} errors={fieldErrors} maxLength={120} />
            <TextField label="Phone label" value={document.contact.form.phone_label} path="contact.form.phone_label" onChange={(value) => change("contact.form.phone_label", value)} errors={fieldErrors} maxLength={120} />
            <TextField label="Email label" value={document.contact.form.email_label} path="contact.form.email_label" onChange={(value) => change("contact.form.email_label", value)} errors={fieldErrors} maxLength={120} />
            <TextField label="Email optional label" value={document.contact.form.email_optional_label} path="contact.form.email_optional_label" onChange={(value) => change("contact.form.email_optional_label", value)} errors={fieldErrors} maxLength={120} required={false} />
            <TextField label="Best-time label" value={document.contact.form.best_time_label} path="contact.form.best_time_label" onChange={(value) => change("contact.form.best_time_label", value)} errors={fieldErrors} maxLength={120} />
            <TextField label="Message label" value={document.contact.form.message_label} path="contact.form.message_label" onChange={(value) => change("contact.form.message_label", value)} errors={fieldErrors} maxLength={120} />
            <TextField label="Message optional label" value={document.contact.form.message_optional_label} path="contact.form.message_optional_label" onChange={(value) => change("contact.form.message_optional_label", value)} errors={fieldErrors} maxLength={120} required={false} />
            <TextField label="Submit label" value={document.contact.form.submit_label} path="contact.form.submit_label" onChange={(value) => change("contact.form.submit_label", value)} errors={fieldErrors} maxLength={120} />
            <TextField label="Sending label" value={document.contact.form.sending_label} path="contact.form.sending_label" onChange={(value) => change("contact.form.sending_label", value)} errors={fieldErrors} maxLength={120} />
          </div>
          <TextField label="Consent label" value={document.contact.form.consent_label} path="contact.form.consent_label" onChange={(value) => change("contact.form.consent_label", value)} errors={fieldErrors} maxLength={1000} multiline rows={4} />
          <TextField label="Success message" value={document.contact.form.success_message} path="contact.form.success_message" onChange={(value) => change("contact.form.success_message", value)} errors={fieldErrors} maxLength={1000} multiline />
          <TextField label="Generic error message" value={document.contact.form.generic_error_message} path="contact.form.generic_error_message" onChange={(value) => change("contact.form.generic_error_message", value)} errors={fieldErrors} maxLength={1000} multiline />
          <TextField label="Captcha retry message" value={document.contact.form.captcha_retry_message} path="contact.form.captcha_retry_message" onChange={(value) => change("contact.form.captcha_retry_message", value)} errors={fieldErrors} maxLength={1000} multiline />
        </EditorSection>
      </fieldset>
    </form>
  )
}
