"use client"

import { apiFetch } from "@/utils/api"
import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Loader2, Search, Mail, Linkedin, CheckCircle2,
  Copy, CheckCheck, Shield, Building2, XCircle, Send, Plus, RefreshCw
} from "lucide-react"
import { toast } from "sonner"

// --- Types ---

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

type GeneratedEmail = {
  subject_line: string
  body_html: string
  body_plain: string
  word_count: number
  personalization_notes: string[]
}

type BatchEmailOutput = {
  status: string
  email: GeneratedEmail
  recipient_name: string | null
  recipient_email: string | null
}

type GmailTokens = {
  access_token: string
  refresh_token: string | null
  token_uri: string
  client_id: string
  client_secret: string
  scopes: string[] | null
  expiry: string | null
}

const REDIRECT_URI = typeof window !== 'undefined' 
  ? `${window.location.origin}/dashboard/outreach` 
  : "http://localhost:3000/dashboard/outreach";

// We wrap the main logic in a Suspense-friendly component
function OutreachContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  // Tab State
  const [activeTab, setActiveTab] = useState("find")

  // --- Gmail Auth State ---
  const [gmailAddress, setGmailAddress] = useState<string | null>(null)
  const [gmailTokens, setGmailTokens] = useState<GmailTokens | null>(null)
  const [isAuthenticating, setIsAuthenticating] = useState(false)

  // --- Search State ---
  const [company, setCompany] = useState("")
  const [domain, setDomain] = useState("")
  const [maxResults, setMaxResults] = useState("10")
  const [isSearching, setIsSearching] = useState(false)
  const [searchResult, setSearchResult] = useState<FindResult | null>(null)

  // --- Selection State ---
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set())

  // --- Generation State ---
  const [senderName, setSenderName] = useState("John Doe")
  const [senderTitle, setSenderTitle] = useState("Software Engineer")
  const [senderExperience, setSenderExperience] = useState("")
  const [emailType, setEmailType] = useState("cold_intro")
  const [tone, setTone] = useState("professional")
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedEmails, setGeneratedEmails] = useState<BatchEmailOutput[]>([])

  // --- Sending State ---
  const [isSending, setIsSending] = useState(false)

  // 1. Check for OAuth callback in URL
  useEffect(() => {
    const code = searchParams.get("code")
    if (code) {
      handleOAuthCallback(code)
    } else {
      loadStoredTokens()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const loadStoredTokens = () => {
    try {
      const stored = localStorage.getItem("gmailTokens")
      const address = localStorage.getItem("gmailAddress")
      if (stored && address) {
        setGmailTokens(JSON.parse(stored))
        setGmailAddress(address)
      }
    } catch {}
  }

  const handleOAuthCallback = async (code: string) => {
    setIsAuthenticating(true)
    try {
      const res = await apiFetch(`/api/outreach/gmail/callback?code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`)
      if (!res.ok) throw new Error("Auth failed")
      const data = await res.json()
      
      setGmailTokens(data.tokens)
      setGmailAddress(data.gmail_address)
      localStorage.setItem("gmailTokens", JSON.stringify(data.tokens))
      localStorage.setItem("gmailAddress", data.gmail_address)
      
      toast.success("Gmail connected successfully!")
      router.replace("/dashboard/outreach") // strip code from url
    } catch (err: any) {
      toast.error(err.message || "Failed to connect Gmail")
      router.replace("/dashboard/outreach")
    } finally {
      setIsAuthenticating(false)
    }
  }

  const handleConnectGmail = async () => {
    try {
      const res = await apiFetch(`/api/outreach/gmail/auth-url?redirect_uri=${encodeURIComponent(REDIRECT_URI)}`)
      const data = await res.json()
      window.location.href = data.auth_url
    } catch (err: any) {
      toast.error(err.message || "Failed to start Gmail auth")
    }
  }

  const handleDisconnectGmail = () => {
    setGmailTokens(null)
    setGmailAddress(null)
    localStorage.removeItem("gmailTokens")
    localStorage.removeItem("gmailAddress")
    toast.info("Gmail disconnected")
  }

  // 2. Find Contacts
  const handleFind = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!company.trim()) return
    setIsSearching(true)
    setSearchResult(null)
    setSelectedEmails(new Set())
    try {
      const res = await apiFetch("/api/outreach/find-contacts", {
        method: "POST",
        body: JSON.stringify({
          company_name: company.trim(),
          company_domain: domain.trim() || undefined,
          max_results: parseInt(maxResults, 10),
        }),
      })
      if (!res.ok) throw new Error("Search failed")
      const data = await res.json()
      setSearchResult(data)
      if (data.total_found === 0) toast.info("No HR contacts found.")
      else toast.success(`Found ${data.total_found} contact(s)`)
    } catch (err: any) {
      toast.error(err.message || "Search failed")
    } finally {
      setIsSearching(false)
    }
  }

  const toggleSelect = (email: string) => {
    const newSet = new Set(selectedEmails)
    if (newSet.has(email)) newSet.delete(email)
    else newSet.add(email)
    setSelectedEmails(newSet)
  }

  const selectAll = () => {
    if (!searchResult) return
    const validEmails = searchResult.contacts.filter(c => c.email).map(c => c.email!)
    if (selectedEmails.size === validEmails.length) {
      setSelectedEmails(new Set())
    } else {
      setSelectedEmails(new Set(validEmails))
    }
  }

  // 3. Generate Emails
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedEmails.size === 0) {
      toast.error("Select at least one contact with an email address")
      return
    }
    
    // Build recipient payload
    const recipients = searchResult!.contacts.filter(c => c.email && selectedEmails.has(c.email))
    
    setIsGenerating(true)
    setActiveTab("generate")
    try {
      const payload = {
        sender: {
          full_name: senderName,
          current_title: senderTitle,
          experience_summary: senderExperience,
        },
        recipients: recipients,
        tone: tone,
        email_type: emailType,
        max_words: 150
      }
      
      const res = await apiFetch("/api/outreach/generate-email/batch", {
        method: "POST",
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error("Failed to generate emails")
      
      const data = await res.json()
      setGeneratedEmails(data.emails)
      toast.success(`Generated ${data.total_generated} emails`)
      setActiveTab("review")
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  // 4. Send Emails via Gmail
  const handleSendEmails = async () => {
    if (!gmailTokens || !gmailAddress) {
      toast.error("Please connect Gmail first")
      return
    }
    
    const validEmailsToSend = generatedEmails.filter(e => e.status === "success" && e.recipient_email)
    if (validEmailsToSend.length === 0) {
      toast.error("No valid emails to send")
      return
    }

    setIsSending(true)
    try {
      const payload = {
        tokens: gmailTokens,
        emails: validEmailsToSend.map(e => ({
          to: e.recipient_email,
          subject: e.email.subject_line,
          body_html: e.email.body_html,
          body_plain: e.email.body_plain
        })),
        delay_seconds: 2.0
      }

      const res = await apiFetch("/api/outreach/gmail/send-batch", {
        method: "POST",
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.detail || "Sending failed")
      }
      const data = await res.json()
      toast.success(`Sent ${data.total_sent} emails. Failed: ${data.total_failed}`)
      if (data.total_sent > 0) {
        setGeneratedEmails([]) // clear queue
        setActiveTab("find")
      }
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cold Email Outreach</h1>
          <p className="text-muted-foreground mt-1">
            Find HR contacts, generate personalized AI emails, and send via Gmail.
          </p>
        </div>
        
        {/* Gmail Connect Badge/Btn */}
        {isAuthenticating ? (
           <Button disabled variant="outline"><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Connecting...</Button>
        ) : gmailAddress ? (
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="px-3 py-1.5 gap-2 font-normal text-sm border-[var(--border)] bg-[var(--bg-overlay)] text-[var(--text-2)]">
              <Mail className="h-4 w-4" /> Connected as {gmailAddress}
            </Badge>
            <Button size="sm" variant="ghost" onClick={handleDisconnectGmail}>Disconnect</Button>
          </div>
        ) : (
          <Button onClick={handleConnectGmail} variant="secondary" className="gap-2">
            <Mail className="h-4 w-4" /> Connect Gmail
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="find">1. Find Contacts</TabsTrigger>
          <TabsTrigger value="generate">2. Configure Generation</TabsTrigger>
          <TabsTrigger value="review">3. Review & Send</TabsTrigger>
        </TabsList>

        {/* --- TAB 1: FIND CONTACTS --- */}
        <TabsContent value="find" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Search for HR / Recruiters</CardTitle>
              <CardDescription>Enter a company to find active talent acquisition contacts.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleFind} className="flex flex-wrap gap-4 items-end">
                <div className="space-y-1.5 flex-1 min-w-[200px]">
                  <Label>Company Name *</Label>
                  <Input placeholder="e.g. OpenAI" value={company} onChange={e => setCompany(e.target.value)} required />
                </div>
                <div className="space-y-1.5 flex-1 min-w-[200px]">
                  <Label>Domain (optional)</Label>
                  <Input placeholder="e.g. openai.com" value={domain} onChange={e => setDomain(e.target.value)} />
                </div>
                <div className="space-y-1.5 w-32">
                  <Label>Max Results</Label>
                  <Input type="number" min={1} max={50} value={maxResults} onChange={e => setMaxResults(e.target.value)} />
                </div>
                <Button type="submit" disabled={isSearching} className="gap-2">
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Find
                </Button>
              </form>
            </CardContent>
          </Card>

          {searchResult && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <div className="flex flex-col">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" /> {searchResult.company_name}
                  </CardTitle>
                </div>
                <div className="flex gap-4 items-center">
                  <span className="text-sm text-muted-foreground">{searchResult.total_found} contacts</span>
                  <Button variant="outline" size="sm" onClick={selectAll}>
                    Select All with Emails
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {searchResult.contacts.length === 0 ? (
                  <p className="text-muted-foreground py-8 text-center">No HR contacts found.</p>
                ) : (
                  <div className="divide-y border-t">
                    {searchResult.contacts.map((c, i) => {
                      const hasEmail = !!c.email
                      const isSelected = hasEmail && selectedEmails.has(c.email!)
                      return (
                        <div key={i} className={`flex items-center gap-4 py-3 ${!hasEmail && 'opacity-60'}`}>
                          <Checkbox 
                            id={`contact-${i}`} 
                            disabled={!hasEmail}
                            checked={isSelected}
                            onCheckedChange={() => hasEmail && toggleSelect(c.email!)}
                          />
                          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                            <div>
                              <Label htmlFor={`contact-${i}`} className="font-semibold cursor-pointer">
                                {c.name || "Unknown"}
                              </Label>
                              <p className="text-xs text-muted-foreground">{c.title || 'No Title'}</p>
                            </div>
                            <div className="text-sm font-mono text-muted-foreground">
                              {c.email || "No email available"}
                            </div>
                            <div className="flex items-center gap-2 justify-end">
                              <Badge variant="secondary" className="text-[10px] uppercase">
                                {c.source} {c.confidence && `${c.confidence}%`}
                              </Badge>
                              {c.linkedin_url && (
                                <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
                                  <Linkedin className="h-4 w-4" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end pt-4">
            <Button 
              size="lg" 
              onClick={() => setActiveTab("generate")}
              disabled={selectedEmails.size === 0}
            >
              Continue with {selectedEmails.size} Selected
            </Button>
          </div>
        </TabsContent>

        {/* --- TAB 2: CONFIGURE GENERATION --- */}
        <TabsContent value="generate" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Sender Profile & Settings</CardTitle>
              <CardDescription>Tell the AI about yourself so it can craft personalized emails.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleGenerate} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Your Full Name</Label>
                    <Input value={senderName} onChange={e => setSenderName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Your Current Title</Label>
                    <Input value={senderTitle} onChange={e => setSenderTitle(e.target.value)} placeholder="e.g. Backend Engineer" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Experience Summary (Elevator Pitch)</Label>
                    <Textarea 
                      value={senderExperience} 
                      onChange={e => setSenderExperience(e.target.value)} 
                      placeholder="e.g. 5+ years building scalable Python backends. Recently optimized DB queries saving 40% cloud costs."
                      className="h-20"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Email Type</Label>
                    <Select value={emailType} onValueChange={(v) => setEmailType(v || "cold_intro")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cold_intro">Direct Intro / Pitch</SelectItem>
                        <SelectItem value="referral_request">Ask for Referral / Connection</SelectItem>
                        <SelectItem value="informational_interview">Informational Chat</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Tone</Label>
                    <Select value={tone} onValueChange={(v) => setTone(v || "professional")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professional">Professional & Direct</SelectItem>
                        <SelectItem value="friendly">Friendly & Casual</SelectItem>
                        <SelectItem value="enthusiastic">Enthusiastic & Passionate</SelectItem>
                        <SelectItem value="bold">Bold & Confident</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-6 border-t">
                  <span className="text-sm text-muted-foreground">{selectedEmails.size} recipients queued</span>
                  <Button type="submit" disabled={isGenerating || selectedEmails.size === 0} className="gap-2">
                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {isGenerating ? "Writing Emails..." : "Generate AI Emails"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- TAB 3: REVIEW & SEND --- */}
        <TabsContent value="review" className="space-y-6 pt-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Review Generated Emails</h2>
            <Button 
              size="lg" 
              onClick={handleSendEmails} 
              disabled={isSending || generatedEmails.length === 0}
              variant="default"
              className="gap-2 bg-[var(--accent)] text-[var(--white)] font-medium text-[13px] px-[18px] py-[9px] rounded-[7px] transition-opacity duration-200 hover:opacity-80"
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send {generatedEmails.length} Emails via Gmail
            </Button>
          </div>

          {!gmailAddress && (
            <div className="p-[28px] bg-[var(--bg-raised)] border border-[var(--border)] rounded-[12px] text-sm text-[var(--text-2)] flex items-center gap-3">
              <Shield className="h-5 w-5 text-[var(--text-3)]" />
              <div className="flex-1">
                <strong>Attention:</strong> You need to connect your Gmail account before you can send these emails.
              </div>
              <Button size="sm" variant="outline" onClick={handleConnectGmail}>Connect Now</Button>
            </div>
          )}

          {generatedEmails.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-12 flex flex-col items-center justify-center text-muted-foreground">
                <Mail className="h-8 w-8 mb-4 opacity-50" />
                <p>No emails generated yet.</p>
                <Button variant="link" onClick={() => setActiveTab("generate")}>Go back and generate</Button>
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            {generatedEmails.map((emailResult, i) => (
              <Card key={i} className="overflow-hidden">
                <div className="bg-muted px-4 py-2 border-b flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{emailResult.recipient_name}</span>
                    <span className="text-muted-foreground font-mono text-xs">&lt;{emailResult.recipient_email}&gt;</span>
                  </div>
                  {emailResult.status === "success" ? (
                    <Badge variant="outline" className="text-xs bg-background">Ready to send</Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs">Generation Failed</Badge>
                  )}
                </div>
                <CardContent className="p-0">
                  {emailResult.status === "success" ? (
                    <div className="p-0">
                      <div className="border-b px-4 py-3 bg-muted/30">
                        <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider mr-2">Subject:</span>
                        <span className="font-medium">{emailResult.email.subject_line}</span>
                      </div>
                      <div 
                        className="px-4 py-4 text-sm prose dark:prose-invert max-w-none"
                        dangerouslySetInnerHTML={{__html: emailResult.email.body_html}}
                      />
                      {emailResult.email.personalization_notes?.length > 0 && (
                        <div className="bg-[var(--bg-overlay)] px-4 py-3 border-t border-[var(--border)] text-xs text-[var(--text-3)]">
                          <strong className="block mb-1 text-[var(--text-2)]">AI Note:</strong>
                          <ul className="list-disc pl-4 space-y-0.5">
                            {emailResult.email.personalization_notes.map((note, j) => (
                              <li key={j}>{note}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 text-sm text-destructive">
                      Error generating email for this contact.
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

        </TabsContent>
      </Tabs>
    </div>
  )
}

export default function OutreachPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center p-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
      <OutreachContent />
    </Suspense>
  )
}
