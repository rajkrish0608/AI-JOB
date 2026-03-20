"use client"

import { useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
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
  posted?: string
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
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
      const sourcesParam = selectedSources.join(",")
      const aggUrl = `${API_BASE}/api/jobs/aggregate?keywords=${encodeURIComponent(keywords)}&location=${encodeURIComponent(location)}&sources=${sourcesParam}&max_per_source=10`
      
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

      const scoreRes = await fetch(`${API_BASE}/api/jobs/score`, {
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

  /* BEFORE: bg-green-500/10 text-green-600 border-green-500/20 */
  /* AFTER:  var(--bg-overlay), var(--text-1), var(--border) */
  const getScoreColor = (score: number) => {
    return "bg-[var(--bg-overlay)] text-[var(--text-1)] border border-[var(--border)]"
  }

  return (
    <div className="space-y-6">
      {/* ── Search Form ────────────────────────────────────────────────────── */}
      <div className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-[12px] p-[28px] transition-colors duration-200 hover:bg-[var(--bg-overlay)] hover:border-[var(--border-hover)]">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label htmlFor="keywords" className="mb-2 block text-[var(--text-3)] text-xs font-medium uppercase tracking-wider">Keywords / Title</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-3)]" />
                <input 
                  id="keywords"
                  placeholder="e.g. React Developer, Product Manager" 
                  className="w-full bg-[var(--bg-overlay)] border border-[var(--border)] rounded-[7px] pl-10 pr-3 py-[9px] text-[13px] text-[var(--text-1)] placeholder-[var(--text-4)] focus:outline-none focus:border-[var(--border-hover)] focus:ring-1 focus:ring-[var(--border-hover)] transition-all"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  disabled={isSearching}
                />
              </div>
            </div>
            <div className="sm:w-1/3">
              <label htmlFor="location" className="mb-2 block text-[var(--text-3)] text-xs font-medium uppercase tracking-wider">Location</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-3)]" />
                <input 
                  id="location"
                  placeholder="e.g. Bangalore, Remote" 
                  className="w-full bg-[var(--bg-overlay)] border border-[var(--border)] rounded-[7px] pl-10 pr-3 py-[9px] text-[13px] text-[var(--text-1)] placeholder-[var(--text-4)] focus:outline-none focus:border-[var(--border-hover)] focus:ring-1 focus:ring-[var(--border-hover)] transition-all"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  disabled={isSearching}
                />
              </div>
            </div>
          </div>

          <div className="pt-2">
            <label className="mb-3 block text-[var(--text-3)] text-xs font-medium uppercase tracking-wider">Platforms to Search</label>
            <div className="flex flex-wrap gap-4">
              {ALL_SOURCES.map(source => (
                <div key={source.id} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`source-${source.id}`} 
                    checked={selectedSources.includes(source.id)}
                    onCheckedChange={() => handleSourceToggle(source.id)}
                    disabled={isSearching}
                    className="border-[var(--border)] data-[state=checked]:bg-[var(--accent)] data-[state=checked]:text-[var(--white)]"
                  />
                  <label 
                    htmlFor={`source-${source.id}`} 
                    className="text-[13px] text-[var(--text-2)] font-medium leading-none cursor-pointer"
                  >
                    {source.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between">
            <div className="text-[13px] text-[var(--text-3)] flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--text-3)]" />
              AI Auto-Scoring Enabled
            </div>
            {/* Primary Button */}
            <button 
              type="submit" 
              disabled={isSearching || isScoring} 
              className="w-full sm:w-auto bg-[var(--accent)] text-[var(--white)] font-medium text-[13px] px-[18px] py-[9px] rounded-[7px] transition-opacity duration-200 hover:opacity-80 flex items-center justify-center disabled:opacity-50"
            >
              {isSearching && !isScoring && <><Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--text-3)]" /> Scraping Web...</>}
              {isScoring && <><Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--text-3)]" /> AI is Scoring...</>}
              {!isSearching && !isScoring && "Search Jobs"}
            </button>
          </div>
        </form>
      </div>

      {/* ── Results Summary ────────────────────────────────────────────────── */}
      {Object.keys(sourceCounts).length > 0 && !isSearching && !isScoring && (
         <div className="flex flex-wrap gap-2 items-center text-[13px] text-[var(--text-3)] px-[28px]">
           <span className="font-medium text-[var(--text-1)]">Found on:</span>
           {Object.entries(sourceCounts).map(([src, count]) => count > 0 && (
             <span key={src} className="px-2 py-1 bg-[var(--bg-overlay)] border border-[var(--border)] text-[var(--text-3)] rounded-[4px] capitalize">
               {src}: {count}
             </span>
           ))}
         </div>
      )}

      {/* ── Loading States ─────────────────────────────────────────────────── */}
      {(isSearching || isScoring) && (
        <div className="py-12 flex flex-col items-center justify-center space-y-4 text-[var(--text-3)]">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-[13px] text-[var(--text-2)]">{isScoring ? "Claude is analyzing your fit for these roles..." : "Extracting listings from job portals..."}</p>
        </div>
      )}

      {/* ── Job Cards ──────────────────────────────────────────────────────── */}
      {!isSearching && !isScoring && jobs.length > 0 && (
        <div className="grid gap-[28px] md:gap-[28px]">
          {jobs.map((job, idx) => (
            <div key={idx} className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-[12px] p-[28px] sm:flex sm:items-stretch transition-colors duration-200 hover:bg-[var(--bg-overlay)] hover:border-[var(--border-hover)]">
              
              {/* Score Sidebar */}
              <div className={`flex flex-col items-center justify-center p-4 sm:w-32 border-b sm:border-b-0 sm:border-r border-[var(--border)] mr-6 mb-6 sm:mb-0`}>
                <div className="text-4xl font-bold tracking-tighter text-[var(--text-1)]">{job.fit_score || "?"}</div>
                <div className="text-[10px] uppercase tracking-[0.2em] mt-2 text-[var(--text-3)] text-center">Fit Score</div>
              </div>

              {/* Main Content */}
              <div className="flex-1">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="px-2 py-1 bg-[var(--bg-overlay)] border border-[var(--border)] text-[var(--text-3)] rounded-[4px] capitalize text-[11px] font-medium tracking-wide">
                        {job.source}
                      </span>
                      {job.posted && <span className="text-[13px] text-[var(--text-3)]">{job.posted}</span>}
                    </div>
                    <h3 className="text-xl font-semibold leading-tight mb-2 text-[var(--text-1)]">
                      <a href={job.url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text-1)] flex items-center gap-1.5 transition-colors">
                        {job.title} <ExternalLink className="h-3.5 w-3.5 text-[var(--text-3)]" />
                      </a>
                    </h3>
                    <div className="flex flex-wrap items-center gap-4 text-[13px] text-[var(--text-3)] mb-5">
                      <div className="flex items-center gap-1.5">
                        <Building className="h-4 w-4" /> {job.company}
                      </div>
                      {job.location && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-4 w-4" /> {job.location}
                        </div>
                      )}
                      {job.salary && (
                        <div className="flex items-center gap-1.5">
                          <Briefcase className="h-4 w-4" /> {job.salary}
                        </div>
                      )}
                    </div>
                    <p className="text-[13px] line-clamp-3 text-[var(--text-2)] leading-relaxed mb-6">
                      {job.description_snippet}
                    </p>
                  </div>
                </div>

                {/* AI Explanations */}
                {job.fit_score > 0 && (
                  <div className="grid sm:grid-cols-2 gap-6 pt-6 border-t border-[var(--border)]">
                    <div className="space-y-3">
                      <h4 className="text-[13px] font-medium flex items-center gap-2 text-[var(--text-1)] uppercase tracking-wide">
                        <CheckCircle2 className="h-4 w-4 text-[var(--text-3)]" /> Why you're a fit
                      </h4>
                      <ul className="text-[13px] space-y-2 text-[var(--text-2)]">
                        {job.fit_reasons?.map((reason, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-[var(--text-3)] mt-0.5">•</span> 
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    
                    {job.missing_skills && job.missing_skills.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-[13px] font-medium flex items-center gap-2 text-[var(--text-1)] uppercase tracking-wide">
                          <XCircle className="h-4 w-4 text-[var(--text-3)]" /> Missing Skills
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {job.missing_skills.map((skill, i) => (
                            <span key={i} className="px-2.5 py-1 bg-[var(--bg-overlay)] border border-[var(--border)] text-[var(--text-3)] text-[12px] rounded-[4px]">
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
