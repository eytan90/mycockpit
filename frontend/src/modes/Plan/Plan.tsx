import Planning from '../Planning/Planning'
import Organize from '../Organize/Organize'

export default function Plan() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-12">
        <Planning />
        <div className="border-t border-border-subtle pt-10">
          <Organize />
        </div>
      </div>
    </div>
  )
}
