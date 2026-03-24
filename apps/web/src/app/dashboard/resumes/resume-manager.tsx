"use client"
import { apiFetch } from "@/utils/api"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, FileText, Download, Wand2, Eye } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

export function ResumeManager({ userProfile }: { userProfile: any }) {
  const [targetJobTitle, setTargetJobTitle] = useState("")
  const [targetCompany, setTargetCompany] = useState("")
  const [targetJobDesc, setTargetJobDesc] = useState("")
  const [template, setTemplate] = useState("professional")
  const [tone, setTone] = useState("confident")
  
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedResume, setGeneratedResume] = useState<any>(null)
  const [previewHtml, setPreviewHtml] = useState<string>("")
  const [isDownloading, setIsDownloading] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!userProfile || !userProfile.skills) {
      toast.error("Please complete your profile first before generating a resume.")
      return
    }

    setIsGenerating(true)
    setGeneratedResume(null)
    setPreviewHtml("")

    try {
      // 1. Generate the structured JSON resume
      const payload = {
        profile: {
          full_name: userProfile.full_name,
          email: "candidate@example.com", // Replace with real auth email if available
          phone: "123-456-7890",
          location: userProfile.location || "Remote",
          linkedin_url: userProfile.linkedin_url || "",
          portfolio_url: userProfile.portfolio_url || "",
          skills: userProfile.skills || [],
          experience: userProfile.experience || [],
          education: userProfile.education || [],
          projects: userProfile.projects || []
        },
        target_job: targetJobDesc ? {
          title: targetJobTitle || "Target Role",
          company: targetCompany || "Target Company",
          description: targetJobDesc
        } : null,
        template,
        tone
      }

      const buildRes = await apiFetch("/api/resume/generate", {
        method: "POST",
        body: JSON.stringify(payload)
      })

      if (!buildRes.ok) throw new Error("Failed to generate resume content")
      const buildData = await buildRes.json()
      const generatedData = buildData.resume
      setGeneratedResume(generatedData)

      toast.success(`Resume optimized! ATS Match Score: ${buildData.ats_score}/100`)

      // 2. Fetch the HTML preview
      const renderRes = await apiFetch("/api/resume/render", {
        method: "POST",
        body: JSON.stringify({
          resume_data: generatedData,
          template_name: template
        })
      })

      if (!renderRes.ok) throw new Error("Failed to render resume HTML")
      const htmlContent = await renderRes.text()
      setPreviewHtml(htmlContent)

    } catch (error: any) {
      toast.error(error.message || "An error occurred during generation.")
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDownloadPdf = async () => {
    if (!generatedResume) return

    setIsDownloading(true)
    const toastId = toast.loading("Generating PDF...")

    try {
      const pdfRes = await apiFetch("/api/resume/pdf", {
        method: "POST",
        body: JSON.stringify({
          resume_data: generatedResume,
          template_name: template
        })
      })

      if (!pdfRes.ok) throw new Error("PDF export failed")

      const blob = await pdfRes.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const safeName = generatedResume.full_name?.replace(/\s+/g, "_").toLowerCase() || "resume"
      a.download = `${safeName}_${template}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast.success("PDF Downloaded successfully", { id: toastId })
    } catch (error: any) {
      toast.error(error.message || "An error occurred during PDF generation.", { id: toastId })
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
      {/* ── Left Column: Configuration ── */}
      <Card className="lg:col-span-2 shadow-sm order-2 md:order-1">
        <CardHeader>
          <CardTitle className="text-xl">Tailor Settings</CardTitle>
          <CardDescription>Paste a job description to let Gemini optimize your resume for it.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGenerate} className="space-y-5">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Job Title</Label>
                  <Input 
                    placeholder="e.g. Frontend Engineer" 
                    value={targetJobTitle}
                    onChange={(e) => setTargetJobTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Company</Label>
                  <Input 
                    placeholder="e.g. Acme Corp" 
                    value={targetCompany}
                    onChange={(e) => setTargetCompany(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Job Description</Label>
                <Textarea 
                  placeholder="Paste the full job description here..." 
                  className="min-h-[150px] text-sm resize-none"
                  value={targetJobDesc}
                  onChange={(e) => setTargetJobDesc(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div className="space-y-1">
                <Label>Template</Label>
                <Select value={template} onValueChange={(v) => setTemplate(v || "professional")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="modern">Modern (Inter)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tone</Label>
                <Select value={tone} onValueChange={(v) => setTone(v || "confident")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confident">Confident</SelectItem>
                    <SelectItem value="formal">Formal / Corporate</SelectItem>
                    <SelectItem value="enthusiastic">Enthusiastic</SelectItem>
                    <SelectItem value="conversational">Conversational</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="submit" className="w-full gap-2" disabled={isGenerating}>
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {isGenerating ? "AI Designing Resume..." : "Generate AI Resume"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Right Column: Preview & Actions ── */}
      <Card className="lg:col-span-3 shadow-sm order-1 md:order-2 flex flex-col bg-muted/30">
        <CardHeader className="bg-background pb-4 border-b rounded-t-lg flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-xl">Document Preview</CardTitle>
            <CardDescription>Your tailored AI resume will appear here.</CardDescription>
          </div>
          {previewHtml && (
            <div className="flex items-center gap-2">
              <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                <DialogTrigger>
                  <div className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-3 gap-2 cursor-pointer">
                    <Eye className="h-4 w-4" /> Expand
                  </div>
                </DialogTrigger>
                <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 overflow-hidden">
                  <DialogHeader className="p-4 border-b bg-muted/40">
                    <DialogTitle>Full Screen Preview</DialogTitle>
                  </DialogHeader>
                  <div className="flex-1 bg-white overflow-hidden p-8 shadow-inner" style={{ aspectRatio: '1/1.414' }}>
                     <iframe 
                      srcDoc={previewHtml} 
                      className="w-full h-full border-0 bg-transparent" 
                      title="Resume Preview"
                    />
                  </div>
                </DialogContent>
              </Dialog>

              <Button size="sm" className="gap-2" onClick={handleDownloadPdf} disabled={isDownloading}>
                {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Export PDF
              </Button>
            </div>
          )}
        </CardHeader>
        
        <CardContent className="flex-1 p-0 flex items-center justify-center min-h-[500px] overflow-hidden">
          {isGenerating ? (
            <div className="flex flex-col items-center gap-4 text-muted-foreground p-10 text-center animate-pulse">
              <Wand2 className="h-10 w-10 text-primary opacity-50" />
              <p>Gemini is writing your tailored achievements... <br/>This takes about 10-15 seconds.</p>
            </div>
          ) : previewHtml ? (
            <div className="w-full flex justify-center py-6 bg-slate-100 dark:bg-slate-900 overflow-auto h-full px-4">
              <div 
                className="bg-white shadow-xl max-w-[800px] w-full origin-top transform scale-[0.8] sm:scale-100 transition-transform p-4 sm:p-0"
                style={{ aspectRatio: '1/1.414' }}
              >
                <iframe 
                  srcDoc={previewHtml} 
                  className="w-full h-full border-0 pointer-events-none" 
                  title="Resume Preview"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-muted-foreground p-10 text-center">
              <FileText className="h-12 w-12 opacity-20" />
              <p>Configure settings and generate to see your preview here.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
