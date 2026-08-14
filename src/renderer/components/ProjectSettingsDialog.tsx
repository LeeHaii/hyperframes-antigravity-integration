import React, { useEffect, useState } from 'react'
import { FolderOpen, KeyRound, RotateCcw, Settings, Trash2, X } from 'lucide-react'
import { AppSettings } from '../../types/editor'
import { useEditorStore } from '../../store/useEditorStore'

export default function ProjectSettingsDialog({
  onClose,
  onStorageChanged,
}: {
  onClose: () => void
  onStorageChanged: () => void
}) {
  const { apiKeys, setApiKeys } = useEditorStore()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    window.electronAPI.getAppSettings().then(setSettings)
  }, [])

  const updateKey = (key: 'groq' | 'pexels' | 'youtube', value: string) => {
    setApiKeys({ [key]: value })
    if (key === 'groq') window.electronAPI.setGroqKey(value)
    else if (key === 'pexels') window.electronAPI.setPexelsKey(value)
    else window.electronAPI.setYouTubeKey(value)
  }

  const chooseFolder = async () => {
    setBusy('folder')
    setStatus('')
    try {
      const next = await window.electronAPI.chooseProjectsDirectory()
      if (next) {
        setSettings(next)
        onStorageChanged()
        setStatus('Project storage folder updated.')
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const resetFolder = async () => {
    setBusy('folder')
    const next = await window.electronAPI.resetProjectsDirectory()
    setSettings(next)
    onStorageChanged()
    setStatus('Using the default project storage folder.')
    setBusy(null)
  }

  const clearCache = async () => {
    if (
      !window.confirm(
        'Clear temporary downloads and browser cache? Projects and saved YouTube clips are kept.'
      )
    ) {
      return
    }
    setBusy('cache')
    setStatus('Clearing cache…')
    try {
      const next = await window.electronAPI.clearCache()
      setSettings(next)
      setStatus('Cache cleared. Project JSON files and imported source files were not removed.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[300] bg-black/75 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto custom-scrollbar rounded-2xl border border-white/10 bg-[#151821] shadow-2xl">
        <div className="sticky top-0 z-10 h-14 flex items-center justify-between px-5 border-b border-white/8 bg-[#151821]">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-semibold">Project settings</h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          <section>
            <h3 className="text-xs font-medium text-slate-200">Project storage</h3>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              New saves and the project browser use this folder. Existing projects are not moved
              automatically.
            </p>
            <div className="mt-3 rounded-lg border border-white/8 bg-black/20 p-3 text-[10px] text-slate-400 break-all">
              {settings?.projectsDirectory || 'Loading…'}
            </div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={chooseFolder}
                disabled={busy !== null}
                className="h-9 px-3 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 flex items-center gap-2 text-[10px]"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Browse folder
              </button>
              <button
                onClick={resetFolder}
                disabled={
                  busy !== null ||
                  settings?.projectsDirectory === settings?.defaultProjectsDirectory
                }
                className="h-9 px-3 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-35 flex items-center gap-2 text-[10px]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Use default
              </button>
            </div>
          </section>

          <section className="border-t border-white/8 pt-5">
            <h3 className="text-xs font-medium text-slate-200">AI scene builder</h3>
            <label className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-black/15 p-3">
              <div>
                <div className="text-[11px] text-slate-300">
                  Auto-fill new scenes with Pexels video
                </div>
                <div className="text-[9px] text-slate-600 mt-1">
                  Uses Groq’s recommended keywords after transcription.
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings?.autoStockEnabled ?? true}
                onChange={async (event) =>
                  setSettings(
                    await window.electronAPI.setAutoStockEnabled(event.target.checked)
                  )
                }
                className="h-4 w-4 accent-violet-500"
              />
            </label>
          </section>

          <section className="border-t border-white/8 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <KeyRound className="h-3.5 w-3.5 text-slate-500" />
              <h3 className="text-xs font-medium text-slate-200">API keys</h3>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {(
                [
                  ['groq', 'Groq API key', 'Required for Whisper transcription'],
                  ['pexels', 'Pexels API key', 'Required for automatic stock footage'],
                  ['youtube', 'YouTube Data API key', 'Required only for YouTube search'],
                ] as const
              ).map(([key, label, hint]) => (
                <label key={key} className="text-[10px] text-slate-500">
                  {label}
                  <input
                    type="password"
                    value={apiKeys[key]}
                    onChange={(event) => updateKey(key, event.target.value)}
                    placeholder={hint}
                    className="mt-1.5 w-full h-9 rounded-lg border border-white/10 bg-[#0d0f14] px-3 text-xs text-slate-300 outline-none focus:border-violet-500/50"
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="border-t border-white/8 pt-5">
            <h3 className="text-xs font-medium text-slate-200">Cache</h3>
            <p className="mt-1 text-[10px] text-slate-500">
              Temporary downloads and browser cache · {formatBytes(settings?.cacheSizeBytes || 0)}.
              Saved YouTube clips are stored with their projects and are not cleared.
              Cached YouTube clips may be referenced by projects.
            </p>
            <button
              onClick={clearCache}
              disabled={busy !== null}
              className="mt-3 h-9 px-3 rounded-lg border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50 text-red-300 flex items-center gap-2 text-[10px]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {busy === 'cache' ? 'Clearing…' : 'Clear cache'}
            </button>
          </section>

          {status && (
            <div className="rounded-lg border border-white/8 bg-black/15 p-3 text-[10px] text-slate-400">
              {status}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}
