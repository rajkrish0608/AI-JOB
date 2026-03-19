import { createClient } from "@/utils/supabase/server"
import { JobSearch } from "./job-search"
import { redirect } from "next/navigation"

export default async function JobsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single()

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">AI Job Search</h1>
        <p className="text-muted-foreground">
          Search across multiple platforms simultaneously. Our AI will automatically score each job against your profile to find the perfect fit.
        </p>
      </div>
      
      <JobSearch userProfile={profile} />
    </div>
  )
}
