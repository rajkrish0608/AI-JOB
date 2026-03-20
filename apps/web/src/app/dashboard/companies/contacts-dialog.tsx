"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { addCompanyContact, getCompanyContacts } from "./contact-actions"
import { ContactRow } from "./contact-row"
import { Loader2, Plus, Users } from "lucide-react"
import { toast } from "sonner"

type ContactRole = 'hr' | 'recruiter' | 'talent_acquisition' | 'hiring_manager' | 'engineering_manager' | 'employee' | 'other'

const roleOptions: { value: ContactRole; label: string }[] = [
  { value: 'hr',                  label: 'HR' },
  { value: 'recruiter',           label: 'Recruiter' },
  { value: 'talent_acquisition',  label: 'Talent Acquisition' },
  { value: 'hiring_manager',      label: 'Hiring Manager' },
  { value: 'engineering_manager', label: 'Engineering Manager' },
  { value: 'employee',            label: 'Employee' },
  { value: 'other',               label: 'Other' },
]

export function ContactsDialog({
  open,
  onOpenChange,
  company,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  company: { id: string; company_name: string; company_domain?: string | null }
}) {
  const [contacts, setContacts] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [selectedRole, setSelectedRole] = useState<string>("")

  useEffect(() => {
    if (!open) return
    setIsLoading(true)
    getCompanyContacts(company.id)
      .then(setContacts)
      .catch(() => toast.error("Failed to load contacts"))
      .finally(() => setIsLoading(false))
  }, [open, company.id])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsAdding(true)

    const formData = new FormData(e.currentTarget)
    formData.append("dream_company_id", company.id)
    formData.append("company_name", company.company_name)
    if (company.company_domain) formData.append("company_domain", company.company_domain)
    if (selectedRole) formData.set("contact_role", selectedRole)

    try {
      const result = await addCompanyContact(formData)
      if (result.data) {
        setContacts(prev => [result.data, ...prev])
        toast.success("Contact added successfully")
        setShowForm(false)
        setSelectedRole("")
        ;(e.target as HTMLFormElement).reset()
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to add contact")
    } finally {
      setIsAdding(false)
    }
  }

  const handleRemove = (id: string) => {
    setContacts(prev => prev.filter(c => c.id !== id))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] bg-[var(--bg-raised)] border border-[var(--border)] text-[var(--text-1)] p-6 rounded-[16px] shadow-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-lg font-medium tracking-tight">{company.company_name} — Contacts</DialogTitle>
          <DialogDescription className="text-[13px] text-[var(--text-2)] mt-1">
            Manage HR, Recruiter, and Hiring Manager contacts for cold outreach.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--text-3)]" />
            </div>
          ) : contacts.length === 0 && !showForm ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-12 h-12 rounded-full bg-[var(--bg-overlay)] flex items-center justify-center mb-3">
                <Users className="h-5 w-5 text-[var(--text-3)]" />
              </div>
              <p className="text-[13px] font-medium text-[var(--text-1)] mb-1">No contacts yet</p>
              <p className="text-[12px] text-[var(--text-3)] mb-4">Add recruiters and hiring managers to target.</p>
            </div>
          ) : (
            <div>
              {contacts.map(contact => (
                <ContactRow key={contact.id} contact={contact} onRemove={handleRemove} />
              ))}
            </div>
          )}

          {showForm && (
            <form onSubmit={handleSubmit} className="mt-4 pt-4 border-t border-[var(--border)] space-y-4">
              <p className="text-[12px] font-semibold text-[var(--text-3)] uppercase tracking-wider">Add New Contact</p>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="contact_name" className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider">Name <span className="text-destructive">*</span></Label>
                  <Input id="contact_name" name="contact_name" placeholder="Jane Doe" required className="h-9 text-[13px] bg-[var(--bg-base)] border-[var(--border)] rounded-[8px] focus-visible:ring-1 focus-visible:ring-white/20" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="contact_title" className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider">Title</Label>
                  <Input id="contact_title" name="contact_title" placeholder="Tech Recruiter" className="h-9 text-[13px] bg-[var(--bg-base)] border-[var(--border)] rounded-[8px] focus-visible:ring-1 focus-visible:ring-white/20" />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider">Role Category</Label>
                <Select onValueChange={(val) => setSelectedRole(String(val))}>
                  <SelectTrigger className="h-9 text-[13px] bg-[var(--bg-base)] border-[var(--border)] rounded-[8px]">
                    <SelectValue placeholder="Select role type..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[var(--bg-raised)] border-[var(--border)] text-[var(--text-1)]">
                    {roleOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value} className="text-[13px] focus:bg-[var(--bg-overlay)]">{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="contact_email" className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider">Email</Label>
                  <Input id="contact_email" name="contact_email" type="email" placeholder="jane@company.com" className="h-9 text-[13px] bg-[var(--bg-base)] border-[var(--border)] rounded-[8px] focus-visible:ring-1 focus-visible:ring-white/20" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="contact_linkedin_url" className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider">LinkedIn URL</Label>
                  <Input id="contact_linkedin_url" name="contact_linkedin_url" placeholder="linkedin.com/in/..." className="h-9 text-[13px] bg-[var(--bg-base)] border-[var(--border)] rounded-[8px] focus-visible:ring-1 focus-visible:ring-white/20" />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1 h-9 bg-transparent border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--bg-overlay)] rounded-[8px] text-[13px]">
                  Cancel
                </Button>
                <Button type="submit" disabled={isAdding} className="flex-1 h-9 bg-[var(--accent)] text-[var(--white)] hover:opacity-80 transition-opacity border-0 rounded-[8px] text-[13px] font-medium">
                  {isAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save Contact"}
                </Button>
              </div>
            </form>
          )}
        </div>

        {!showForm && (
          <div className="flex-shrink-0 pt-4 border-t border-[var(--border)] mt-4">
            <Button
              onClick={() => setShowForm(true)}
              className="w-full h-9 gap-2 bg-[var(--bg-overlay)] text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--bg-overlay)]/80 border border-[var(--border)] rounded-[8px] text-[13px] font-medium"
            >
              <Plus className="h-3.5 w-3.5" /> Add Contact
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
