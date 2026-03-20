"use client"

import { useState } from "react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { KanbanSquare, Table2, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

import KanbanBoard from "./kanban-board"
import TableView from "./table-view"
import StatsPanel from "./stats-panel"

export default function TrackerClient({ initialApplications }: { initialApplications: any[] }) {
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban')
  const [applications, setApplications] = useState(initialApplications)

  const handleExportCSV = () => {
    if (applications.length === 0) {
      toast.error("No applications to export")
      return
    }

    // Define CSV headers
    const headers = [
      "Company",
      "Title",
      "Status",
      "Applied Via",
      "Applied At",
      "Location",
      "Work Style",
      "Platform",
      "Apply URL",
      "Fit Score",
      "Notes"
    ]

    // Map applications to rows
    const rows = applications.map(app => [
      app.job?.company || "",
      app.job?.title || "",
      app.status,
      app.applied_via || "",
      new Date(app.applied_at).toLocaleDateString(),
      app.job?.location || "",
      app.job?.work_style || "",
      app.job?.platform || "",
      app.job?.apply_url || "",
      app.fit_score || "",
      (app.notes || "").replace(/"/g, '""') // Escape quotes in notes
    ])

    // Build CSV string
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n")

    // Create download link
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", `job_applications_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    toast.success("Applications exported to CSV")
  }

  // Pass setApplications down so components can update local state (e.g. after DND)
  return (
    <div className="space-y-6">
      <StatsPanel applications={applications} />

      <div className="flex items-center justify-between mt-6 mb-4">
        <h2 className="text-sm font-semibold text-[var(--text-2)] uppercase tracking-wider">Application Pipeline</h2>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="h-9 px-3 text-[12px] font-medium bg-[var(--bg-raised)] border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--bg-overlay)] rounded-[8px]"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export CSV
          </Button>

          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'kanban' | 'table')} className="w-[160px]">
            <TabsList className="grid w-full grid-cols-2 bg-[var(--bg-raised)] border border-[var(--border)] rounded-[8px] h-9">
              <TabsTrigger 
                value="kanban" 
                className="text-[12px] font-medium data-[state=active]:bg-[var(--bg-overlay)] data-[state=active]:text-[var(--text-1)] text-[var(--text-3)] rounded-[6px]"
              >
                <KanbanSquare className="h-3.5 w-3.5 mr-1.5" />
                Board
              </TabsTrigger>
              <TabsTrigger 
                value="table" 
                className="text-[12px] font-medium data-[state=active]:bg-[var(--bg-overlay)] data-[state=active]:text-[var(--text-1)] text-[var(--text-3)] rounded-[6px]"
              >
                <Table2 className="h-3.5 w-3.5 mr-1.5" />
                Table
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {viewMode === 'kanban' ? (
        <KanbanBoard applications={applications} setApplications={setApplications} />
      ) : (
        <TableView applications={applications} setApplications={setApplications} />
      )}
    </div>
  )
}
