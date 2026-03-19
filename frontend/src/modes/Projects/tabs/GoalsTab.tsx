import { useEffect } from 'react'
import type { Project } from '../../../stores/projectStore'
import { useGoalStore } from '../../../stores/goalStore'

interface Props { project: Project }

export default function GoalsTab({ project: p }: Props) {
  const { goals, fetch, lastFetched } = useGoalStore()

  useEffect(() => {
    if (!lastFetched) fetch()
  }, [lastFetched])

  const linked = goals.filter(g =>
    p.goals.includes(g.id) || g.linked_projects.includes(p.id)
  )

  if (linked.length === 0) {
    return (
      <div className="text-sm text-text-muted py-4">
        No goals linked to this project.
        <p className="mt-1 text-xxs">Add a <code className="bg-bg-elevated px-1 rounded">goals:</code> field to the project's frontmatter.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 max-w-lg">
      {linked.map(g => (
        <div key={g.id} className="p-4 bg-bg-surface border border-border-subtle rounded-lg">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="text-sm font-medium text-text-primary">{g.title}</p>
            <span className="text-xxs text-text-muted shrink-0">{g.status}</span>
          </div>
          {g.horizon && <p className="text-xxs text-text-muted">{g.horizon}</p>}
        </div>
      ))}
    </div>
  )
}
