"use client"

import { motion } from "framer-motion"
import { Search, FileText, Send, PieChart } from "lucide-react"

const features = [
  {
    icon: Search,
    title: "Semantic Job Matching",
    description: "Our AI scans the market to uncover hidden roles that perfectly map to your exact skillset and ambitions.",
  },
  {
    icon: FileText,
    title: "Dynamic Resumes",
    description: "Every application gets a tailored resume and cover letter, generated instantly using your master profile.",
  },
  {
    icon: Send,
    title: "Automated Outreach",
    description: "Launch targeted cold email campaigns to hiring managers, with copy crafted specifically for the company.",
  },
  {
    icon: PieChart,
    title: "Kanban Tracking",
    description: "Monitor your entire funnel in one stunning dashboard. From applied to hired, watch your pipeline flow.",
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 md:py-32 relative z-10 w-full">
      <div className="flex flex-col md:flex-row gap-12 md:gap-24 mb-16 md:mb-24">
        <div className="md:w-1/2">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-[var(--text-1)] mb-6"
          >
            A machine built to get you hired.
          </motion.h2>
        </div>
        <div className="md:w-1/2 flex items-end">
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-lg text-[var(--text-2)] font-light leading-relaxed"
          >
            Stop wasting hours filling out forms. AI Job Apply automates the tedious parts of the job search so you can focus on nailing the interview.
          </motion.p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
        {features.map((feature, i) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            className="group relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface-1)] p-8 md:p-12 transition-colors hover:bg-[var(--surface-2)] hover:border-[var(--text-3)]"
          >
            <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--background)] border border-[var(--border)] shadow-sm">
              <feature.icon className="h-6 w-6 text-[var(--text-1)]" />
            </div>
            <h3 className="mb-4 text-2xl font-semibold text-[var(--text-1)]">{feature.title}</h3>
            <p className="text-[var(--text-2)] leading-relaxed font-light">{feature.description}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
