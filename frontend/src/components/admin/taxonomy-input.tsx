"use client"

import { X } from "lucide-react"
import { useId, useMemo, useRef, useState } from "react"

import { cn } from "@/lib/utils"

/** Trims, drops empty and non-string entries and removes duplicates while preserving order. */
export function uniqueTaxonomyValues(values: unknown): string[] {
  const unique: string[] = []
  if (!Array.isArray(values)) return unique
  for (const value of values) {
    if (typeof value !== "string") continue
    const trimmed = value.trim()
    if (trimmed !== "" && !unique.includes(trimmed)) unique.push(trimmed)
  }
  return unique
}

/** Adds every comma-separated entry of an uncommitted draft to the selection. */
export function commitTaxonomyDraft(values: string[], draft: string): string[] {
  return uniqueTaxonomyValues([...values, ...draft.split(",")])
}

/** Merges values into a vocabulary, sorted case-insensitively. */
export function mergeTaxonomyVocabulary(vocabulary: string[], values: unknown): string[] {
  return uniqueTaxonomyValues([...vocabulary, ...uniqueTaxonomyValues(values)]).sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" })
  )
}

export type TaxonomyInputProps = {
  id: string
  label: string
  /** Singular noun used in accessible labels, e.g. "category". */
  itemLabel: string
  values: string[]
  draft: string
  /** Saved vocabulary offered as suggestions. */
  options: string[]
  onChange: (values: string[], draft: string) => void
  hint?: string
  error?: string
  disabled?: boolean
  className?: string
}

export function TaxonomyInput({
  id,
  label,
  itemLabel,
  values,
  draft,
  options,
  onChange,
  hint = "Type or paste, then use a comma",
  error,
  disabled = false,
  className,
}: TaxonomyInputProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const generatedId = useId()
  const listboxId = `${id}-suggestions`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const optionIdPrefix = `${id}-option-${generatedId.replace(/[^a-zA-Z0-9_-]/g, "")}`

  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const suggestions = useMemo(() => {
    const query = draft.trim().toLocaleLowerCase()
    return options.filter(
      (value) => !values.includes(value) && value.toLocaleLowerCase().includes(query)
    )
  }, [draft, options, values])

  const open = focused && !dismissed && !disabled && suggestions.length > 0
  const currentIndex = open ? Math.min(Math.max(activeIndex, 0), suggestions.length - 1) : -1
  const activeOptionId = currentIndex >= 0 ? `${optionIdPrefix}-${currentIndex}` : undefined

  const addValue = (value: string | undefined) => {
    const trimmed = typeof value === "string" ? value.trim() : ""
    const next = trimmed !== "" && !values.includes(trimmed) ? [...values, trimmed] : values
    onChange(next, "")
    setActiveIndex(0)
    setDismissed(false)
  }

  const commitDraft = (text: string) => {
    onChange(commitTaxonomyDraft(values, text), "")
    setActiveIndex(0)
    setDismissed(true)
  }

  const removeValue = (value: string) => {
    onChange(
      values.filter((selected) => selected !== value),
      draft
    )
    setDismissed(false)
    inputRef.current?.focus()
  }

  const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value
    if (text.includes(",")) {
      const parts = text.split(",")
      const remainder = text.endsWith(",") ? "" : (parts.pop() ?? "")
      onChange(uniqueTaxonomyValues([...values, ...parts]), remainder)
    } else {
      onChange(values, text)
    }
    setActiveIndex(0)
    setDismissed(false)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === ",") {
      event.preventDefault()
      commitDraft(draft)
      return
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (suggestions.length === 0) return
      if (!open) {
        setDismissed(false)
        setActiveIndex(event.key === "ArrowDown" ? 0 : suggestions.length - 1)
        return
      }
      const direction = event.key === "ArrowDown" ? 1 : -1
      setActiveIndex((currentIndex + direction + suggestions.length) % suggestions.length)
      return
    }

    if (event.key === "Enter") {
      if (open && currentIndex >= 0) {
        event.preventDefault()
        addValue(suggestions[currentIndex])
        return
      }
      if (draft.trim() !== "") {
        event.preventDefault()
        commitDraft(draft)
      }
      return
    }

    if (event.key === "Escape" && open) {
      event.preventDefault()
      setDismissed(true)
    }
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData?.getData("text") ?? ""
    if (!text.includes(",")) return
    event.preventDefault()
    const input = event.currentTarget
    const start = input.selectionStart ?? draft.length
    const end = input.selectionEnd ?? draft.length
    commitDraft(`${draft.slice(0, start)}${text}${draft.slice(end)}`)
  }

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ")

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <label className="text-sm font-medium" htmlFor={id}>
          {label}
        </label>
        {hint ? (
          <span id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </div>
      <div className="relative">
        <div
          className={cn(
            "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 shadow-xs transition-[color,box-shadow]",
            "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
            error && "border-destructive ring-destructive/20",
            disabled && "cursor-not-allowed opacity-50"
          )}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              event.preventDefault()
              inputRef.current?.focus()
            }
          }}
        >
          {values.length > 0 ? (
            <ul role="list" className="contents" aria-label={`Selected ${label.toLocaleLowerCase()}`}>
              {values.map((value) => (
                <li
                  key={value}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/15 bg-secondary py-0.5 pl-2.5 pr-1 text-xs font-medium text-secondary-foreground"
                >
                  <span className="truncate">{value}</span>
                  <button
                    type="button"
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none"
                    aria-label={`Remove ${itemLabel} ${value}`}
                    onClick={() => removeValue(value)}
                    disabled={disabled}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <input
            ref={inputRef}
            id={id}
            type="text"
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-activedescendant={activeOptionId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy || undefined}
            className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm"
            placeholder={values.length === 0 ? `Add a ${itemLabel}` : undefined}
            value={draft}
            disabled={disabled}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={() => {
              setFocused(true)
              setDismissed(false)
            }}
            onBlur={() => {
              setFocused(false)
              setActiveIndex(0)
            }}
          />
        </div>

        <div
          id={listboxId}
          role="listbox"
          aria-label={`Saved ${itemLabel} recommendations`}
          hidden={!open}
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {open
            ? suggestions.map((value, index) => (
                <div
                  key={value}
                  id={`${optionIdPrefix}-${index}`}
                  role="option"
                  aria-selected={index === currentIndex}
                  className={cn(
                    "cursor-pointer rounded-sm px-2 py-1.5 text-sm",
                    index === currentIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted"
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => addValue(value)}
                >
                  {value}
                </div>
              ))
            : null}
        </div>
      </div>
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
