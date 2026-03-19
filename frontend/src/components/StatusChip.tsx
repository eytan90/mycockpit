interface Props { value: string; size?: 'sm' | 'xs' }

const STYLES: Record<string, string> = {
  'in-progress': 'bg-orange-500/15 text-orange-400',
  'active':      'bg-orange-500/15 text-orange-400',
  'planning':    'bg-purple-500/15 text-purple-400',
  'done':        'bg-green-500/15 text-green-400',
  'completed':   'bg-green-500/15 text-green-400',
  'waiting':     'bg-blue-500/15 text-blue-400',
  'at-risk':     'bg-amber-500/15 text-amber-400',
  'stalled':     'bg-red-500/15 text-red-400',
  'cancelled':   'bg-zinc-700/40 text-zinc-400',
  'high':        'bg-red-500/15 text-red-400',
  'medium':      'bg-amber-500/15 text-amber-400',
  'low':         'bg-zinc-700/40 text-zinc-400',
  'backlog':     'bg-zinc-800/60 text-zinc-500',
}

export default function StatusChip({ value, size = 'xs' }: Props) {
  const key   = value?.toLowerCase() ?? 'unknown'
  const style = STYLES[key] ?? 'bg-zinc-800/60 text-zinc-500'
  const sz    = size === 'xs' ? 'text-[11px] px-2 py-0.5' : 'text-[13px] px-2.5 py-1'
  return (
    <span className={`inline-flex items-center rounded-full font-semibold tracking-tight whitespace-nowrap ${sz} ${style}`}>
      {value}
    </span>
  )
}
