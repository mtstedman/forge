"use client"

import { Plus, Trash2 } from "lucide-react"
import { useRef } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export type FaqEntry = {
  /** Stable client-side key; never sent to the API. */
  key: string
  question: string
  answer: string
}

let faqKeySequence = 0

export function createFaqEntry(item: { question?: unknown; answer?: unknown } = {}): FaqEntry {
  faqKeySequence += 1
  return {
    key: `faq-${faqKeySequence}`,
    question: typeof item.question === "string" ? item.question : "",
    answer: typeof item.answer === "string" ? item.answer : "",
  }
}

/** Converts API FAQ data into editable rows. */
export function faqEntriesFrom(value: unknown): FaqEntry[] {
  if (!Array.isArray(value)) return []
  return value.map((item) =>
    createFaqEntry(item !== null && typeof item === "object" ? (item as Record<string, unknown>) : {})
  )
}

/** Converts editable rows into the API payload, dropping rows with neither question nor answer. */
export function faqPayload(entries: FaqEntry[]): { question: string; answer: string }[] {
  return entries
    .map((entry) => ({ question: entry.question.trim(), answer: entry.answer.trim() }))
    .filter((item) => item.question !== "" || item.answer !== "")
}

export function FaqEditor({
  id,
  items,
  onChange,
  error,
  disabled = false,
}: {
  id: string
  items: FaqEntry[]
  onChange: (items: FaqEntry[]) => void
  error?: string
  disabled?: boolean
}): React.JSX.Element {
  const listRef = useRef<HTMLOListElement>(null)
  const headingId = `${id}-heading`

  const update = (key: string, patch: Partial<Pick<FaqEntry, "question" | "answer">>) => {
    onChange(items.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  const add = () => {
    const entry = createFaqEntry()
    onChange([...items, entry])
    requestAnimationFrame(() => {
      const field = listRef.current?.querySelector<HTMLInputElement>(`[data-faq-question="${entry.key}"]`)
      field?.focus()
    })
  }

  const remove = (key: string) => {
    onChange(items.filter((item) => item.key !== key))
  }

  return (
    <section className="space-y-4" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id={headingId} className="text-base font-semibold">
            Frequently asked questions
          </h3>
          <p className="text-sm text-muted-foreground">
            Rows without a question or answer are ignored when saving.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={add} disabled={disabled}>
          <Plus aria-hidden="true" />
          Add FAQ
        </Button>
      </div>

      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No FAQs yet.
        </p>
      ) : (
        <ol ref={listRef} className="space-y-3">
          {items.map((item, index) => {
            const questionId = `${id}-${item.key}-question`
            const answerId = `${id}-${item.key}-answer`
            return (
              <li key={item.key} className="rounded-lg border bg-muted/20 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    FAQ {index + 1}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => remove(item.key)}
                    disabled={disabled}
                    aria-label={`Remove FAQ ${index + 1}`}
                  >
                    <Trash2 aria-hidden="true" />
                    Remove
                  </Button>
                </div>
                <div className="grid gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor={questionId}>
                      Question
                    </label>
                    <Input
                      id={questionId}
                      data-faq-question={item.key}
                      value={item.question}
                      onChange={(event) => update(item.key, { question: event.target.value })}
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor={answerId}>
                      Answer
                    </label>
                    <Textarea
                      id={answerId}
                      rows={3}
                      className="min-h-20"
                      value={item.answer}
                      onChange={(event) => update(item.key, { answer: event.target.value })}
                      disabled={disabled}
                    />
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
