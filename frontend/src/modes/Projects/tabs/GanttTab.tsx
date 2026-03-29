import { useRef, useState } from 'react'
import type { Project, Milestone } from '../../../stores/projectStore'

interface GanttRow {
  milestone: Milestone
  start: Date
  end: Date
  isOverdue: boolean
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function monthsBetween(start: Date, end: Date): Date[] {
  const months: Date[] = []
  const d = new Date(start.getFullYear(), start.getMonth(), 1)
  while (d <= end) {
    months.push(new Date(d))
    d.setMonth(d.getMonth() + 1)
  }
  return months
}

function formatMonth(d: Date): string {
  return d.toLocaleDateString([], { month: 'short', year: '2-digit' })
}

function barColor(row: GanttRow): string {
  if (row.milestone.done) return 'bg-green-500/70 border-green-400/50'
  if (row.isOverdue) return 'bg-red-500/70 border-red-400/50'
  const status = row.milestone.status || ''
  if (status.includes('progress')) return 'bg-blue-500/70 border-blue-400/50'
  return 'bg-white/20 border-white/15'
}

function dotColor(row: GanttRow): string {
  if (row.milestone.done) return 'bg-green-400'
  if (row.isOverdue) return 'bg-red-400'
  const status = row.milestone.status || ''
  if (status.includes('progress')) return 'bg-blue-400'
  return 'bg-white/30'
}

export default function GanttTab({ project: p }: { project: Project }) {
  const [tooltip, setTooltip] = useState<{ row: GanttRow; x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // ── Build rows ─────────────────────────────────────────────────────────────

  const projectStart = parseDate(p.start_date)
  const projectEnd = parseDate(p.target_date)

  const rows: GanttRow[] = []
  let prevEnd: Date | null = projectStart

  for (const m of p.milestones) {
    const due = parseDate(m.due)
    if (!due) continue  // skip milestones without due dates

    const start = parseDate(m.start) || prevEnd || addDays(due, -7)
    const end = due

    rows.push({
      milestone: m,
      start,
      end,
      isOverdue: !m.done && end < today,
    })
    prevEnd = end
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-white/25 gap-3">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <p className="text-[13px]">No milestones with due dates</p>
        <p className="text-[12px] text-white/18">Add <code className="bg-white/5 px-1 rounded">[due:: 2026-06-01]</code> to milestones to see the Gantt</p>
      </div>
    )
  }

  // ── Timeline range ─────────────────────────────────────────────────────────

  const rangeStart = (() => {
    const candidates = [projectStart, rows[0].start]
    const valid = candidates.filter(Boolean) as Date[]
    if (valid.length === 0) return addDays(rows[0].start, -14)
    return addDays(new Date(Math.min(...valid.map(d => d.getTime()))), -7)
  })()

  const rangeEnd = (() => {
    const candidates = [projectEnd, rows[rows.length - 1].end]
    const valid = candidates.filter(Boolean) as Date[]
    if (valid.length === 0) return addDays(rows[rows.length - 1].end, 14)
    return addDays(new Date(Math.max(...valid.map(d => d.getTime()))), 14)
  })()

  const totalMs = rangeEnd.getTime() - rangeStart.getTime()
  const pct = (d: Date) =>
    Math.max(0, Math.min(100, ((d.getTime() - rangeStart.getTime()) / totalMs) * 100))

  const todayPct = pct(today)
  const months = monthsBetween(rangeStart, rangeEnd)

  const LEFT_COL = 160  // px for label column

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="select-none">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-[11px] text-white/35">
        {[
          { color: 'bg-green-500/70', label: 'Done' },
          { color: 'bg-blue-500/70', label: 'In progress' },
          { color: 'bg-red-500/70', label: 'Overdue' },
          { color: 'bg-white/20', label: 'Pending' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-3 h-2.5 rounded-sm ${color}`} />
            {label}
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-2">
          <span className="w-px h-3 bg-amber-400/70" />
          Today
        </div>
      </div>

      {/* Gantt chart */}
      <div className="overflow-x-auto" ref={containerRef}>
        <div style={{ minWidth: 600 }}>

          {/* Month header */}
          <div className="flex mb-1" style={{ paddingLeft: LEFT_COL }}>
            <div className="relative flex-1 h-5">
              {months.map(m => {
                const left = pct(m)
                return (
                  <span
                    key={m.toISOString()}
                    className="absolute text-[10px] text-white/25 whitespace-nowrap"
                    style={{ left: `${left}%`, transform: 'translateX(-50%)' }}
                  >
                    {formatMonth(m)}
                  </span>
                )
              })}
            </div>
          </div>

          {/* Rows */}
          <div className="space-y-1.5">
            {rows.map((row) => {
              const barLeft = pct(row.start)
              const barRight = pct(row.end)
              const barWidth = barRight - barLeft

              return (
                <div key={row.milestone.index} className="flex items-center gap-0 group">
                  {/* Label */}
                  <div
                    className="shrink-0 text-right pr-3"
                    style={{ width: LEFT_COL }}
                  >
                    <span className={`text-[12px] truncate block ${row.milestone.done ? 'text-white/30 line-through' : 'text-white/65'}`}>
                      {row.milestone.title}
                    </span>
                    {row.milestone.owner && (
                      <span className="text-[10px] text-white/25 block">{row.milestone.owner}</span>
                    )}
                  </div>

                  {/* Bar track */}
                  <div className="relative flex-1 h-7">
                    {/* Grid lines */}
                    {months.map(m => (
                      <div
                        key={m.toISOString()}
                        className="absolute top-0 bottom-0 w-px bg-white/4"
                        style={{ left: `${pct(m)}%` }}
                      />
                    ))}

                    {/* Today line */}
                    {todayPct >= 0 && todayPct <= 100 && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-amber-400/60 z-10"
                        style={{ left: `${todayPct}%` }}
                      />
                    )}

                    {/* Bar or dot */}
                    {barWidth > 0.5 ? (
                      <div
                        className={`absolute top-1 bottom-1 rounded border ${barColor(row)} cursor-pointer transition-opacity hover:opacity-90`}
                        style={{ left: `${barLeft}%`, width: `${barWidth}%` }}
                        onMouseEnter={e => setTooltip({ row, x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        {/* Done checkmark */}
                        {row.milestone.done && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
                              <polyline points="2,6 5,9 10,3"/>
                            </svg>
                          </div>
                        )}
                      </div>
                    ) : (
                      // Milestone diamond for point-in-time
                      <div
                        className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rotate-45 rounded-sm ${dotColor(row)} cursor-pointer`}
                        style={{ left: `${barLeft}%`, marginLeft: -6 }}
                        onMouseEnter={e => setTooltip({ row, x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Bottom axis */}
          <div className="flex mt-2" style={{ paddingLeft: LEFT_COL }}>
            <div className="relative flex-1 h-px bg-white/8">
              {months.map(m => (
                <div
                  key={m.toISOString()}
                  className="absolute top-0 w-px h-2 bg-white/15"
                  style={{ left: `${pct(m)}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-bg-panel border border-white/10 rounded-xl px-3 py-2.5 shadow-xl text-[12px]"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <p className="text-white font-medium mb-1">{tooltip.row.milestone.title}</p>
          {tooltip.row.milestone.owner && (
            <p className="text-white/45">{tooltip.row.milestone.owner}</p>
          )}
          <p className="text-white/45">
            {tooltip.row.start.toLocaleDateString([], { month: 'short', day: 'numeric' })}
            {' → '}
            {tooltip.row.end.toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' })}
          </p>
          {tooltip.row.isOverdue && <p className="text-red-400 mt-0.5">Overdue</p>}
          {tooltip.row.milestone.done && <p className="text-green-400 mt-0.5">Done ✓</p>}
        </div>
      )}
    </div>
  )
}
