"use client"

import { formatDistanceToNow } from "date-fns"
import { Building2, MapPin, Briefcase, ExternalLink, Trash2 } from "lucide-react"
import { ApplicationStatus, deleteApplication } from "./actions"
import { toast } from "sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  saved: 'bg-[var(--text-3)]/20 text-[var(--text-1)]',
  applied: 'bg-blue-500/20 text-blue-400',
  reviewing: 'bg-purple-500/20 text-purple-400',
  interviewing: 'bg-yellow-500/20 text-yellow-400',
  offer: 'bg-green-500/20 text-green-400',
  rejected: 'bg-red-500/20 text-red-500',
  withdrawn: 'bg-[var(--text-3)]/20 text-[var(--text-2)]',
  failed: 'bg-red-500/20 text-red-500',
}

export default function TableView({ 
  applications,
  setApplications
}: { 
  applications: any[]
  setApplications: (data: any[]) => void
}) {

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this application record?")) return
    
    const prev = [...applications]
    setApplications(applications.filter(a => a.id !== id))
    
    try {
      await deleteApplication(id)
      toast.success("Application deleted")
    } catch (err: any) {
      toast.error("Failed to delete application")
      setApplications(prev)
    }
  }

  if (applications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center border border-[var(--border)] border-dashed rounded-[12px] bg-[var(--bg-raised)]">
        <Briefcase className="w-10 h-10 text-[var(--text-3)] mb-3" />
        <h3 className="text-[15px] font-medium text-[var(--text-1)]">No applications yet</h3>
        <p className="text-[13px] text-[var(--text-2)] mt-1 max-w-[300px]">
          Start tracking your job search manually or let the Auto Apply engine work for you.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg-raised)] overflow-hidden">
      <Table>
        <TableHeader className="bg-[var(--bg-overlay)]">
          <TableRow className="border-[var(--border)] hover:bg-transparent">
            <TableHead className="text-[12px] font-semibold text-[var(--text-3)] uppercase tracking-wider h-10">Company & Role</TableHead>
            <TableHead className="text-[12px] font-semibold text-[var(--text-3)] uppercase tracking-wider h-10">Status</TableHead>
            <TableHead className="text-[12px] font-semibold text-[var(--text-3)] uppercase tracking-wider h-10">Source</TableHead>
            <TableHead className="text-[12px] font-semibold text-[var(--text-3)] uppercase tracking-wider h-10">Applied</TableHead>
            <TableHead className="text-[12px] font-semibold text-[var(--text-3)] uppercase tracking-wider h-10 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.map((app) => (
            <TableRow key={app.id} className="border-[var(--border)] hover:bg-[var(--bg-overlay)]/30 transition-colors">
              <TableCell className="py-3">
                <div className="flex items-center gap-3">
                  {app.job?.company_logo_url ? (
                    <img src={app.job.company_logo_url} alt="Logo" className="w-8 h-8 rounded-[6px] object-cover bg-white ring-1 ring-[var(--border)]" />
                  ) : (
                    <div className="w-8 h-8 rounded-[6px] bg-[var(--bg-overlay)] ring-1 ring-[var(--border)] flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-[var(--text-3)]" />
                    </div>
                  )}
                  <div>
                    <div className="font-medium text-[13px] text-[var(--text-1)]">{app.job?.title || 'Unknown Role'}</div>
                    <div className="text-[12px] text-[var(--text-2)] flex items-center gap-2 mt-0.5">
                      <span>{app.job?.company || 'Unknown Company'}</span>
                      {app.job?.location && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-[var(--text-3)]" />
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{app.job.location}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="py-3">
                <span className={`px-2.5 py-1 rounded-[6px] text-[11px] font-semibold uppercase tracking-wider ${STATUS_COLORS[app.status as ApplicationStatus] || STATUS_COLORS.saved}`}>
                  {app.status}
                </span>
              </TableCell>
              <TableCell className="py-3">
                <span className="text-[12px] font-medium text-[var(--text-2)] capitalize bg-[var(--bg-base)] px-2 py-1 rounded-[6px] border border-[var(--border)]">
                  {app.applied_via?.replace('_', ' ') || 'Manual'}
                </span>
              </TableCell>
              <TableCell className="py-3">
                <div className="text-[12px] text-[var(--text-1)]">
                  {new Date(app.applied_at).toLocaleDateString()}
                </div>
                <div className="text-[11px] text-[var(--text-3)]">
                  {formatDistanceToNow(new Date(app.applied_at), { addSuffix: true })}
                </div>
              </TableCell>
              <TableCell className="py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  {app.job?.apply_url && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-[var(--text-2)] hover:text-[var(--text-1)]" onClick={() => window.open(app.job.apply_url, "_blank")}>
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-[var(--text-3)] hover:text-red-400 hover:bg-red-500/10" onClick={() => handleDelete(app.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
