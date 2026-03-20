"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, Building, ExternalLink, MoreVertical, Trash, Briefcase, Users } from "lucide-react"
import { AddCompanyDialog } from "./add-company-dialog"
import { ContactsDialog } from "./contacts-dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { removeDreamCompany, updateDreamCompanyStatus, DreamCompanyStatus } from "./actions"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"

export function CompaniesList({ initialCompanies }: { initialCompanies: any[] }) {
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [companies, setCompanies] = useState(initialCompanies)
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [contactsCompany, setContactsCompany] = useState<any | null>(null)

  const handleRemove = async (id: string) => {
    try {
      setIsLoading(id)
      await removeDreamCompany(id)
      setCompanies(companies.filter(c => c.id !== id))
      toast.success("Company removed from watchlist")
    } catch (error) {
      toast.error("Failed to remove company")
    } finally {
      setIsLoading(null)
    }
  }

  const handleStatusChange = async (id: string, status: DreamCompanyStatus) => {
    try {
      setIsLoading(id)
      await updateDreamCompanyStatus(id, status)
      setCompanies(companies.map(c => c.id === id ? { ...c, status } : c))
      toast.success(`Status updated to ${status}`)
    } catch (error) {
      toast.error("Failed to update status")
    } finally {
      setIsLoading(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'active': return <Badge variant="outline" className="border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10 font-medium">Tracking</Badge>
      case 'applied': return <Badge variant="outline" className="border-[var(--text-3)] text-[var(--text-2)] bg-[var(--bg-overlay)] font-medium">Applied</Badge>
      case 'waiting': return <Badge variant="outline" className="border-yellow-500/50 text-yellow-500 bg-yellow-500/10 font-medium">Interviewing</Badge>
      case 'paused': return <Badge variant="outline" className="opacity-50 border-[var(--border)] font-medium text-[var(--text-3)]">Paused</Badge>
      default: return <Badge variant="outline" className="border-[var(--border)] text-[var(--text-2)] font-medium">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Your Watchlist ({companies.length})</h2>
        <Button 
          onClick={() => setIsAddOpen(true)}
          className="gap-2 bg-[var(--accent)] text-[var(--white)] font-medium text-[13px] px-[18px] py-[9px] rounded-[7px] transition-opacity duration-200 hover:opacity-80 border-0"
        >
          <Plus className="h-4 w-4" /> Add Company
        </Button>
      </div>

      {companies.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-[var(--bg-raised)] border border-[var(--border)] rounded-[12px] text-center">
          <Building className="h-12 w-12 text-[var(--text-3)] mb-4" />
          <h3 className="text-lg font-medium text-[var(--text-1)] mb-2 tracking-tight">No companies tracked</h3>
          <p className="text-[var(--text-2)] text-sm max-w-sm mb-6 leading-relaxed">
            Start tracking companies you want to work for. We'll help you monitor jobs and find key contacts.
          </p>
          <Button 
            onClick={() => setIsAddOpen(true)}
            className="bg-[var(--accent)] text-[var(--white)] hover:opacity-80 transition-opacity border-0 rounded-[7px] font-medium"
          >
            Track First Company
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((company) => (
            <Card key={company.id} className="bg-[var(--bg-raised)] border border-[var(--border)] overflow-hidden transition-all duration-200 rounded-[12px] shadow-none hover:border-[var(--border-hover)]">
              <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0 p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[8px] bg-[var(--bg-overlay)] flex items-center justify-center border border-[var(--border)] flex-shrink-0">
                    {company.company_logo_url ? (
                        <img src={company.company_logo_url} className="w-6 h-6 object-contain rounded" alt="logo" />
                    ) : (
                        <Building className="h-4 w-4 text-[var(--text-3)]" />
                    )}
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold tracking-tight text-[var(--text-1)] tracking-tight">{company.company_name}</CardTitle>
                    {company.industry && (
                      <p className="text-xs text-[var(--text-3)] mt-0.5">{company.industry}</p>
                    )}
                  </div>
                </div>
                
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 p-0 text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-overlay)] rounded-[6px] outline-none">
                    <MoreVertical className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[160px] bg-[var(--bg-raised)] border-[var(--border)] text-[var(--text-2)]">
                    <DropdownMenuItem className="focus:bg-[var(--bg-overlay)] focus:text-[var(--text-1)] cursor-pointer" onClick={() => handleStatusChange(company.id, 'active')}>
                      Set Active
                    </DropdownMenuItem>
                    <DropdownMenuItem className="focus:bg-[var(--bg-overlay)] focus:text-[var(--text-1)] cursor-pointer" onClick={() => handleStatusChange(company.id, 'applied')}>
                      Mark Applied
                    </DropdownMenuItem>
                    <DropdownMenuItem className="focus:bg-[var(--bg-overlay)] focus:text-[var(--text-1)] cursor-pointer" onClick={() => handleStatusChange(company.id, 'paused')}>
                      Pause Tracking
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="text-destructive focus:bg-destructive/10 cursor-pointer" 
                      onClick={() => handleRemove(company.id)}
                      disabled={isLoading === company.id}
                    >
                      <Trash className="h-4 w-4 mr-2" /> Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="flex justify-between items-center mb-4">
                  {getStatusBadge(company.status)}
                  {company.company_domain && (
                    <a 
                      href={company.company_domain.startsWith('http') ? company.company_domain : `https://${company.company_domain}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--accent)] hover:opacity-80 flex items-center gap-1.5 transition-opacity"
                    >
                      {company.company_domain.replace(/^https?:\/\//, '')} <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                
                {company.company_description && (
                  <p className="text-[13px] text-[var(--text-2)] line-clamp-2 mb-4 leading-relaxed">
                    {company.company_description}
                  </p>
                )}
                
                <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-[var(--border)]">
                   <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-3)]">Open Roles</span>
                      <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-1)] tabular-nums">
                        <Briefcase className="h-[14px] w-[14px] text-[var(--text-3)]" />
                        {company.roles_found_count || 0}
                      </div>
                   </div>
                   <button
                     onClick={() => setContactsCompany(company)}
                     className="flex flex-col gap-1.5 text-left cursor-pointer hover:opacity-70 transition-opacity"
                   >
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-3)]">Contacts</span>
                      <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] tabular-nums">
                        <Users className="h-[14px] w-[14px]" />
                        {company.contacts_found_count || 0} &rarr;
                      </div>
                   </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddCompanyDialog open={isAddOpen} onOpenChange={setIsAddOpen} />
      {contactsCompany && (
        <ContactsDialog
          open={!!contactsCompany}
          onOpenChange={(open) => !open && setContactsCompany(null)}
          company={contactsCompany}
        />
      )}
    </div>
  )
}
