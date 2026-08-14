import React, { useState } from 'react'
import {
  Clapperboard,
  Download,
  Film,
  LayoutDashboard,
  Plus,
  Redo2,
  Upload,
  Undo2,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useEditorStore } from '../../store/useEditorStore'
import { WorkspaceMode } from '../../types/editor'
import ExportDialog from './ExportDialog'

export default function StudioHeader({
  mode,
  onModeChange,
}: {
  mode: WorkspaceMode
  onModeChange: (mode: WorkspaceMode) => void
}) {
  const {
    projectName,
    setProjectName,
    scenes,
    videoTracks,
    history,
    future,
    undo,
    redo,
    addBlankScene,
    addMediaAssets,
  } = useEditorStore(
    useShallow((state) => ({
      projectName: state.projectName,
      setProjectName: state.setProjectName,
      scenes: state.scenes,
      videoTracks: state.videoTracks,
      history: state.history,
      future: state.future,
      undo: state.undo,
      redo: state.redo,
      addBlankScene: state.addBlankScene,
      addMediaAssets: state.addMediaAssets,
    }))
  )
  const [showExport, setShowExport] = useState(false)

  const importMedia = async () => {
    const files = await window.electronAPI.openMediaFiles()
    addMediaAssets(files.map((file) => ({ ...file, id: crypto.randomUUID() })))
  }

  return (
    <header className="relative z-[100] flex h-14 shrink-0 items-center border-b border-white/[0.07] bg-[#0b0f17] px-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#79f2c0] via-[#5dd9e8] to-[#477cf5] text-[#061019] shadow-lg shadow-emerald-500/10">
          <Film className="h-4 w-4" />
        </div>
        <div className="mr-2 hidden lg:block">
          <div className="text-[11px] font-bold tracking-[0.12em] text-white">GRAVITY FRAMES</div>
          <div className="text-[8px] text-slate-600">Antigravity × HyperFrames</div>
        </div>
        <div className="h-6 w-px bg-white/[0.08]" />
        <input
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          aria-label="Project name"
          className="w-48 min-w-0 rounded-lg bg-transparent px-2 py-1 text-xs font-medium text-slate-200 outline-none hover:bg-white/5 focus:bg-white/5"
        />
        <span className="hidden text-[9px] text-slate-700 xl:inline">Autosaved</span>
      </div>

      <nav className="absolute left-1/2 flex -translate-x-1/2 items-center rounded-xl border border-white/[0.07] bg-black/25 p-1">
        <button
          onClick={() => onModeChange('scene')}
          className={`flex h-8 items-center gap-2 rounded-lg px-3 text-[10px] font-medium transition ${
            mode === 'scene' ? 'bg-white/10 text-white shadow' : 'text-slate-500 hover:text-slate-200'
          }`}
        >
          <Clapperboard className="h-3.5 w-3.5" /> Scene Lab
        </button>
        <button
          onClick={() => onModeChange('editor')}
          className={`flex h-8 items-center gap-2 rounded-lg px-3 text-[10px] font-medium transition ${
            mode === 'editor' ? 'bg-white/10 text-white shadow' : 'text-slate-500 hover:text-slate-200'
          }`}
        >
          <LayoutDashboard className="h-3.5 w-3.5" /> Timeline Editor
        </button>
      </nav>

      <div className="flex flex-1 items-center justify-end gap-1">
        <button onClick={undo} disabled={!history.length} className="header-icon-button" title="Undo">
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button onClick={redo} disabled={!future.length} className="header-icon-button" title="Redo">
          <Redo2 className="h-3.5 w-3.5" />
        </button>
        <div className="mx-1 h-6 w-px bg-white/[0.07]" />
        <button onClick={importMedia} className="header-action-button" title="Import videos, images, or audio">
          <Upload className="h-3.5 w-3.5" /> Import
        </button>
        <button
          onClick={() => addBlankScene(videoTracks[0]?.id)}
          className="header-action-button"
          title="Add a blank motion scene"
        >
          <Plus className="h-3.5 w-3.5" /> Scene
        </button>
        <button
          onClick={() => setShowExport(true)}
          disabled={!scenes.length}
          className="ml-1 flex h-8 items-center gap-1.5 rounded-lg bg-[#79f2c0] px-3 text-[10px] font-semibold text-[#061019] hover:bg-[#91f7cf] disabled:bg-slate-800 disabled:text-slate-600"
        >
          <Download className="h-3.5 w-3.5" /> Export
        </button>
      </div>
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
    </header>
  )
}
