"use client"

import { motion, useMotionValue, useTransform } from "framer-motion"
import Link from "next/link"
import { ArrowRight, Sparkles } from "lucide-react"

export function HeroSection() {
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const mouseXSpring = useTransform(x, [-0.5, 0.5], ["10deg", "-10deg"])
  const mouseYSpring = useTransform(y, [-0.5, 0.5], ["-10deg", "10deg"])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const xPct = mouseX / width - 0.5
    const yPct = mouseY / height - 0.5
    x.set(xPct)
    y.set(yPct)
  }

  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
  }

  return (
    <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 flex flex-col items-center justify-center text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-4xl flex flex-col items-center"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 mb-8 rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-xs font-medium text-[var(--text-2)]">
          <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span>The next generation of career automation</span>
        </div>

        <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter text-[var(--text-1)] mb-8 leading-[1.05]">
          Your Next Job,<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--text-1)] via-white to-[var(--text-3)] opacity-90">
            Fully Automated.
          </span>
        </h1>

        <p className="text-lg md:text-xl text-[var(--text-2)] mb-12 max-w-2xl font-light leading-relaxed">
          AI Job Apply is the premier copilot that finds, customizes, and applies to thousands of hyper-relevant roles while you sleep. Perfect resumes. Instant cover letters. Zero friction.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/login"
            className="group relative inline-flex h-12 items-center justify-center overflow-hidden rounded-full bg-[var(--text-1)] px-8 font-medium text-[var(--background)] transition-all duration-300 hover:scale-105 active:scale-95"
          >
            <span className="mr-2">Start Automating</span>
            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
          <Link
            href="#features"
            className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--border)] bg-transparent px-8 font-medium text-[var(--text-1)] transition-colors hover:bg-[var(--surface-1)]"
          >
            Explore Features
          </Link>
        </div>
      </motion.div>

      {/* 3D Dashboard Preview */}
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="mt-24 w-full max-w-5xl rounded-2xl md:rounded-3xl border border-[var(--border)] bg-[var(--surface-1)]/50 backdrop-blur-xl p-2 md:p-4 shadow-2xl relative perspective-[2000px]"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ perspective: 1200 }}
      >
        <motion.div
          style={{
            rotateX: mouseYSpring,
            rotateY: mouseXSpring,
            transformStyle: "preserve-3d",
          }}
          className="w-full aspect-[16/9] rounded-xl overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center relative shadow-inner"
        >
           {/* Faux Dashboard UI inside the 3D card */}
          <div className="absolute top-0 left-0 w-full h-12 border-b border-[var(--border)] bg-[var(--surface-1)]/80 flex items-center px-4 gap-2">
             <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
             <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
             <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
             <div className="ml-4 h-6 w-48 bg-[var(--surface-2)] rounded-md border border-[var(--border)]" />
          </div>
          
          <div className="w-full h-full pt-12 p-6 flex gap-6">
            <div className="w-64 h-full flex flex-col gap-4">
              <div className="w-full h-8 bg-[var(--border)]/50 rounded-md" />
              <div className="w-full h-8 bg-[var(--border)]/30 rounded-md" />
              <div className="w-full h-8 bg-[var(--border)]/30 rounded-md" />
              <div className="w-full h-8 bg-[var(--border)]/30 rounded-md" />
            </div>
            <div className="flex-1 h-full flex flex-col gap-6">
              <div className="w-full flex gap-4 h-32">
                 <div className="flex-1 bg-[var(--surface-1)] rounded-xl border border-[var(--border)] p-4 flex flex-col justify-end">
                    <div className="w-16 h-8 bg-[var(--text-1)] rounded-md mb-2" />
                    <div className="w-24 h-4 bg-[var(--text-3)] rounded-md" />
                 </div>
                 <div className="flex-1 bg-[var(--surface-1)] rounded-xl border border-[var(--border)] p-4 flex flex-col justify-end">
                    <div className="w-24 h-8 bg-[var(--accent)] rounded-md mb-2" />
                    <div className="w-20 h-4 bg-[var(--text-3)] rounded-md" />
                 </div>
                 <div className="flex-1 bg-[var(--surface-1)] rounded-xl border border-[var(--border)] p-4 flex flex-col justify-end">
                    <div className="w-12 h-8 bg-[var(--text-1)] rounded-md mb-2" />
                    <div className="w-28 h-4 bg-[var(--text-3)] rounded-md" />
                 </div>
              </div>
              <div className="w-full flex-1 bg-[var(--surface-1)] rounded-xl border border-[var(--border)] p-6">
                 <div className="w-1/3 h-6 bg-[var(--text-2)] rounded-md mb-6" />
                 <div className="w-full h-12 bg-[var(--border)]/40 rounded-lg mb-3" />
                 <div className="w-full h-12 bg-[var(--border)]/30 rounded-lg mb-3" />
                 <div className="w-full h-12 bg-[var(--border)]/20 rounded-lg" />
              </div>
            </div>
          </div>

          {/* Glare effect */}
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none mix-blend-overlay" />
        </motion.div>
      </motion.div>
    </section>
  )
}
