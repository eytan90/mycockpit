interface Props { value: number; height?: string; animated?: boolean }

function progressColor(pct: number) {
  if (pct === 0)  return '#27272B'
  if (pct >= 75)  return '#22C55E'
  if (pct >= 50)  return 'var(--accent)'
  if (pct >= 25)  return '#F59E0B'
  return '#EF4444'
}

export default function ProgressBar({ value, height = 'h-1.5', animated = true }: Props) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className={`w-full ${height} bg-zinc-800 rounded-full overflow-hidden`}>
      <div
        className={`h-full rounded-full ${animated ? 'transition-all duration-700' : ''}`}
        style={{ width: `${pct}%`, background: progressColor(pct) }}
      />
    </div>
  )
}
