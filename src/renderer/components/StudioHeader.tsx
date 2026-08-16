import React, { useState } from 'react'
import { Code2, Download, Film, MessageSquare, Settings } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useEditorStore } from '../../store/useEditorStore'
import { WorkspaceMode } from '../../types/editor'
import ProjectSettingsDialog from './ProjectSettingsDialog'

export default function StudioHeader({
  mode,
  onModeChange,
  onOpenStudioExport,
}: {
  mode: WorkspaceMode
  onModeChange: (mode: WorkspaceMode) => void
  onOpenStudioExport: () => void
}) {
  const { projectName, setProjectName, scenes } = useEditorStore(
    useShallow((state) => ({
      projectName: state.projectName,
      setProjectName: state.setProjectName,
      scenes: state.scenes,
    }))
  )
  const [showSettings, setShowSettings] = useState(false)

  return (
    <header className="relative z-[100] flex h-14 shrink-0 items-center border-b border-white/[0.07] bg-[#0b0f17] px-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#79f2c0] via-[#5dd9e8] to-[#477cf5] text-[#061019] shadow-lg shadow-emerald-500/10">
          <Film className="h-4 w-4" />
        </div>
        <div className="mr-2 hidden lg:block">
          <div className="text-[11px] font-bold tracking-[0.12em] text-white">
            GRAVITY FRAMES
          </div>
          <div className="text-[8px] text-slate-600">
            Antigravity x HyperFrames
          </div>
        </div>
        <div className="h-6 w-px bg-white/[0.08]" />
        <input
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          aria-label="Animation name"
          className="w-48 min-w-0 rounded-lg bg-transparent px-2 py-1 text-xs font-medium text-slate-200 outline-none hover:bg-white/5 focus:bg-white/5"
        />
        <span className="hidden text-[9px] text-slate-700 xl:inline">
          Autosaved
        </span>
      </div>

      <nav
        className="absolute left-1/2 flex -translate-x-1/2 items-center rounded-xl border border-white/[0.07] bg-black/25 p-1"
        role="tablist"
        aria-label="Animation workspace"
      >
        <WorkspaceTab
          active={mode === 'chat'}
          icon={MessageSquare}
          label="Chat"
          onClick={() => onModeChange('chat')}
        />
        <WorkspaceTab
          active={mode === 'studio'}
          icon={Code2}
          label="Studio"
          onClick={() => onModeChange('studio')}
        />
      </nav>

      <div className="flex flex-1 items-center justify-end gap-1">
        <button
          onClick={() => setShowSettings(true)}
          className="header-icon-button"
          title="App settings"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onOpenStudioExport}
          disabled={!scenes.length}
          className="ml-1 flex h-8 items-center gap-1.5 rounded-lg bg-[#79f2c0] px-3 text-[10px] font-semibold text-[#061019] hover:bg-[#91f7cf] disabled:bg-slate-800 disabled:text-slate-600"
          title="Open the HyperFrames render queue"
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </button>
      </div>
      {showSettings ? (
        <ProjectSettingsDialog onClose={() => setShowSettings(false)} />
      ) : null}
    </header>
  )
}

function WorkspaceTab({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex h-8 min-w-[104px] items-center justify-center gap-2 rounded-lg px-3 text-[10px] font-medium transition ${
        active
          ? 'bg-white/10 text-white shadow'
          : 'text-slate-500 hover:text-slate-200'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}
