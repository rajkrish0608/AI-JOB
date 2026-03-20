"use client"

import { useState } from "react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { KanbanSquare, Table2 } from "lucide-react"

import KanbanBoard from "./kanban-board"
import TableView from "./table-view"
import StatsPanel from "./stats-panel"

export default function TrackerClient({ initialApplications }: { initialApplications: any[] }) {
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban')
  const [applications, setApplications] = useState(initialApplications)

  // Pass setApplications down so components can update local state (e.g. after DND)
  return (
    <div className="space-y-6">
      <StatsPanel applications={applications} />

      <div className="flex items-center justify-between mt-6 mb-4">
        <h2 className="text-sm font-semibold text-[var(--text-2)] uppercase tracking-wider">Application Pipeline</h2>
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

      {viewMode === 'kanban' ? (
        <KanbanBoard applications={applications} setApplications={setApplications} />
      ) : (
        <TableView applications={applications} setApplications={setApplications} />
      )}
    </div>
  )
}
