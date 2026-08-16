import React, { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  ChevronLeft,
  Download,
  Film,
  Keyboard,
  Redo2,
  Settings,
  Undo2,
} from 'lucide-react'
import { getProjectDocument, useEditorStore } from '../../store/useEditorStore'
import ExportDialog from './ExportDialog'

export default function Header() {
  const {
    projectName,
    setProjectName,
    apiKeys,
    setApiKeys,
    closeProject,
    scenes,
    history,
    future,
    undo,
    redo,
  } = useEditorStore(
    useShallow((state) => ({
      projectName: state.projectName,
      setProjectName: state.setProjectName,
      apiKeys: state.apiKeys,
      setApiKeys: state.setApiKeys,
      closeProject: state.closeProject,
      scenes: state.scenes,
      history: state.history,
      future: state.future,
      undo: state.undo,
      redo: state.redo,
    }))
  )
  const [showSettings, setShowSettings] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showExport, setShowExport] = useState(false)

  const goHome = async () => {
    const project = getProjectDocument()
    if (project) await window.electronAPI.saveProject(project)
    closeProject()
  }

  const updateKey = (
    key: 'groq' | 'pexels' | 'youtube',
    value: string
  ) => {
    setApiKeys({ [key]: value })
    if (key === 'groq') window.electronAPI.setGroqKey(value)
    else if (key === 'pexels') window.electronAPI.setPexelsKey(value)
    else window.electronAPI.setYouTubeKey(value)
  }

  return (
    <div className="h-14 bg-[#111319] border-b border-white/5 flex items-center justify-between px-3 shrink-0 relative z-[100]">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={goHome}
          className="h-8 px-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white flex items-center gap-1.5 text-xs"
        >
          <ChevronLeft className="w-4 h-4" />
          Projects
        </button>
        <div className="h-5 w-px bg-white/10 mx-1" />
        <div className="h-7 w-7 rounded-lg bg-violet-600 flex items-center justify-center">
          <Film className="w-3.5 h-3.5" />
        </div>
        <input
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          className="bg-transparent hover:bg-white/5 focus:bg-white/5 rounded-lg px-2 py-1 text-sm font-medium outline-none min-w-0 w-56"
          aria-label="Project name"
        />
        <span className="text-[10px] text-slate-600">Autosaved</span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center border-r border-white/5 pr-2 mr-1">
          <button
            onClick={undo}
            disabled={history.length === 0}
            className="p-2 text-slate-500 hover:text-white disabled:text-slate-800 rounded-lg hover:bg-white/5"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={redo}
            disabled={future.length === 0}
            className="p-2 text-slate-500 hover:text-white disabled:text-slate-800 rounded-lg hover:bg-white/5"
            title="Redo (Ctrl+Shift+Z or Ctrl+Y)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={() => setShowExport(true)}
          disabled={scenes.length === 0}
          className="flex items-center gap-2 px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-600 rounded-lg text-xs font-medium"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
        <button
          onClick={() => {
            setShowShortcuts(!showShortcuts)
            setShowSettings(false)
          }}
          className="p-2 text-slate-500 hover:text-white rounded-lg hover:bg-white/5"
          title="Keyboard shortcuts"
        >
          <Keyboard className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            setShowSettings(!showSettings)
            setShowShortcuts(false)
          }}
          className="p-2 text-slate-500 hover:text-white rounded-lg hover:bg-white/5"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {showSettings && (
        <div className="absolute top-12 right-3 w-80 bg-[#181a22] border border-white/10 shadow-2xl rounded-xl p-4 z-50">
          <h2 className="font-semibold text-sm text-slate-200 mb-4">API settings</h2>
          <div className="space-y-4">
            <label className="block">
              <span className="block text-[11px] text-slate-500 mb-1.5">Groq API key</span>
              <input
                type="password"
                className="w-full bg-[#0d0f14] border border-white/10 focus:border-violet-500/50 outline-none rounded-lg p-2.5 text-xs text-slate-300"
                value={apiKeys.groq}
                onChange={(event) => updateKey('groq', event.target.value)}
                placeholder="gsk_…"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] text-slate-500 mb-1.5">Pexels API key</span>
              <input
                type="password"
                className="w-full bg-[#0d0f14] border border-white/10 focus:border-violet-500/50 outline-none rounded-lg p-2.5 text-xs text-slate-300"
                value={apiKeys.pexels}
                onChange={(event) => updateKey('pexels', event.target.value)}
              />
            </label>
            <label className="block">
              <span className="block text-[11px] text-slate-500 mb-1.5">
                YouTube Data API key
              </span>
              <input
                type="password"
                className="w-full bg-[#0d0f14] border border-white/10 focus:border-violet-500/50 outline-none rounded-lg p-2.5 text-xs text-slate-300"
                value={apiKeys.youtube}
                onChange={(event) => updateKey('youtube', event.target.value)}
                placeholder="Required for YouTube search"
              />
            </label>
            <button
              onClick={() => setShowSettings(false)}
              className="w-full bg-white/5 hover:bg-white/10 rounded-lg py-2 text-xs"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {showShortcuts && (
        <div className="absolute top-12 right-12 w-80 bg-[#181a22] border border-white/10 shadow-2xl rounded-xl p-4 z-50">
          <h2 className="font-semibold text-sm text-slate-200 mb-3">Keyboard shortcuts</h2>
          <div className="space-y-2">
            {[
              ['Play / pause', 'Space'],
              ['Split selected scene', 'Ctrl+B'],
              ['Delete selected scene', 'Delete'],
              ['Undo', 'Ctrl+Z'],
              ['Redo', 'Ctrl+Shift+Z'],
              ['Move playhead 1 frame', '← / →'],
              ['Move playhead 1 second', 'Shift+← / →'],
              ['Zoom timeline in / out', 'Ctrl++ / Ctrl+-'],
              ['Reset timeline zoom', 'Ctrl+0'],
              ['Save project', 'Ctrl+S'],
              ['Split subtitle at cursor', 'Enter'],
              ['Subtitle line break', 'Shift+Enter'],
            ].map(([label, shortcut]) => (
              <div key={label} className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">{label}</span>
                <kbd className="rounded border border-white/10 bg-black/25 px-2 py-1 text-[9px] text-slate-300">
                  {shortcut}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      )}
      {showExport && (
        <ExportDialog scope="timeline" onClose={() => setShowExport(false)} />
      )}
    </div>
  )
}
