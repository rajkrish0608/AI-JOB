import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"
import { getDreamCompanies } from "./actions"
import { CompaniesList } from "./companies-list"

export default async function DreamCompaniesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const companies = await getDreamCompanies()

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Dream Companies</h1>
        <p className="text-[var(--text-2)] max-w-2xl">
          Track companies you admire. Add them to your watchlist to monitor for new roles, track open applications, and manage your contacts.
        </p>
      </div>
      
      <CompaniesList initialCompanies={companies} />
    </div>
  )
}
