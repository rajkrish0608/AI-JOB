"use client"

import { useMemo } from "react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from "recharts"
import { Briefcase, Send, Users, Handshake, Target } from "lucide-react"

export default function StatsPanel({ applications }: { applications: any[] }) {
  const stats = useMemo(() => {
    const total = applications.length
    const applied = applications.filter(a => a.status === 'applied').length
    const interviewing = applications.filter(a => a.status === 'interviewing').length
    const offers = applications.filter(a => a.status === 'offer').length
    const rejected = applications.filter(a => a.status === 'rejected').length
    const saved = applications.filter(a => a.status === 'saved').length

    // Interview rate: (interviews + offers) / (total - saved)
    const activeApps = total - saved
    const interviewRate = activeApps > 0 ? Math.round(((interviewing + offers + rejected) / activeApps) * 100) : 0 // roughly, any response

    return { total, applied, interviewing, offers, saved, interviewRate, activeApps }
  }, [applications])

  // Aggregate applications by date for the chart (last 14 days)
  const chartData = useMemo(() => {
    const data: Record<string, number> = {}
    const today = new Date()
    today.setHours(0,0,0,0)

    for (let i = 13; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      data[dateStr] = 0
    }

    applications.forEach(app => {
      const d = new Date(app.applied_at)
      d.setHours(0,0,0,0)
      if (d.getTime() >= today.getTime() - (13 * 24 * 60 * 60 * 1000)) {
        const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        if (data[dateStr] !== undefined) {
          data[dateStr]++
        }
      }
    })

    return Object.entries(data).map(([date, count]) => ({ date, count }))
  }, [applications])

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {/* KPI Cards */}
      <div className="md:col-span-1 space-y-4">
        <div className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-[12px] p-5">
          <div className="flex items-center gap-3 text-[var(--text-3)] mb-2">
            <Briefcase className="w-5 h-5 text-[var(--accent)]" />
            <h3 className="text-[13px] font-medium uppercase tracking-wider">Total Applications</h3>
          </div>
          <div className="text-3xl font-bold text-[var(--text-1)]">{stats.total}</div>
          <p className="text-[12px] text-[var(--text-2)] mt-1">{stats.activeApps} active processes</p>
        </div>

        <div className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-[12px] p-5">
          <div className="flex items-center gap-3 text-[var(--text-3)] mb-2">
            <Users className="w-5 h-5 text-yellow-500" />
            <h3 className="text-[13px] font-medium uppercase tracking-wider">Interviews</h3>
          </div>
          <div className="text-3xl font-bold text-[var(--text-1)]">{stats.interviewing}</div>
          <p className="text-[12px] text-[var(--text-2)] mt-1">{stats.offers} offers received</p>
        </div>
      </div>

      {/* Activity Chart */}
      <div className="md:col-span-3 bg-[var(--bg-raised)] border border-[var(--border)] rounded-[12px] p-5 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3 text-[var(--text-3)]">
            <Target className="w-5 h-5 text-blue-500" />
            <h3 className="text-[13px] font-medium uppercase tracking-wider">Application Activity (14 Days)</h3>
          </div>
        </div>

        <div className="flex-1 min-h-[160px] w-full mt-2">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
              <XAxis 
                dataKey="date" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 11, fill: 'var(--text-3)' }} 
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 11, fill: 'var(--text-3)' }} 
                allowDecimals={false}
              />
              <Tooltip 
                cursor={{ fill: 'var(--bg-overlay)' }}
                contentStyle={{ 
                  backgroundColor: 'var(--bg-raised)', 
                  borderColor: 'var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text-1)',
                  fontSize: '12px'
                }} 
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.count > 0 ? 'var(--accent)' : 'var(--bg-overlay)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
