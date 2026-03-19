import type { Project } from '../../../stores/projectStore'

interface Props { project: Project }

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function avatarColor(name: string) {
  const colors = ['bg-accent-blue/20 text-accent-blue', 'bg-accent-green/20 text-accent-green',
    'bg-accent-purple/20 text-accent-purple', 'bg-accent-amber/20 text-accent-amber']
  const i = name.charCodeAt(0) % colors.length
  return colors[i]
}

export default function TeamTab({ project: p }: Props) {
  const members = Array.from(new Set([...(p.owner ? [p.owner] : []), ...p.team]))

  if (members.length === 0) {
    return <p className="text-sm text-text-muted py-4">No team members assigned.</p>
  }

  return (
    <div className="space-y-3 max-w-md">
      {members.map(name => (
        <div key={name} className="flex items-center gap-3 p-3 bg-bg-surface border border-border-subtle rounded-lg">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${avatarColor(name)}`}>
            {initials(name)}
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary">{name}</p>
            {name === p.owner && (
              <p className="text-xxs text-text-muted">Owner</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
