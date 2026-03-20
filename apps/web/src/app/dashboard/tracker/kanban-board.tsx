"use client"

import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd"
import { Building2, MapPin, Briefcase, IndianRupee, Clock } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { updateApplicationStatus, ApplicationStatus } from "./actions"
import { toast } from "sonner"
import { useState, useEffect } from "react"
import Image from "next/image"

/*
Available statuses from Supabase:
'saved' | 'applied' | 'reviewing' | 'interviewing' | 'offer' | 'rejected' | 'withdrawn' | 'failed'
*/

const COLUMNS: { id: ApplicationStatus; title: string, color: string }[] = [
  { id: 'saved', title: 'Saved / To Apply', color: 'bg-[var(--text-3)]/20 text-[var(--text-1)]' },
  { id: 'applied', title: 'Applied', color: 'bg-blue-500/20 text-blue-400' },
  { id: 'reviewing', title: 'Reviewing', color: 'bg-purple-500/20 text-purple-400' },
  { id: 'interviewing', title: 'Interviewing', color: 'bg-yellow-500/20 text-yellow-400' },
  { id: 'offer', title: 'Offer 🥳', color: 'bg-green-500/20 text-green-400' },
  { id: 'rejected', title: 'Rejected', color: 'bg-red-500/20 text-red-500' },
]

export default function KanbanBoard({ 
  applications, 
  setApplications 
}: { 
  applications: any[], 
  setApplications: (data: any[]) => void 
}) {
  const [mounted, setMounted] = useState(false)

  // React18 strict mode + DND hack: render DND context only on client
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const newStatus = destination.droppableId as ApplicationStatus
    const appId = draggableId

    // Optimistic UI Update
    const prevApplications = [...applications]
    const updatedApps = prevApplications.map(app => 
      app.id === appId ? { ...app, status: newStatus, status_updated_at: new Date().toISOString() } : app
    )
    setApplications(updatedApps)

    try {
      await updateApplicationStatus(appId, newStatus)
      toast.success(`Moved to ${COLUMNS.find(c => c.id === newStatus)?.title}`)
    } catch (err: any) {
      toast.error(err.message || "Failed to update status")
      setApplications(prevApplications) // revert
    }
  }

  // Group applications by status
  const grouped = COLUMNS.reduce((acc, col) => {
    acc[col.id] = applications.filter(a => a.status === col.id).sort((a, b) => 
      new Date(b.status_updated_at || b.created_at).getTime() - new Date(a.status_updated_at || a.created_at).getTime()
    )
    return acc
  }, {} as Record<ApplicationStatus, any[]>)

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-220px)] min-h-[500px] snap-x pt-2">
        {COLUMNS.map(column => (
          <div key={column.id} className="min-w-[320px] max-w-[320px] h-full flex flex-col bg-[var(--bg-raised)] border border-[var(--border)] rounded-[12px] snap-center">
            {/* Column Header */}
            <div className="p-4 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-overlay)] rounded-t-[12px]">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-[4px] text-[11px] font-semibold uppercase tracking-wider ${column.color}`}>
                  {column.title}
                </span>
                <span className="text-[12px] text-[var(--text-3)] font-medium bg-[var(--bg-base)] px-2 py-0.5 rounded-[12px]">
                  {grouped[column.id].length}
                </span>
              </div>
            </div>

            {/* Droppable Area */}
            <Droppable droppableId={column.id}>
              {(provided, snapshot) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className={`flex-1 overflow-y-auto p-3 space-y-3 transition-colors ${snapshot.isDraggingOver ? 'bg-[var(--bg-overlay)]/50' : ''}`}
                >
                  {grouped[column.id].map((app, index) => (
                    <Draggable key={app.id} draggableId={app.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={`
                            bg-[var(--bg-base)] border border-[var(--border)] rounded-[8px] p-4 group
                            ${snapshot.isDragging ? 'shadow-2xl border-[var(--accent)]/50 ring-1 ring-[var(--accent)]/50' : 'hover:border-[var(--border-hover)] hover:bg-[var(--bg-overlay)]/30'}
                            transition-all cursor-grab active:cursor-grabbing
                          `}
                          style={provided.draggableProps.style}
                        >
                          <div className="flex items-start gap-3">
                            {/* Logo */}
                            {app.job?.company_logo_url ? (
                              <img src={app.job.company_logo_url} alt={app.job?.company || "Company"} className="w-10 h-10 rounded-[6px] object-cover bg-white ring-1 ring-[var(--border)]" />
                            ) : (
                              <div className="w-10 h-10 rounded-[6px] bg-[var(--bg-overlay)] ring-1 ring-[var(--border)] flex items-center justify-center">
                                <Building2 className="w-5 h-5 text-[var(--text-3)]" />
                              </div>
                            )}

                            <div className="flex-1 min-w-0">
                              <h4 className="text-[14px] font-medium text-[var(--text-1)] truncate group-hover:text-[var(--accent)] transition-colors">
                                {app.job?.title || 'Unknown Role'}
                              </h4>
                              <p className="text-[13px] text-[var(--text-2)] truncate mt-0.5">
                                {app.job?.company || 'Unknown Company'}
                              </p>

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3 text-[11px] text-[var(--text-3)] font-medium">
                                {app.job?.location && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" /> {app.job.location}
                                  </span>
                                )}
                                {app.job?.work_style && (
                                  <span className="flex items-center gap-1 capitalize">
                                    <Briefcase className="w-3 h-3" /> {app.job.work_style.replace('_', ' ')}
                                  </span>
                                )}
                                {app.job?.salary_min && (
                                  <span className="flex items-center gap-1">
                                    <IndianRupee className="w-3 h-3" /> {app.job.salary_min/100000}L - {app.job.salary_max/100000}L
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text-3)]">
                            <span className="flex items-center gap-1 font-medium bg-[var(--bg-overlay)] px-2 py-0.5 rounded-[4px] capitalize">
                              {app.applied_via?.replace('_', ' ') || 'Manual'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDistanceToNow(new Date(app.status_updated_at || app.applied_at), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  {grouped[column.id].length === 0 && (
                    <div className="h-full min-h-[100px] flex items-center justify-center border-2 border-dashed border-[var(--border)] rounded-[8px] text-[12px] text-[var(--text-3)]">
                      Drop here
                    </div>
                  )}
                </div>
              )}
            </Droppable>
          </div>
        ))}
      </div>
    </DragDropContext>
  )
}
