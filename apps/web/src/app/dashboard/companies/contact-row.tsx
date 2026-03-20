"use client"

import { useState } from "react"
import { Trash, Send, Linkedin, Mail, MoreVertical, UserCircle } from "lucide-react"
import { removeContact, updateContactOutreachStatus, ContactOutreachStatus } from "./contact-actions"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import Link from "next/link"

const outreachStatusLabels: Record<string, { label: string; style: string }> = {
  not_contacted: { label: "Not Contacted", style: "border-[var(--border)] text-[var(--text-3)]" },
  email_sent:    { label: "Email Sent",    style: "border-[var(--accent)]/50 text-[var(--accent)] bg-[var(--accent)]/10" },
  email_opened:  { label: "Opened",        style: "border-blue-400/50 text-blue-400 bg-blue-400/10" },
  replied:       { label: "Replied",       style: "border-green-400/50 text-green-400 bg-green-400/10" },
  connected:     { label: "Connected",     style: "border-green-400/50 text-green-400 bg-green-400/10" },
  no_response:   { label: "No Response",   style: "border-yellow-500/40 text-yellow-500 bg-yellow-500/10" },
}

export function ContactRow({
  contact,
  onRemove,
}: {
  contact: any
  onRemove: (id: string) => void
}) {
  const [isLoading, setIsLoading] = useState(false)
  const status = outreachStatusLabels[contact.outreach_status] || outreachStatusLabels.not_contacted

  const handleStatusChange = async (newStatus: ContactOutreachStatus) => {
    try {
      setIsLoading(true)
      await updateContactOutreachStatus(contact.id, newStatus)
      toast.success(`Status updated to ${outreachStatusLabels[newStatus]?.label}`)
    } catch {
      toast.error("Failed to update status")
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemove = async () => {
    try {
      setIsLoading(true)
      await removeContact(contact.id)
      onRemove(contact.id)
      toast.success("Contact removed")
    } catch {
      toast.error("Failed to remove contact")
    } finally {
      setIsLoading(false)
    }
  }

  const outreachUrl = `/dashboard/outreach?contact_name=${encodeURIComponent(contact.contact_name)}&contact_email=${encodeURIComponent(contact.contact_email || "")}&company=${encodeURIComponent(contact.company_name || "")}`

  return (
    <div className="flex items-start justify-between gap-3 py-3 border-b border-[var(--border)] last:border-b-0 group">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-8 h-8 rounded-full bg-[var(--bg-overlay)] border border-[var(--border)] flex items-center justify-center flex-shrink-0 mt-0.5">
          <UserCircle className="h-4 w-4 text-[var(--text-3)]" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[var(--text-1)] truncate">{contact.contact_name}</p>
          {contact.contact_title && (
            <p className="text-[12px] text-[var(--text-3)] truncate">{contact.contact_title}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <Badge variant="outline" className={`text-[10px] font-medium px-1.5 py-0 ${status.style}`}>
              {status.label}
            </Badge>
            {contact.contact_email && (
              <a href={`mailto:${contact.contact_email}`} className="text-[11px] text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors flex items-center gap-1">
                <Mail className="h-3 w-3" />{contact.contact_email}
              </a>
            )}
            {contact.contact_linkedin_url && (
              <a href={contact.contact_linkedin_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[var(--accent)] hover:opacity-75 transition-opacity flex items-center gap-1">
                <Linkedin className="h-3 w-3" />LinkedIn
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {(contact.contact_email || contact.company_name) && (
          <Link
            href={outreachUrl}
            className="h-7 px-2 rounded-[6px] text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors flex items-center gap-1"
          >
            <Send className="h-3 w-3" /> Email
          </Link>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger className="h-7 w-7 inline-flex items-center justify-center rounded-[6px] text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-overlay)] transition-colors outline-none opacity-0 group-hover:opacity-100">
            <MoreVertical className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[160px] bg-[var(--bg-raised)] border-[var(--border)] text-[var(--text-2)]">
            <DropdownMenuItem className="text-[12px] focus:bg-[var(--bg-overlay)] focus:text-[var(--text-1)] cursor-pointer" onClick={() => handleStatusChange('email_sent')}>Mark Email Sent</DropdownMenuItem>
            <DropdownMenuItem className="text-[12px] focus:bg-[var(--bg-overlay)] focus:text-[var(--text-1)] cursor-pointer" onClick={() => handleStatusChange('replied')}>Mark Replied</DropdownMenuItem>
            <DropdownMenuItem className="text-[12px] focus:bg-[var(--bg-overlay)] focus:text-[var(--text-1)] cursor-pointer" onClick={() => handleStatusChange('no_response')}>Mark No Response</DropdownMenuItem>
            <DropdownMenuItem className="text-[12px] text-destructive focus:bg-destructive/10 cursor-pointer" onClick={handleRemove} disabled={isLoading}>
              <Trash className="h-3 w-3 mr-1.5" /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
