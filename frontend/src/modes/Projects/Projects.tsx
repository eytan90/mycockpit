import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useProjectStore } from '../../stores/projectStore'
import ProjectList from './ProjectList'
import ProjectDetail from './ProjectDetail'

export default function Projects() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const { projects, fetch, lastFetched } = useProjectStore()
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')

  useEffect(() => {
    if (!lastFetched) fetch()
  }, [lastFetched])

  useEffect(() => {
    if (id) setMobileView('detail')
  }, [id])

  const selected = id ? projects.find(p => p.id === id) ?? null : null

  function handleSelect(projectId: string) {
    navigate(`/projects/${projectId}`)
    setMobileView('detail')
  }

  function handleBack() {
    navigate('/projects')
    setMobileView('list')
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left — project list */}
      <div className={`
        flex-shrink-0 w-full md:w-[380px] border-r border-border-subtle flex flex-col overflow-hidden
        ${mobileView === 'detail' ? 'hidden md:flex' : 'flex'}
      `}>
        <ProjectList
          projects={projects}
          selectedId={id}
          onSelect={handleSelect}
        />
      </div>

      {/* Right — detail panel */}
      <div className={`
        flex-1 overflow-auto min-w-0
        ${mobileView === 'list' && !id ? 'hidden md:flex md:items-center md:justify-center' : 'flex flex-col'}
      `}>
        {selected ? (
          <ProjectDetail
            project={selected}
            onBack={handleBack}
            onUpdated={() => fetch()}
          />
        ) : (
          <div className="hidden md:flex flex-col items-center justify-center h-full text-center px-8">
            <div className="bg-bg-surface border border-border-subtle rounded-card p-8 max-w-xs">
              <div className="text-text-muted text-sm">Select a project to view details</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
