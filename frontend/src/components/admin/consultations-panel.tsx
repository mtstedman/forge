"use client"

import {
  Check,
  CheckCircle2,
  CircleAlert,
  Clock,
  LoaderCircle,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  X,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { useAdminAuth } from "@/components/admin/auth-provider"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import type {
  ApiEnvelope,
  ConsultationRequest,
  ConsultationRequestsResponse,
  ConsultationStatus,
} from "@/lib/types"
import { cn } from "@/lib/utils"

type LoadState = "loading" | "ready" | "error"
type Notice = { kind: "success" | "error"; message: string }

const FILTERS: Array<{ value: ConsultationStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "completed", label: "Completed" },
  { value: "ignored", label: "Ignored" },
]
const FALLBACK_PER_PAGE = 20

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== "" ? error.message : fallback
}

function formatDate(value: string): string {
  if (value === "") return "Date unavailable"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function statusLabel(status: ConsultationStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function statusClass(status: ConsultationStatus): string {
  if (status === "completed") {
    return "border-emerald-700/25 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300"
  }
  if (status === "ignored") return "border-muted-foreground/25 bg-muted text-muted-foreground"
  return "border-amber-700/25 bg-amber-500/10 text-amber-800 dark:text-amber-300"
}

export function ConsultationsPanel(): React.JSX.Element {
  const { request, status } = useAdminAuth()
  const authenticated = status === "authenticated"
  const [filter, setFilter] = useState<ConsultationStatus>("pending")
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(FALLBACK_PER_PAGE)
  const [consultations, setConsultations] = useState<ConsultationRequest[]>([])
  const [loadState, setLoadState] = useState<LoadState>("loading")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const loadRequestRef = useRef(0)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    if (!authenticated) {
      loadRequestRef.current += 1
      setConsultations([])
      return
    }

    const requestId = ++loadRequestRef.current
    setLoadState("loading")
    setLoadError(null)

    request<ConsultationRequestsResponse>(
      `/admin/consultation-requests?status=${encodeURIComponent(filter)}&page=${encodeURIComponent(page)}`
    )
      .then((payload) => {
        if (requestId !== loadRequestRef.current) return
        setConsultations(Array.isArray(payload?.data) ? payload.data : [])
        setPerPage(
          Number.isInteger(payload?.meta?.per_page) && payload.meta.per_page > 0
            ? payload.meta.per_page
            : FALLBACK_PER_PAGE
        )
        setLoadState("ready")
      })
      .catch((error: unknown) => {
        if (requestId !== loadRequestRef.current) return
        setLoadError(errorText(error, "Consultation requests could not be loaded."))
        setLoadState("error")
      })
  }, [authenticated, filter, page, reloadToken, request])

  const refresh = () => setReloadToken((token) => token + 1)

  const finishMutation = (message: string) => {
    setNotice({ kind: "success", message })
    if (consultations.length === 1 && page > 1) setPage((current) => Math.max(1, current - 1))
    else refresh()
  }

  const moderate = async (
    consultation: ConsultationRequest,
    nextStatus: "completed" | "ignored"
  ) => {
    if (busyId !== null || !authenticated || consultation.status !== "pending") return
    setBusyId(consultation.id)
    setNotice(null)

    try {
      await request<ApiEnvelope<ConsultationRequest>>(
        `/admin/consultation-requests/${encodeURIComponent(consultation.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus }),
        }
      )
      finishMutation(
        nextStatus === "completed"
          ? "Consultation marked completed."
          : "Consultation ignored."
      )
    } catch (error) {
      setNotice({
        kind: "error",
        message: errorText(
          error,
          nextStatus === "completed"
            ? "The consultation could not be marked completed."
            : "The consultation could not be ignored."
        ),
      })
    } finally {
      setBusyId(null)
    }
  }

  if (!authenticated) return <></>

  const hasNextPage = loadState === "ready" && consultations.length >= perPage

  return (
    <section className="space-y-6" aria-labelledby="consultations-heading">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Client care</p>
          <h2 id="consultations-heading" className="font-serif text-3xl font-semibold tracking-tight">
            Consultation requests
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Review prospective client details and track completed or ignored requests.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <label htmlFor="consultation-status-filter" className="text-sm font-medium">
              Queue
            </label>
            <select
              id="consultation-status-filter"
              value={filter}
              className="flex h-9 min-w-44 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onChange={(event) => {
                setFilter(event.currentTarget.value as ConsultationStatus)
                setPage(1)
                setNotice(null)
              }}
            >
              {FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <Button variant="outline" onClick={refresh} disabled={loadState === "loading"}>
            <RefreshCw className={loadState === "loading" ? "animate-spin" : undefined} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </div>

      {notice ? (
        <Alert variant={notice.kind === "error" ? "destructive" : "default"} aria-live="polite">
          {notice.kind === "error" ? (
            <CircleAlert aria-hidden="true" />
          ) : (
            <CheckCircle2 aria-hidden="true" />
          )}
          <AlertTitle>{notice.kind === "error" ? "Update failed" : "Queue updated"}</AlertTitle>
          <AlertDescription>{notice.message}</AlertDescription>
        </Alert>
      ) : null}

      {loadState === "loading" ? (
        <Card aria-busy="true">
          <CardContent className="flex min-h-48 items-center justify-center gap-3 text-sm text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
            Loading consultation requests…
          </CardContent>
        </Card>
      ) : loadState === "error" ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Consultation requests could not be loaded</AlertTitle>
          <AlertDescription className="gap-3">
            <p>{loadError}</p>
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw aria-hidden="true" />
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : consultations.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-full bg-muted p-3 text-muted-foreground">
              <MessageSquare className="size-6" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-serif text-xl font-semibold">No requests in this queue</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                There are no {filter} consultation requests on page {page}.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4" aria-label={`${statusLabel(filter)} consultation requests`}>
          {consultations.map((consultation) => {
            const isBusy = busyId === consultation.id
            return (
              <Card key={consultation.id}>
                <CardHeader className="gap-3 sm:grid-cols-[1fr_auto] sm:grid-rows-1">
                  <div className="min-w-0">
                    <CardTitle className="font-serif text-xl">{consultation.name}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Submitted {formatDate(consultation.created_at)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex h-fit w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
                      statusClass(consultation.status)
                    )}
                  >
                    {statusLabel(consultation.status)}
                  </span>
                </CardHeader>
                <CardContent className="space-y-5">
                  <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <dt className="flex items-center gap-2 font-medium text-muted-foreground">
                        <Phone className="size-4" aria-hidden="true" /> Phone
                      </dt>
                      <dd className="mt-1 break-words">{consultation.phone}</dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-2 font-medium text-muted-foreground">
                        <Mail className="size-4" aria-hidden="true" /> Email
                      </dt>
                      <dd className="mt-1 break-words">{consultation.email || "Not provided"}</dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-2 font-medium text-muted-foreground">
                        <Clock className="size-4" aria-hidden="true" /> Best time
                      </dt>
                      <dd className="mt-1">{consultation.best_time}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-muted-foreground">Consent recorded</dt>
                      <dd className="mt-1">{formatDate(consultation.consented_at)}</dd>
                    </div>
                  </dl>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Message</h3>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-7">
                      {consultation.message || "No message provided."}
                    </p>
                  </div>
                  {consultation.resolved_at ? (
                    <p className="text-xs text-muted-foreground">
                      Resolved {formatDate(consultation.resolved_at)}
                    </p>
                  ) : null}
                </CardContent>
                {consultation.status === "pending" ? (
                  <CardFooter className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => void moderate(consultation, "completed")}
                      disabled={busyId !== null}
                    >
                      {isBusy ? (
                        <LoaderCircle className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Check aria-hidden="true" />
                      )}
                      Mark completed
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void moderate(consultation, "ignored")}
                      disabled={busyId !== null}
                    >
                      {isBusy ? (
                        <LoaderCircle className="animate-spin" aria-hidden="true" />
                      ) : (
                        <X aria-hidden="true" />
                      )}
                      Ignore
                    </Button>
                  </CardFooter>
                ) : null}
              </Card>
            )
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm text-muted-foreground">Page {page}</p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1 || loadState === "loading" || busyId !== null}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((current) => current + 1)}
            disabled={!hasNextPage || busyId !== null}
          >
            Next
          </Button>
        </div>
      </div>
    </section>
  )
}
