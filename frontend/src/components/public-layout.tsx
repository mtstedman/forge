import { Menu } from "lucide-react"
import * as React from "react"

import { Button, buttonVariants } from "@/components/ui/button"
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

type PublicLayoutProps = {
  children: React.ReactNode
  active?: "home" | "resources"
}

const navigation = [
  { href: "/#approach", label: "Approach" },
  { href: "/#services", label: "Services" },
  { href: "/#about", label: "About" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
] as const

function Brand({ active }: { active?: PublicLayoutProps["active"] }) {
  return (
    <a
      href="/"
      aria-current={active === "home" ? "page" : undefined}
      aria-label="Forge Performance Therapy home"
      className="inline-flex items-center gap-3 rounded-sm"
    >
      <span
        aria-hidden="true"
        className="grid size-10 place-items-center rounded-full border border-forge-gold bg-primary font-serif text-xl font-semibold text-primary-foreground shadow-sm"
      >
        F
      </span>
      <span className="flex flex-col leading-none">
        <strong className="font-serif text-xl font-semibold tracking-wide">Forge</strong>
        <small className="mt-1 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Performance Therapy
        </small>
      </span>
    </a>
  )
}

export function PublicLayout({
  children,
  active,
}: PublicLayoutProps): React.JSX.Element {
  const year = new Date().getFullYear()
  const resourcesCurrent = active === "resources" ? "page" : undefined

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-6 px-5 sm:px-8 lg:px-10">
          <Brand active={active} />

          <nav
            aria-label="Primary navigation"
            className="hidden items-center gap-6 text-sm font-semibold lg:flex"
          >
            {navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
            <a
              href="/resources/"
              aria-current={resourcesCurrent}
              className="rounded-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:text-foreground aria-[current=page]:underline aria-[current=page]:decoration-forge-gold aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-8"
            >
              Resources
            </a>
            <a
              href="/#contact"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Free phone consult
            </a>
          </nav>

          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="lg:hidden"
                aria-label="Open navigation"
              >
                <Menu aria-hidden="true" />
              </Button>
            </DialogTrigger>
            <DialogContent className="left-auto right-0 top-0 h-dvh w-[min(22rem,calc(100%-2rem))] max-w-none translate-x-0 translate-y-0 rounded-none border-y-0 border-r-0 p-0 sm:w-96">
              <DialogHeader className="border-b px-6 py-7 pr-14 text-left">
                <DialogTitle className="text-2xl">Navigation</DialogTitle>
                <DialogDescription>
                  Explore Forge Performance Therapy and its resources.
                </DialogDescription>
              </DialogHeader>
              <nav
                aria-label="Mobile navigation"
                className="flex flex-col gap-1 px-4 py-5"
              >
                {navigation.map((item) => (
                  <DialogClose key={item.href} asChild>
                    <a
                      href={item.href}
                      className="rounded-md px-4 py-3 font-semibold transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      {item.label}
                    </a>
                  </DialogClose>
                ))}
                <DialogClose asChild>
                  <a
                    href="/resources/"
                    aria-current={resourcesCurrent}
                    className="rounded-md px-4 py-3 font-semibold transition-colors hover:bg-accent hover:text-accent-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
                  >
                    Resources
                  </a>
                </DialogClose>
                <DialogClose asChild>
                  <a
                    href="/#contact"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "lg" }),
                      "mt-5 w-full"
                    )}
                  >
                    Book a free 15-min phone consult
                  </a>
                </DialogClose>
              </nav>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main id="main-content" className="min-h-[60vh]">
        {children}
      </main>

      <footer className="border-t bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-10 sm:px-8 lg:px-10">
          <div className="flex flex-col justify-between gap-8 md:flex-row md:items-center">
            <a href="/" className="font-serif text-3xl font-semibold tracking-wide">
              Forge
            </a>
            <nav
              aria-label="Footer navigation"
              className="flex flex-wrap gap-x-6 gap-y-3 text-sm"
            >
              {navigation.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="rounded-sm opacity-80 transition-opacity hover:opacity-100"
                >
                  {item.label}
                </a>
              ))}
              <a
                href="/resources/"
                className="rounded-sm opacity-80 transition-opacity hover:opacity-100"
              >
                Resources
              </a>
              <a
                href="/#contact"
                className="rounded-sm opacity-80 transition-opacity hover:opacity-100"
              >
                Contact
              </a>
            </nav>
          </div>
          <p className="border-t border-primary-foreground/20 pt-6 text-sm text-primary-foreground/75">
            © {year} Forge Performance Therapy · Twin Cities, MN
          </p>
        </div>
      </footer>
    </div>
  )
}
