import { getApplications } from "./actions"
import TrackerClient from "./tracker-client"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Job Tracker - Swasth AI",
  description: "Track and manage your job applications.",
}

export default async function TrackerPage() {
  const initialApplications = await getApplications()

  return (
    <div className="flex-1 space-y-6 pt-5 pb-8 min-h-0 overflow-y-auto w-full px-8 max-w-[1400px] mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-1)]">Job Tracker</h1>
          <p className="text-[14px] text-[var(--text-2)] mt-1">Manage all your applications from manual tracking, auto-apply, and cold emails.</p>
        </div>
      </div>
      
      <TrackerClient initialApplications={initialApplications} />
    </div>
  )
}
