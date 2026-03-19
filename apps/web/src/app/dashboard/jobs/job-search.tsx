"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Search, Loader2, MapPin, Building, Briefcase, ExternalLink, Sparkles, CheckCircle2, XCircle } from "lucide-react"
import { toast } from "sonner"

// ── Types ──────────────────────────────────────────────────────────────────

interface ScoredJob {
  title: string
  company: string
  location: string
  url: string
  description_snippet?: string
  salary?: string
  source: string
  fit_score: number
  fit_reasons: string[]
  missing_skills: string[]
}

const ALL_SOURCES = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "naukri", label: "Naukri (India)" },
  { id: "indeed", label: "Indeed" },
  { id: "glassdoor", label: "Glassdoor" },
  { id: "internshala", label: "Internshala" },
]

export function JobSearch({ userProfile }: { userProfile: any }) {
  const [keywords, setKeywords] = useState("")
  const [location, setLocation] = useState("India")
  const [selectedSources, setSelectedSources] = useState<string[]>(["linkedin", "naukri", "indeed", "glassdoor", "internshala"])
  
  const [isSearching, setIsSearching] = useState(false)
  const [isScoring, setIsScoring] = useState(false)
  
  const [jobs, setJobs] = useState<ScoredJob[]>([])
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({})

  const handleSourceToggle = (sourceId: string) => {
    setSelectedSources(prev => 
      prev.includes(sourceId) 
        ? prev.filter(s => s !== sourceId)
        : [...prev, sourceId]
    )
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!keywords.trim()) {
      toast.error("Please enter job keywords")
      return
    }
    if (selectedSources.length === 0) {
      toast.error("Please select at least one source")
      return
    }

    setIsSearching(true)
    setJobs([])
    setSourceCounts({})

    try {
      // 1. Fetch Aggregated Jobs
      const sourcesParam = selectedSources.join(",")
      const aggUrl = `http://127.0.0.1:8000/api/jobs/aggregate?keywords=${encodeURIComponent(keywords)}&location=${encodeURIComponent(location)}&sources=${sourcesParam}&max_per_source=10`
      
      const aggRes = await fetch(aggUrl)
      if (!aggRes.ok) throw new Error("Failed to search jobs")
      const aggData = await aggRes.json()

      if (!aggData.jobs || aggData.jobs.length === 0) {
        toast.info("No jobs found for this search.")
        setIsSearching(false)
        return
      }

      setSourceCounts(aggData.source_counts)
      
      // If we don't have a profile to score against, just show the raw jobs
      if (!userProfile || !userProfile.skills || userProfile.skills.length === 0) {
        toast.warning("Complete your profile to enable AI scoring. Showing raw results.")
        setJobs(aggData.jobs.map((j: any) => ({ ...j, fit_score: 0, fit_reasons: [], missing_skills: [] })))
        setIsSearching(false)
        return
      }

      // 2. Score the Jobs
      setIsScoring(true)
      const scoreReqBody = {
        profile: {
          skills: userProfile.skills || [],
          experience: userProfile.experience || [],
          education: userProfile.education || [],
          preferred_roles: [userProfile.current_role].filter(Boolean) || [],
          preferred_locations: [userProfile.location].filter(Boolean) || [],
          years_of_experience: userProfile.years_of_experience || 0
        },
        jobs: aggData.jobs.slice(0, 15) // Only score top 15 to save tokens/time for now
      }

      const scoreRes = await fetch("http://127.0.0.1:8000/api/jobs/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scoreReqBody)
      })

      if (!scoreRes.ok) throw new Error("AI scoring failed")
      const scoreData = await scoreRes.json()

      setJobs(scoreData.scored_jobs || [])
      toast.success(`Found and scored ${scoreData.scored_jobs?.length || 0} jobs!`)

    } catch (error: any) {
      toast.error(error.message || "An error occurred during search.")
    } finally {
      setIsSearching(false)
      setIsScoring(false)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "bg-green-500/10 text-green-600 border-green-500/20"
    if (score >= 60) return "bg-blue-500/10 text-blue-600 border-blue-500/20"
    if (score >= 40) return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
    return "bg-slate-500/10 text-slate-600 border-slate-500/20"
  }

  return (
    <div className="space-y-6">
      {/* ── Search Form ────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Label htmlFor="keywords" className="mb-2 block">Keywords / Title</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="keywords"
                    placeholder="e.g. React Developer, Product Manager" 
                    className="pl-9"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    disabled={isSearching}
                  />
                </div>
              </div>
              <div className="sm:w-1/3">
                <Label htmlFor="location" className="mb-2 block">Location</Label>
                <div className="relative">
                  <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="location"
                    placeholder="e.g. Bangalore, Remote" 
                    className="pl-9"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    disabled={isSearching}
                  />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Label className="mb-3 block">Platforms to Search</Label>
              <div className="flex flex-wrap gap-4">
                {ALL_SOURCES.map(source => (
                  <div key={source.id} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`source-${source.id}`} 
                      checked={selectedSources.includes(source.id)}
                      onCheckedChange={() => handleSourceToggle(source.id)}
                      disabled={isSearching}
                    />
                    <label 
                      htmlFor={`source-${source.id}`} 
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {source.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-500" />
                AI Auto-Scoring Enabled
              </div>
              <Button type="submit" disabled={isSearching || isScoring} className="w-full sm:w-auto">
                {isSearching && !isScoring && <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scraping Web...</>}
                {isScoring && <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> AI is Scoring...</>}
                {!isSearching && !isScoring && "Search Jobs"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Results Summary ────────────────────────────────────────────────── */}
      {Object.keys(sourceCounts).length > 0 && !isSearching && !isScoring && (
         <div className="flex flex-wrap gap-2 items-center text-sm text-muted-foreground p-2">
           <span className="font-medium text-foreground">Found on:</span>
           {Object.entries(sourceCounts).map(([src, count]) => count > 0 && (
             <Badge key={src} variant="secondary" className="capitalize">
               {src}: {count}
             </Badge>
           ))}
         </div>
      )}

      {/* ── Loading States ─────────────────────────────────────────────────── */}
      {(isSearching || isScoring) && (
        <div className="py-12 flex flex-col items-center justify-center space-y-4 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p>{isScoring ? "Claude is analyzing your fit for these roles..." : "Extracting listings from job portals..."}</p>
        </div>
      )}

      {/* ── Job Cards ──────────────────────────────────────────────────────── */}
      {!isSearching && !isScoring && jobs.length > 0 && (
        <div className="grid gap-4 md:gap-6">
          {jobs.map((job, idx) => (
            <Card key={idx} className="overflow-hidden transition-all hover:shadow-md border-muted/60">
              <div className="p-0 sm:flex sm:items-stretch">
                {/* Score Sidebar */}
                <div className={`flex flex-col items-center justify-center p-4 sm:w-32 border-b sm:border-b-0 sm:border-r ${getScoreColor(job.fit_score)}`}>
                  <div className="text-4xl font-bold tracking-tighter">{job.fit_score || "?"}</div>
                  <div className="text-xs font-semibold uppercase tracking-wider mt-1 opacity-80">Fit Score</div>
                </div>

                {/* Main Content */}
                <div className="flex-1 p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="capitalize bg-background">{job.source}</Badge>
                        {job.posted && <span className="text-xs text-muted-foreground">{job.posted}</span>}
                      </div>
                      <h3 className="text-xl font-semibold leading-tight mb-1">
                        <a href={job.url} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1">
                          {job.title} <ExternalLink className="h-3.5 w-3.5 opacity-50" />
                        </a>
                      </h3>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-4">
                        <div className="flex items-center gap-1.5 ">
                          <Building className="h-4 w-4" /> {job.company}
                        </div>
                        {job.location && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-4 w-4" /> {job.location}
                          </div>
                        )}
                        {job.salary && (
                          <div className="flex items-center gap-1.5 text-green-600 font-medium">
                            <Briefcase className="h-4 w-4" /> {job.salary}
                          </div>
                        )}
                      </div>
                      <p className="text-sm line-clamp-2 text-muted-foreground mb-4">
                        {job.description_snippet}
                      </p>
                    </div>
                  </div>

                  {/* AI Explanations */}
                  {job.fit_score > 0 && (
                    <div className="grid sm:grid-cols-2 gap-4 mt-2">
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                          <CheckCircle2 className="h-4 w-4 text-green-500" /> Why you're a fit
                        </h4>
                        <ul className="text-sm space-y-1 text-muted-foreground">
                          {job.fit_reasons?.map((reason, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <span className="text-green-500 mt-0.5">•</span> 
                              <span>{reason}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      
                      {job.missing_skills && job.missing_skills.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                            <XCircle className="h-4 w-4 text-orange-500" /> Missing Skills
                          </h4>
                          <div className="flex flex-wrap gap-1.5">
                            {job.missing_skills.map((skill, i) => (
                              <Badge key={i} variant="secondary" className="bg-orange-500/10 text-orange-600 hover:bg-orange-500/20">
                                {skill}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
