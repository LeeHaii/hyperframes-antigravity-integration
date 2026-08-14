import React, { useCallback, useEffect, useState } from 'react'
import {
  Clock3,
  Copy,
  Film,
  FolderOpen,
  Layers3,
  MoreVertical,
  Pencil,
  Plus,
  Settings,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { ProjectSummary } from '../../types/editor'
import { useEditorStore } from '../../store/useEditorStore'
import BatchExportDialog from './BatchExportDialog'
import ProjectSettingsDialog from './ProjectSettingsDialog'

export default function ProjectHome() {
  const { setScreen, loadProject } = useEditorStore()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showBatchExport, setShowBatchExport] = useState(false)
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null)

  const refreshProjects = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setProjects(await window.electronAPI.listProjects())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshProjects()
  }, [refreshProjects])

  useEffect(() => {
    const closeMenu = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target?.closest('[data-project-menu-root]')) setActiveMenuId(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveMenuId(null)
    }
    window.addEventListener('pointerdown', closeMenu)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeMenu)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  const openProject = async (projectId: string) => {
    setActiveMenuId(null)
    setOpeningId(projectId)
    setError(null)
    try {
      loadProject(await window.electronAPI.loadProject(projectId))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setOpeningId(null)
    }
  }

  const runProjectAction = async (
    projectId: string,
    action: () => Promise<unknown>
  ) => {
    setActiveMenuId(null)
    setBusyProjectId(projectId)
    setError(null)
    try {
      await action()
      await refreshProjects()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusyProjectId(null)
    }
  }

  const renameProject = (project: ProjectSummary) => {
    const name = window.prompt('Rename project', project.name)
    if (name === null || name.trim() === project.name) {
      setActiveMenuId(null)
      return
    }
    void runProjectAction(project.id, () =>
      window.electronAPI.renameProject(project.id, name)
    )
  }

  const duplicateProject = (project: ProjectSummary) => {
    void runProjectAction(project.id, () =>
      window.electronAPI.duplicateProject(project.id)
    )
  }

  const deleteProject = (project: ProjectSummary) => {
    const confirmed = window.confirm(
      `Delete "${project.name}"?\n\nThis permanently removes the project file and cannot be undone. Imported source media will not be deleted.`
    )
    if (!confirmed) {
      setActiveMenuId(null)
      return
    }
    void runProjectAction(project.id, () =>
      window.electronAPI.deleteProject(project.id)
    )
  }

  return (
    <div className="min-h-screen bg-[#0b0d12] text-white">
      <header className="h-20 border-b border-white/5 bg-[#101218]/90 flex items-center justify-between px-10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-950/40">
            <Film className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold tracking-tight">Rhymx Studio</div>
            <div className="text-[11px] text-slate-500">AI video editor</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBatchExport(true)}
            disabled={projects.length === 0}
            className="h-9 px-3 rounded-lg border border-white/8 bg-white/5 hover:bg-white/10 disabled:opacity-35 flex items-center gap-2 text-xs text-slate-300"
          >
            <Layers3 className="h-3.5 w-3.5" />
            Batch render
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="h-9 px-3 rounded-lg border border-white/8 bg-white/5 hover:bg-white/10 flex items-center gap-2 text-xs text-slate-300"
          >
            <Settings className="h-3.5 w-3.5" />
            Settings
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-10 py-12">
        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#171923] to-[#101117] p-10 relative overflow-hidden">
          <div className="absolute -right-28 -top-32 h-80 w-80 rounded-full bg-violet-600/15 blur-3xl" />
          <div className="relative max-w-2xl">
            <div className="flex items-center gap-2 text-violet-300 text-xs font-medium uppercase tracking-[0.18em] mb-4">
              <Sparkles className="h-4 w-4" />
              Voiceover to video
            </div>
            <h1 className="text-4xl font-semibold tracking-tight mb-3">What will you create today?</h1>
            <p className="text-slate-400 text-base leading-relaxed mb-7">
              Start with a voiceover. Rhymx transcribes it into timed scenes, then gives you a full
              timeline for footage, sound, and subtitles.
            </p>
            <button
              onClick={() => setScreen('new-project')}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 px-5 py-3 text-sm font-medium transition-colors shadow-lg shadow-violet-950/40"
            >
              <Plus className="h-4 w-4" />
              Create new project
            </button>
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-semibold">Recent projects</h2>
              <p className="text-sm text-slate-500 mt-1">Continue where you left off.</p>
            </div>
            <span className="text-xs text-slate-600">{projects.length} projects</span>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="h-44 rounded-2xl border border-white/5 bg-white/[0.02] animate-pulse" />
          ) : projects.length === 0 ? (
            <button
              onClick={() => setScreen('new-project')}
              className="w-full h-48 rounded-2xl border border-dashed border-white/10 hover:border-violet-500/40 hover:bg-violet-500/[0.03] flex flex-col items-center justify-center text-slate-500 hover:text-slate-300 transition-colors"
            >
              <FolderOpen className="h-8 w-8 mb-3" />
              <span className="text-sm">No projects yet — create your first one</span>
            </button>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="group relative rounded-2xl"
                >
                  <button
                    onClick={() => openProject(project.id)}
                    disabled={openingId !== null || busyProjectId !== null}
                    className="w-full text-left rounded-2xl border border-white/8 bg-[#12141b] hover:bg-[#171923] hover:border-violet-500/30 overflow-hidden transition-all disabled:opacity-60"
                  >
                    <div className="h-32 bg-gradient-to-br from-slate-900 to-violet-950/30 flex items-center justify-center border-b border-white/5">
                      <Film className="h-9 w-9 text-violet-400/60 group-hover:scale-110 transition-transform" />
                    </div>
                    <div className="p-4">
                      <div className="font-medium truncate pr-8">
                        {openingId === project.id
                          ? 'Opening…'
                          : busyProjectId === project.id
                            ? 'Updating…'
                            : project.name}
                      </div>
                      <div className="flex items-center gap-4 text-[11px] text-slate-500 mt-3">
                        <span className="flex items-center gap-1.5">
                          <Clock3 className="h-3 w-3" />
                          {new Date(project.updatedAt).toLocaleDateString()}
                        </span>
                        <span>{project.sceneCount} scenes</span>
                        <span>{Math.round(project.duration)}s</span>
                      </div>
                    </div>
                  </button>

                  <div
                    data-project-menu-root
                    className="absolute right-3 top-3 z-30"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setActiveMenuId((current) =>
                          current === project.id ? null : project.id
                        )
                      }
                      disabled={openingId !== null || busyProjectId !== null}
                      className="h-8 w-8 rounded-lg border border-white/10 bg-black/45 text-slate-300 hover:bg-black/70 hover:text-white disabled:opacity-40 flex items-center justify-center"
                      aria-label={`Project actions for ${project.name}`}
                      aria-expanded={activeMenuId === project.id}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>

                    {activeMenuId === project.id && (
                      <div
                        role="menu"
                        className="absolute right-0 top-10 w-40 rounded-xl border border-white/10 bg-[#1a1c24] p-1.5 shadow-2xl shadow-black/50"
                      >
                        <ProjectMenuAction
                          icon={Pencil}
                          label="Rename"
                          onClick={() => renameProject(project)}
                        />
                        <ProjectMenuAction
                          icon={Copy}
                          label="Duplicate"
                          onClick={() => duplicateProject(project)}
                        />
                        <ProjectMenuAction
                          icon={Trash2}
                          label="Delete"
                          danger
                          onClick={() => deleteProject(project)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      {showSettings && (
        <ProjectSettingsDialog
          onClose={() => setShowSettings(false)}
          onStorageChanged={refreshProjects}
        />
      )}
      {showBatchExport && (
        <BatchExportDialog
          projects={projects}
          onClose={() => setShowBatchExport(false)}
        />
      )}
    </div>
  )
}

function ProjectMenuAction({
  icon: Icon,
  label,
  danger = false,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`w-full rounded-lg px-3 py-2 flex items-center gap-2 text-left text-xs ${
        danger
          ? 'text-red-300 hover:bg-red-500/10'
          : 'text-slate-300 hover:bg-white/5 hover:text-white'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}
