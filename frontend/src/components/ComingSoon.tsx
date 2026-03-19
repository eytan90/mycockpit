interface Props {
  mode: string
  milestone: string
  description: string
}

export default function ComingSoon({ mode, milestone, description }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center px-8">
      <div className="bg-bg-surface border border-border-subtle rounded-card p-8 max-w-md">
        <div className="text-xxs font-medium text-accent-blue bg-accent-blue/10 px-3 py-1 rounded-full inline-block mb-4">
          {milestone}
        </div>
        <h2 className="text-xl font-semibold text-text-primary mb-2">{mode} Mode</h2>
        <p className="text-sm text-text-secondary leading-relaxed">{description}</p>
      </div>
    </div>
  )
}
