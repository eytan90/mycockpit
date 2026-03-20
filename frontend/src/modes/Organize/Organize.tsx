import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAttentionStore } from '../../stores/attentionStore'
import type { AttentionItem } from '../../stores/attentionStore'
import { useInboxStore } from '../../stores/inboxStore'
import { useProjectStore } from '../../stores/projectStore'
import { useBacklogStore } from '../../stores/backlogStore'
import { useIdeaStore } from '../../stores/ideaStore'
import { api } from '../../api/client'
import { useToast } from '../../components/Toast'

const SEV_CONFIG = {
  high:   { label: 'Needs Action',  dot: 'bg-accent-red',   text: 'text-accent-red',   border: 'border-accent-red/20',   bg: 'bg-accent-red/5' },
  medium: { label: 'Watch',         dot: 'bg-accent-amber', text: 'text-accent-amber', border: 'border-accent-amber/20', bg: 'bg-accent-amber/5' },
  low:    { label: 'FYI',           dot: 'bg-accent-blue',  text: 'text-accent-blue',  border: 'border-accent-blue/20',  bg: 'bg-accent-blue/5' },
}

interface SyncResult {
  ran_at: string
  projects_synced: number
  project_changes: { project: string; changes: string[] }[]
  inbox_classified: number
  inbox_items: { text: string; category: string; destination: string }[]
  flags: { project: string; issue: string }[]
}

export default function Organize() {
  const navigate = useNavigate()
  const toast = useToast()
  const { items, summary, fetch, lastFetched, isLoading, invalidate } = useAttentionStore()
  const { fetch: fetchInbox, lastFetched: inboxFetched } = useInboxStore()
  const { projects, invalidate: invalidateProjects } = useProjectStore()
  const { invalidate: invalidateBacklog } = useBacklogStore()
  const { ideas, invalidate: invalidateIdeas } = useIdeaStore()

  useEffect(() => { if (!lastFetched) fetch() }, [lastFetched])
  useEffect(() => { if (!inboxFetched) fetchInbox() }, [inboxFetched])

  const [reviewing, setReviewing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)

  async function runReview() {
    setReviewing(true)
    try {
      await api.post('/inbox/review', {})
      invalidate()
      toast.success('Inbox reviewed')
    } catch (e) {
      toast.error('Review failed')
      console.error(e)
    }
    setReviewing(false)
  }

  async function runFullSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const result = await api.post<SyncResult>('/organize', {})
      setSyncResult(result)
      // Invalidate all stores so UI reflects changes
      invalidate()
      invalidateProjects()
      invalidateBacklog()
      invalidateIdeas()
      toast.success('Vault synced')
    } catch (e) {
      toast.error('Sync failed')
      console.error(e)
    }
    setSyncing(false)
  }

  const highCount   = items.filter(i => i.severity === 'high').length
  const medCount    = items.filter(i => i.severity === 'medium').length
  const lowCount    = items.filter(i => i.severity === 'low').length
  const totalIssues = items.length

  const healthScore = Math.max(0, 100 - highCount * 15 - medCount * 5 - lowCount * 2)
  const scoreColor = healthScore >= 80 ? 'text-accent-green' : healthScore >= 50 ? 'text-accent-amber' : 'text-accent-red'

  // Project-level intelligence signals
  const activeProjects = projects.filter(p => !['done','cancelled'].includes(p.status))
  const noOwner        = activeProjects.filter(p => !p.owner)
  const noNextAction   = activeProjects.filter(p => !p.next_action)
  const lowConfidence  = activeProjects.filter(p => p.confidence === 'low')
  const noTargetDate   = activeProjects.filter(p => !p.target_date)
  const progressMismatch = activeProjects.filter(p => {
    if (p.milestones_total === 0) return false
    const calcPct = Math.round(p.milestones_done / p.milestones_total * 100)
    return Math.abs(calcPct - p.progress) > 20
  })
  const readyToPromote = (ideas ?? []).filter((i: any) => i.maturity >= 90 && !i.graduated)

  return (
    <div className="max-w-2xl space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Organize</h1>
          <p className="text-sm text-text-muted mt-0.5">Vault health check & auto-sync</p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <button
            onClick={() => invalidate()}
            className="text-xxs text-text-muted hover:text-text-secondary transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={runFullSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-accent-blue text-white rounded-lg hover:bg-accent-blue/90 disabled:opacity-50 transition-colors"
          >
            {syncing ? (
              <>
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Syncing…
              </>
            ) : (
              'Run Full Sync'
            )}
          </button>
        </div>
      </div>

      {/* Sync result report */}
      {syncResult && (
        <div className="p-4 bg-bg-surface border border-accent-green/20 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-accent-green">Sync complete</p>
            <span className="text-xxs text-text-muted">{syncResult.ran_at}</span>
          </div>
          <div className="flex gap-4 text-xxs text-text-muted">
            <span><strong className="text-text-secondary">{syncResult.projects_synced}</strong> projects updated</span>
            <span><strong className="text-text-secondary">{syncResult.inbox_classified}</strong> inbox items filed</span>
            <span><strong className="text-text-secondary">{syncResult.flags.length}</strong> flags</span>
          </div>

          {syncResult.project_changes.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-border-subtle">
              <p className="text-xxs font-semibold text-text-muted uppercase tracking-wider">Changes</p>
              {syncResult.project_changes.map((pc, i) => (
                <div key={i} className="text-xxs text-text-secondary">
                  <span className="font-medium">{pc.project}</span>: {pc.changes.join(' · ')}
                </div>
              ))}
            </div>
          )}

          {syncResult.inbox_items.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-border-subtle">
              <p className="text-xxs font-semibold text-text-muted uppercase tracking-wider">Inbox Filed</p>
              {syncResult.inbox_items.map((item, i) => (
                <div key={i} className="text-xxs text-text-secondary flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-xxs font-medium ${item.category === 'TASK' ? 'bg-accent-blue/10 text-accent-blue' : 'bg-accent-purple/10 text-accent-purple'}`}>
                    {item.category}
                  </span>
                  <span className="truncate">{item.text}</span>
                  <span className="text-text-muted shrink-0">→ {item.destination}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Flags / Needs Attention section */}
      {syncResult && syncResult.flags.length > 0 && (
        <div className="space-y-2">
          <p className="text-xxs font-semibold uppercase tracking-wider text-accent-red">Needs Attention ({syncResult.flags.length})</p>
          {syncResult.flags.map((f, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-red-500/20 bg-red-500/5">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 mt-1.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-text-primary">{f.project}</p>
                <p className="text-xxs text-text-muted mt-0.5">{f.issue}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Health score + stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Health Score" value={`${healthScore}`} unit="/100" valueClass={scoreColor} />
        <StatTile label="Active Projects" value={String(summary?.active_projects ?? '—')} />
        <StatTile label="Inbox Items" value={String(summary?.inbox_count ?? '—')} valueClass={summary?.inbox_count ? 'text-accent-amber' : undefined} />
        <StatTile label="Ready to Promote" value={String(summary?.ideas_ready_to_promote ?? '—')} valueClass={summary?.ideas_ready_to_promote ? 'text-accent-green' : undefined} />
      </div>

      {/* Project intelligence signals */}
      {(noOwner.length > 0 || noNextAction.length > 0 || lowConfidence.length > 0 || noTargetDate.length > 0 || progressMismatch.length > 0 || readyToPromote.length > 0) && (
        <div className="space-y-2">
          <p className="text-xxs font-semibold uppercase tracking-wider text-text-muted">Project Signals</p>
          {progressMismatch.length > 0 && (
            <SignalRow
              color="text-accent-red"
              dotClass="bg-accent-red"
              text={`${progressMismatch.length} project${progressMismatch.length > 1 ? 's' : ''} with progress % that doesn't match milestone completion`}
              action="Fix in Projects"
              onAction={() => navigate('/projects')}
            />
          )}
          {lowConfidence.length > 0 && (
            <SignalRow
              color="text-accent-amber"
              dotClass="bg-accent-amber"
              text={`${lowConfidence.length} project${lowConfidence.length > 1 ? 's' : ''} with low confidence: ${lowConfidence.map(p => p.name).join(', ')}`}
              action="Review plans"
              onAction={() => navigate('/projects')}
            />
          )}
          {noNextAction.length > 0 && (
            <SignalRow
              color="text-accent-amber"
              dotClass="bg-accent-amber"
              text={`${noNextAction.length} active project${noNextAction.length > 1 ? 's' : ''} missing a Next Action`}
              action="Add next actions"
              onAction={() => navigate('/projects')}
            />
          )}
          {noOwner.length > 0 && (
            <SignalRow
              color="text-text-muted"
              dotClass="bg-border-default"
              text={`${noOwner.length} project${noOwner.length > 1 ? 's' : ''} without an owner`}
              action="Assign owners"
              onAction={() => navigate('/projects')}
            />
          )}
          {noTargetDate.length > 0 && (
            <SignalRow
              color="text-text-muted"
              dotClass="bg-border-default"
              text={`${noTargetDate.length} project${noTargetDate.length > 1 ? 's' : ''} with no target date`}
              action="Set dates"
              onAction={() => navigate('/projects')}
            />
          )}
          {readyToPromote.length > 0 && (
            <SignalRow
              color="text-accent-green"
              dotClass="bg-accent-green"
              text={`${readyToPromote.length} idea${readyToPromote.length > 1 ? 's' : ''} ready to promote to a project`}
              action="View Ideas"
              onAction={() => navigate('/ideas')}
            />
          )}
        </div>
      )}

      {/* Inbox review banner */}
      {(summary?.inbox_count ?? 0) > 0 && (
        <div className="flex items-center gap-3 p-4 bg-accent-amber/5 border border-accent-amber/20 rounded-lg">
          <div className="flex-1">
            <p className="text-sm font-medium text-text-primary">{summary!.inbox_count} unreviewed inbox item{summary!.inbox_count > 1 ? 's' : ''}</p>
            <p className="text-xxs text-text-muted mt-0.5">Auto-classify into tasks or ideas</p>
          </div>
          <button
            onClick={runReview}
            disabled={reviewing}
            className="px-4 py-2 text-sm bg-accent-amber text-bg-base font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
          >
            {reviewing ? 'Reviewing…' : 'Review Now'}
          </button>
        </div>
      )}

      {/* Attention items by severity */}
      {isLoading && !lastFetched ? (
        <div className="text-sm text-text-muted">Loading health check…</div>
      ) : totalIssues === 0 ? (
        <div className="py-10 text-center">
          <p className="text-accent-green font-medium">All clear — vault looks healthy.</p>
          <p className="text-xxs text-text-muted mt-1">No flagged issues at this time.</p>
        </div>
      ) : (
        <>
          {(['high', 'medium', 'low'] as const).map(sev => {
            const sevItems = items.filter(i => i.severity === sev)
            if (sevItems.length === 0) return null
            const cfg = SEV_CONFIG[sev]
            return (
              <div key={sev} className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  <span className={`text-xxs font-semibold uppercase tracking-wider ${cfg.text}`}>
                    {cfg.label} · {sevItems.length}
                  </span>
                </div>
                {sevItems.map((item, i) => (
                  <AttentionRow key={i} item={item} cfg={cfg} />
                ))}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

function AttentionRow({ item, cfg }: { item: AttentionItem; cfg: typeof SEV_CONFIG['high'] }) {
  const navigate = useNavigate()

  function handleAction() {
    if (item.project_name) navigate('/projects')
    else if (item.action?.toLowerCase().includes('idea')) navigate('/ideas')
    else if (item.action?.toLowerCase().includes('inbox')) navigate('/')
  }

  return (
    <div className={`p-3 rounded-lg border ${cfg.border} ${cfg.bg}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">{item.title}</p>
          <p className="text-xxs text-text-muted mt-0.5">{item.detail}</p>
          {item.project_name && (
            <p className="text-xxs text-text-muted mt-0.5 italic">{item.project_name}</p>
          )}
        </div>
        {item.action && (
          <button
            onClick={handleAction}
            className={`text-xxs shrink-0 mt-0.5 hover:underline underline-offset-2 ${cfg.text}`}
          >
            {item.action} →
          </button>
        )}
      </div>
    </div>
  )
}

function SignalRow({ color, dotClass, text, action, onAction }: {
  color: string; dotClass: string; text: string; action?: string; onAction?: () => void
}) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-bg-surface border border-border-subtle">
      <div className={`w-2 h-2 rounded-full shrink-0 mt-1 ${dotClass}`} />
      <p className={`text-xxs flex-1 ${color}`}>{text}</p>
      {action && onAction && (
        <button onClick={onAction} className="text-xxs text-accent-blue hover:underline shrink-0">
          {action} →
        </button>
      )}
    </div>
  )
}

function StatTile({ label, value, unit, valueClass }: {
  label: string; value: string; unit?: string; valueClass?: string
}) {
  return (
    <div className="p-4 bg-bg-surface border border-border-subtle rounded-lg">
      <div className="text-xxs text-text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${valueClass ?? 'text-text-primary'}`}>
        {value}
        {unit && <span className="text-sm text-text-muted font-normal ml-0.5">{unit}</span>}
      </div>
    </div>
  )
}
