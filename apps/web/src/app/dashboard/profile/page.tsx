import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"
import OnboardingForm from "./onboarding-form"

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Fetch existing profile if any
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single()

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile Builder</h1>
        <p className="text-muted-foreground mt-2">
          Complete your profile to unlock AI-powered job matching and automated applications.
        </p>
      </div>
      
      <OnboardingForm initialData={profile} userId={user.id} />
    </div>
  )
}
