"use client"

import { useState, useEffect, useRef } from "react"
import { Bell, CheckCircle, Briefcase, Building2, X } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { createClient } from "@/utils/supabase/client"
import { toast } from "sonner"

const STATUS_LABELS: Record<string, string> = {
  saved:        "Saved to tracker",
  applied:      "Application submitted",
  reviewing:    "Application under review",
  interviewing: "Interview stage 🎉",
  offer:        "Offer received! 🥳",
  rejected:     "Not selected",
  withdrawn:    "Withdrawn",
  failed:       "Application failed",
}

const STATUS_ICONS: Record<string, string> = {
  saved:        "🔖",
  applied:      "📨",
  reviewing:    "🔍",
  interviewing: "🤝",
  offer:        "🎉",
  rejected:     "❌",
  withdrawn:    "↩️",
  failed:       "⚠️",
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<any[]>([])
  const [unread, setUnread] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  // Fetch recent application status changes (last 7 days)
  const fetchNotifications = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from("applications")
      .select("id, status, status_updated_at, job:job_id(title, company)")
      .eq("user_id", user.id)
      .gte("status_updated_at", since)
      .not("status", "eq", "saved")
      .order("status_updated_at", { ascending: false })
      .limit(20)

    setNotifications(data || [])
    const lastReadTime = localStorage.getItem("notifications_read_at")
    const unreadCount = (data || []).filter(n => 
      !lastReadTime || new Date(n.status_updated_at) > new Date(lastReadTime)
    ).length
    setUnread(unreadCount)
  }

  useEffect(() => {
    fetchNotifications()
    // Refresh every 2 minutes
    const interval = setInterval(fetchNotifications, 2 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleOpen = () => {
    setIsOpen(prev => !prev)
    if (unread > 0) {
      localStorage.setItem("notifications_read_at", new Date().toISOString())
      setUnread(0)
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleOpen}
        className="relative flex items-center justify-center w-9 h-9 rounded-[8px] hover:bg-[var(--bg-overlay)] text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-[var(--bg-raised)]" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-11 z-50 w-[320px] bg-[var(--bg-raised)] border border-[var(--border)] rounded-[12px] shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <h3 className="text-[13px] font-semibold text-[var(--text-1)]">Notifications</h3>
            <button onClick={() => setIsOpen(false)} className="text-[var(--text-3)] hover:text-[var(--text-1)]">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                <Bell className="h-8 w-8 text-[var(--text-3)] mb-2" />
                <p className="text-[13px] text-[var(--text-2)]">No recent activity</p>
                <p className="text-[11px] text-[var(--text-3)] mt-0.5">Status updates will appear here</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div 
                  key={n.id}
                  className="flex items-start gap-3 px-4 py-3 border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-overlay)]/30 transition-colors"
                >
                  <span className="mt-0.5 text-base flex-shrink-0">{STATUS_ICONS[n.status] || "📋"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-[var(--text-1)] truncate">
                      {n.job?.company || "Unknown Company"}
                    </p>
                    <p className="text-[11px] text-[var(--text-2)] truncate">{n.job?.title || "Role"}</p>
                    <p className="text-[11px] text-[var(--accent)] mt-0.5">{STATUS_LABELS[n.status] || n.status}</p>
                  </div>
                  <span className="text-[10px] text-[var(--text-3)] flex-shrink-0 mt-0.5">
                    {formatDistanceToNow(new Date(n.status_updated_at), { addSuffix: true })}
                  </span>
                </div>
              ))
            )}
          </div>
          
          {notifications.length > 0 && (
            <div className="px-4 py-2.5 border-t border-[var(--border)] text-center">
              <a href="/dashboard/tracker" className="text-[11px] text-[var(--accent)] hover:underline font-medium">
                View all in Job Tracker →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
