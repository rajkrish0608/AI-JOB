import Link from "next/link"
import { Bot } from "lucide-react"

export function Footer() {
  return (
    <footer className="w-full border-t border-[var(--border)] bg-[var(--surface-1)]">
      <div className="mx-auto max-w-7xl px-6 py-12 md:py-16 sm:px-12 md:px-24 flex flex-col items-center text-center">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Bot className="h-6 w-6 text-[var(--text-2)]" />
          <span className="text-lg font-medium text-[var(--text-2)]">AI Job Apply</span>
        </div>
        <p className="text-sm text-[var(--text-3)] font-light max-w-sm mb-8">
          The autonomous job search engine that finds, matches, and applies to jobs while you focus on the interview.
        </p>
        <div className="flex gap-6 text-sm font-medium text-[var(--text-3)]">
          <Link href="#" className="hover:text-[var(--text-1)] transition-colors">Privacy</Link>
          <Link href="#" className="hover:text-[var(--text-1)] transition-colors">Terms</Link>
          <Link href="#" className="hover:text-[var(--text-1)] transition-colors">Twitter</Link>
          <Link href="#" className="hover:text-[var(--text-1)] transition-colors">GitHub</Link>
        </div>
        <div className="mt-12 text-xs text-[var(--text-3)] opacity-60">
          © {new Date().getFullYear()} AI Job Apply. All rights reserved. Built for the modern career journey.
        </div>
      </div>
    </footer>
  )
}
