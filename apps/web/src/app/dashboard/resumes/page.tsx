import { createClient } from "@/utils/supabase/server"
import { ResumeManager } from "./resume-manager"
import { redirect } from "next/navigation"

export default async function ResumesPage() {
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
        <h1 className="text-3xl font-bold tracking-tight">ATS Resumes</h1>
        <p className="text-muted-foreground">
          Generate tailored, ATS-optimized resumes based on your profile and target job descriptions.
        </p>
      </div>
      
      <ResumeManager userProfile={profile} />
    </div>
  )
}
