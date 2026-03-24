"use client"
import { apiFetch } from "@/utils/api"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Mail, Copy, CheckCheck, Wand2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"

export function CoverLetterGenerator({ userProfile }: { userProfile: any }) {
  const [jobTitle, setJobTitle] = useState("")
  const [company, setCompany] = useState("")
  const [jobDescription, setJobDescription] = useState("")
  const [hiringManager, setHiringManager] = useState("")
  const [tone, setTone] = useState("confident")
  const [wordCount, setWordCount] = useState("350")

  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [copied, setCopied] = useState(false)

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!userProfile || !userProfile.skills) {
      toast.error("Please complete your profile first before generating a cover letter.")
      return
    }
    if (!jobDescription.trim()) {
      toast.error("Please paste the job description to generate a tailored cover letter.")
      return
    }

    setIsGenerating(true)
    setResult(null)

    try {
      const payload = {
        profile: {
          full_name: userProfile.full_name || "Candidate",
          skills: userProfile.skills || [],
          experience: userProfile.experience || [],
          education: userProfile.education || [],
          projects: userProfile.projects || [],
        },
        job: {
          title: jobTitle || "Target Role",
          company: company || "Target Company",
          description: jobDescription,
          hiring_manager: hiringManager || null,
        },
        tone,
        word_count: parseInt(wordCount, 10),
      }

      const res = await apiFetch("/api/resume/cover-letter", {
        method: "POST",
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error("Generation failed. Please try again.")
      const data = await res.json()
      setResult(data)
      toast.success(`Cover letter generated · ${data.word_count} words`)
    } catch (error: any) {
      toast.error(error.message || "An unexpected error occurred.")
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopy = async () => {
    if (!result?.cover_letter_plain) return
    await navigator.clipboard.writeText(result.cover_letter_plain)
    setCopied(true)
    toast.success("Copied to clipboard!")
    setTimeout(() => setCopied(false), 3000)
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
      {/* ── Left column: Config ── */}
      <Card className="lg:col-span-2 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">Cover Letter Settings</CardTitle>
          <CardDescription>Gemini will write a tailored, authentic cover letter.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Job Title</Label>
                <Input
                  placeholder="Frontend Engineer"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Company</Label>
                <Input
                  placeholder="Acme Corp"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Hiring Manager <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                placeholder="e.g. Sarah Johnson"
                value={hiringManager}
                onChange={(e) => setHiringManager(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Job Description <span className="text-destructive text-xs">*required</span></Label>
              <Textarea
                placeholder="Paste the full job description here..."
                className="min-h-[160px] text-sm resize-none"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div className="space-y-1">
                <Label>Tone</Label>
                <Select value={tone} onValueChange={(v) => setTone(v ?? tone)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confident">Confident</SelectItem>
                    <SelectItem value="formal">Formal / Corporate</SelectItem>
                    <SelectItem value="enthusiastic">Enthusiastic</SelectItem>
                    <SelectItem value="conversational">Conversational</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Target Length</Label>
                <Select value={wordCount} onValueChange={(v) => setWordCount(v ?? wordCount)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="250">Short (~250 words)</SelectItem>
                    <SelectItem value="350">Standard (~350 words)</SelectItem>
                    <SelectItem value="450">Detailed (~450 words)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="submit" className="w-full gap-2" disabled={isGenerating}>
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {isGenerating ? "Gemini is writing..." : "Generate Cover Letter"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Right column: Output ── */}
      <Card className="lg:col-span-3 shadow-sm flex flex-col bg-muted/30">
        <CardHeader className="bg-background border-b rounded-t-lg flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-xl">Generated Letter</CardTitle>
            <CardDescription>Ready to copy, edit or paste into your application.</CardDescription>
          </div>
          {result && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{result.word_count} words</span>
              <Button variant="outline" size="sm" className="gap-2" onClick={handleCopy}>
                {copied ? <CheckCheck className="h-4 w-4 text-[var(--text-3)]" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent className="flex-1 pt-4 flex flex-col gap-4 min-h-[500px]">
          {isGenerating ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground animate-pulse">
              <Mail className="h-10 w-10 opacity-30 text-primary" />
              <p>Gemini is crafting a compelling opening line...<br/>Takes about 10 seconds.</p>
            </div>
          ) : result ? (
            <>
              {/* Key selling points */}
              {result.key_selling_points?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI-identified selling points</p>
                  <div className="flex flex-wrap gap-2">
                    {result.key_selling_points.map((point: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs font-normal">{point}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* The letter itself */}
              <div className="flex-1 bg-background rounded-lg border p-5 overflow-auto">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
                  {result.cover_letter_plain}
                </pre>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Mail className="h-12 w-12 opacity-20" />
              <p>Your cover letter will appear here.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
