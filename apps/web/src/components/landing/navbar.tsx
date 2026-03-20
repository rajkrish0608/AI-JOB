import Link from "next/link"
import { Bot } from "lucide-react"

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-transparent bg-[var(--background)]/60 backdrop-blur-xl transition-all duration-300 data-[scrolled=true]:border-[var(--border)]">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 sm:px-12 md:px-24">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--text-1)] transition-transform duration-300 group-hover:scale-105">
             <Bot className="h-5 w-5 text-[var(--background)]" />
          </div>
          <span className="text-lg font-bold tracking-tight text-[var(--text-1)]">
            AI Job Apply
          </span>
        </Link>
        
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm font-medium text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/login"
            className="inline-flex h-9 items-center justify-center rounded-full bg-[var(--text-1)] px-4 text-sm font-medium text-[var(--background)] transition-transform hover:scale-105"
          >
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  )
}
