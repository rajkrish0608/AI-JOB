import { createClient } from "@/utils/supabase/server"
import { ResumeManager } from "./resume-manager"
import { CoverLetterGenerator } from "./cover-letter-generator"
import { redirect } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FileText, Mail } from "lucide-react"

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
        <h1 className="text-3xl font-bold tracking-tight">ATS Toolkit</h1>
        <p className="text-muted-foreground">
          AI-powered resume builder and cover letter generator, tailored to each job you apply for.
        </p>
      </div>

      <Tabs defaultValue="resume" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="resume" className="gap-2">
            <FileText className="h-4 w-4" /> Resume Builder
          </TabsTrigger>
          <TabsTrigger value="cover-letter" className="gap-2">
            <Mail className="h-4 w-4" /> Cover Letter
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resume">
          <ResumeManager userProfile={profile} />
        </TabsContent>

        <TabsContent value="cover-letter">
          <CoverLetterGenerator userProfile={profile} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

