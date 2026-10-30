"use client"

import {
  ClipboardList,
  FileText,
  Images,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquare,
  ShieldCheck,
} from "lucide-react"
import { useState } from "react"

import { useAdminAuth } from "@/components/admin/auth-provider"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

type AdminTab = "main-page" | "posts" | "media" | "comments" | "consultations"

const tabs: Array<{
  id: AdminTab
  label: string
  icon: typeof FileText
}> = [
  { id: "main-page", label: "Main Page", icon: LayoutDashboard },
  { id: "posts", label: "Posts", icon: FileText },
  { id: "media", label: "Media", icon: Images },
  { id: "comments", label: "Comments", icon: MessageSquare },
  { id: "consultations", label: "Consultations", icon: ClipboardList },
]

export function AdminLayout({
  active,
  onNavigate,
  children,
}: {
  active: AdminTab
  onNavigate: (tab: AdminTab) => void
  children: React.ReactNode
}): React.JSX.Element {
  const { user, status, logout } = useAdminAuth()
  const [signingOut, setSigningOut] = useState(false)

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30" aria-busy="true">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
          Checking your session…
        </div>
      </main>
    )
  }

  if (status !== "authenticated" || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <p className="text-sm text-muted-foreground">Sign in to access administration.</p>
      </main>
    )
  }

  const accountName = user.name || user.email || user.sub || "Administrator"
  const activeTab = tabs.find((tab) => tab.id === active) ?? tabs[0]
  const ActiveIcon = activeTab.icon

  const signOut = async () => {
    setSigningOut(true)
    try {
      await logout()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="min-h-screen bg-muted/25 text-foreground">
      <header className="border-b bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Forge Performance Therapy
              </p>
              <h1 className="text-lg font-semibold tracking-tight">Content administration</h1>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/35 px-3 py-2 lg:justify-end">
            <div className="min-w-0 text-right">
              <p className="truncate text-sm font-medium">{accountName}</p>
              {accountName !== user.email ? (
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              ) : null}
            </div>
            <Button variant="ghost" size="sm" onClick={signOut} disabled={signingOut}>
              {signingOut ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <LogOut aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{signingOut ? "Signing out…" : "Sign out"}</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3 sm:hidden">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Open admin sections">
                <Menu aria-hidden="true" />
              </Button>
            </DialogTrigger>
            <DialogContent className="left-auto right-0 top-0 h-dvh w-[min(22rem,calc(100%-2rem))] max-w-none translate-x-0 translate-y-0 rounded-none border-y-0 border-r-0 p-0 sm:w-96">
              <DialogHeader className="border-b px-6 py-7 pr-14 text-left">
                <DialogTitle className="text-2xl">Admin sections</DialogTitle>
                <DialogDescription>Choose a section to manage.</DialogDescription>
              </DialogHeader>
              <nav aria-label="Mobile admin sections" className="flex flex-col gap-1 px-4 py-5">
                {tabs.map((tab) => {
                  const Icon = tab.icon
                  const selected = active === tab.id
                  return (
                    <DialogClose key={tab.id} asChild>
                      <button
                        type="button"
                        className={cn(
                          "inline-flex min-h-11 items-center gap-3 rounded-md px-4 py-3 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                          selected
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        )}
                        aria-current={selected ? "page" : undefined}
                        onClick={() => onNavigate(tab.id)}
                      >
                        <Icon className="size-4" aria-hidden="true" />
                        {tab.label}
                      </button>
                    </DialogClose>
                  )
                })}
              </nav>
            </DialogContent>
          </Dialog>
          <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <ActiveIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate">{activeTab.label}</span>
          </p>
        </div>

        <nav
          className="mb-6 hidden gap-1 rounded-xl border bg-background p-1 shadow-xs sm:inline-flex"
          aria-label="Admin sections"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon
            const selected = active === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                className={cn(
                  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  selected
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
                aria-current={selected ? "page" : undefined}
                onClick={() => onNavigate(tab.id)}
              >
                <Icon className="size-4" aria-hidden="true" />
                {tab.label}
              </button>
            )
          })}
        </nav>

        <main>{children}</main>
      </div>
    </div>
  )
}
