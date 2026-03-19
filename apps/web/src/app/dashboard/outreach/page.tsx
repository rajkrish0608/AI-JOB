"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Loader2, Search, Mail, Linkedin, CheckCircle2,
  Copy, CheckCheck, Shield, Building2, XCircle,
} from "lucide-react"
import { toast } from "sonner"

type Contact = {
  name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  title: string | null
  linkedin_url: string | null
  confidence: number | null
  source: "hunter" | "apollo"
}

type FindResult = {
  company_name: string
  domain: string | null
  contacts: Contact[]
  total_found: number
}

type VerifyResult = {
  email: string
  status: string
  score: number | null
  mx_records: boolean | null
}

export default function OutreachPage() {
  const [company, setCompany] = useState("")
  const [domain, setDomain] = useState("")
  const [maxResults, setMaxResults] = useState("10")

  const [isSearching, setIsSearching] = useState(false)
  const [result, setResult] = useState<FindResult | null>(null)

  const [verifying, setVerifying] = useState<string | null>(null)
  const [verified, setVerified] = useState<Record<string, VerifyResult>>({})
  const [copied, setCopied] = useState<string | null>(null)

  const handleFind = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!company.trim()) return
    setIsSearching(true)
    setResult(null)
    try {
      const res = await fetch("http://127.0.0.1:8000/api/outreach/find-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: company.trim(),
          company_domain: domain.trim() || undefined,
          max_results: parseInt(maxResults, 10),
        }),
      })
      if (!res.ok) throw new Error("Search failed")
      const data: FindResult = await res.json()
      setResult(data)
      if (data.total_found === 0) toast.info("No HR contacts found. Try adding the company domain.")
      else toast.success(`Found ${data.total_found} contact${data.total_found !== 1 ? "s" : ""}`)
    } catch (err: any) {
      toast.error(err.message || "Search failed")
    } finally {
      setIsSearching(false)
    }
  }

  const handleVerify = async (email: string) => {
    if (verified[email]) return
    setVerifying(email)
    try {
      const res = await fetch("http://127.0.0.1:8000/api/outreach/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error("Verify failed")
      const data: VerifyResult = await res.json()
      setVerified(prev => ({ ...prev, [email]: data }))
    } catch {
      toast.error("Email verification failed. Check your HUNTER_API_KEY.")
    } finally {
      setVerifying(null)
    }
  }

  const handleCopy = async (email: string) => {
    await navigator.clipboard.writeText(email)
    setCopied(email)
    toast.success("Email copied!")
    setTimeout(() => setCopied(null), 2000)
  }

  const statusColor = (status: string) => {
    if (status === "valid") return "text-green-500"
    if (status === "invalid") return "text-destructive"
    return "text-yellow-500"
  }

  const statusIcon = (status: string) => {
    if (status === "valid") return <CheckCircle2 className="h-4 w-4 text-green-500" />
    if (status === "invalid") return <XCircle className="h-4 w-4 text-destructive" />
    return <Shield className="h-4 w-4 text-yellow-500" />
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">HR Contact Finder</h1>
        <p className="text-muted-foreground mt-1">
          Find recruiters and hiring managers at any company using Hunter.io + Apollo.io.
        </p>
      </div>

      {/* Search Form */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Find Contacts</CardTitle>
          <CardDescription>Enter a company name (and optionally its domain) to surface HR contacts.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleFind} className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label>Company Name *</Label>
              <Input
                placeholder="e.g. Google"
                value={company}
                onChange={e => setCompany(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label>Domain <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                placeholder="e.g. google.com"
                value={domain}
                onChange={e => setDomain(e.target.value)}
              />
            </div>
            <div className="space-y-1 w-32">
              <Label>Max Results</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={maxResults}
                onChange={e => setMaxResults(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={isSearching} className="gap-2">
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {isSearching ? "Searching..." : "Find Contacts"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  {result.company_name}
                </CardTitle>
                {result.domain && (
                  <CardDescription>{result.domain}</CardDescription>
                )}
              </div>
              <Badge variant="secondary">{result.total_found} contact{result.total_found !== 1 ? "s" : ""}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {result.contacts.length === 0 ? (
              <p className="text-muted-foreground text-center py-10">No HR contacts found.</p>
            ) : (
              <div className="divide-y">
                {result.contacts.map((c, i) => (
                  <div key={i} className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    {/* Name + Title */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{c.name || "Unknown"}</span>
                        <Badge variant={c.source === "hunter" ? "default" : "secondary"} className="text-xs">
                          {c.source === "hunter" ? "Hunter" : "Apollo"}
                        </Badge>
                        {c.confidence !== null && (
                          <span className="text-xs text-muted-foreground">{c.confidence}% confidence</span>
                        )}
                      </div>
                      {c.title && <p className="text-sm text-muted-foreground">{c.title}</p>}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {c.email && (
                        <>
                          <span className="text-sm font-mono text-foreground bg-muted px-2 py-1 rounded">
                            {c.email}
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleCopy(c.email!)}
                            title="Copy email"
                          >
                            {copied === c.email
                              ? <CheckCheck className="h-4 w-4 text-green-500" />
                              : <Copy className="h-4 w-4" />
                            }
                          </Button>
                          {verified[c.email] ? (
                            <span className={`flex items-center gap-1 text-xs ${statusColor(verified[c.email].status)}`}>
                              {statusIcon(verified[c.email].status)}
                              {verified[c.email].status}
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-xs"
                              disabled={verifying === c.email}
                              onClick={() => handleVerify(c.email!)}
                            >
                              {verifying === c.email
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Shield className="h-3 w-3" />
                              }
                              Verify
                            </Button>
                          )}
                        </>
                      )}
                      {!c.email && <span className="text-xs text-muted-foreground italic">No email</span>}

                      {c.linkedin_url && (
                        <a
                          href={c.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:opacity-80"
                          title="LinkedIn Profile"
                        >
                          <Linkedin className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
