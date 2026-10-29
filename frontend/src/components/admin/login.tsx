"use client"

import { KeyRound, LoaderCircle, ShieldCheck } from "lucide-react"
import { useState } from "react"

import { useAdminAuth } from "@/components/admin/auth-provider"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ApiError } from "@/lib/api"

type LoginFields = Partial<Record<"email" | "password", string>>

export function AdminLogin({ ssoEnabled }: { ssoEnabled: boolean }): React.JSX.Element {
  const { login, startSso, error: authError } = useAdminAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fields, setFields] = useState<LoginFields>({})
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [startingSso, setStartingSso] = useState(false)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextFields: LoginFields = {}
    if (email.trim() === "") nextFields.email = "Email is required."
    if (password === "") nextFields.password = "Password is required."
    setFields(nextFields)
    setMessage(null)
    if (Object.keys(nextFields).length > 0) return

    setSubmitting(true)
    try {
      await login(email.trim(), password)
      setPassword("")
    } catch (loginError) {
      if (loginError instanceof ApiError) {
        setFields({
          ...(loginError.fields.email ? { email: loginError.fields.email } : {}),
          ...(loginError.fields.password ? { password: loginError.fields.password } : {}),
        })
        setMessage(loginError.message)
      } else {
        setMessage(loginError instanceof Error ? loginError.message : "Sign-in failed.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  const beginSso = async () => {
    setMessage(null)
    setStartingSso(true)
    try {
      await startSso()
    } catch (ssoError) {
      setMessage(ssoError instanceof Error ? ssoError.message : "Sign-in failed.")
      setStartingSso(false)
    }
  }

  const visibleError = message ?? authError

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <Card className="w-full max-w-md border-border/80 shadow-xl">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <ShieldCheck className="size-6" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Forge Performance Therapy
            </p>
            <CardTitle className="text-2xl">Administration</CardTitle>
            <CardDescription>
              Sign in to manage resources, media, and comments.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {visibleError ? (
            <Alert variant="destructive" role="alert">
              <AlertTitle>Unable to sign in</AlertTitle>
              <AlertDescription>{visibleError}</AlertDescription>
            </Alert>
          ) : null}

          <form className="space-y-4" noValidate onSubmit={submit}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="admin-email">
                Email
              </label>
              <Input
                id="admin-email"
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                aria-invalid={Boolean(fields.email)}
                aria-describedby={fields.email ? "admin-email-error" : undefined}
                onChange={(event) => setEmail(event.target.value)}
                disabled={submitting || startingSso}
                required
              />
              {fields.email ? (
                <p id="admin-email-error" className="text-sm text-destructive">
                  {fields.email}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="admin-password">
                Password
              </label>
              <Input
                id="admin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                aria-invalid={Boolean(fields.password)}
                aria-describedby={fields.password ? "admin-password-error" : undefined}
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting || startingSso}
                required
              />
              {fields.password ? (
                <p id="admin-password-error" className="text-sm text-destructive">
                  {fields.password}
                </p>
              ) : null}
            </div>

            <Button className="w-full" type="submit" disabled={submitting || startingSso}>
              {submitting ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <KeyRound aria-hidden="true" />
              )}
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          {ssoEnabled ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>
              <Button
                className="w-full"
                variant="outline"
                onClick={beginSso}
                disabled={submitting || startingSso}
              >
                {startingSso ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : (
                  <ShieldCheck aria-hidden="true" />
                )}
                {startingSso ? "Redirecting…" : "Sign in with single sign-on"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  )
}
