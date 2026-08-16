import React, { useEffect, useState } from 'react'
import {
  CheckCircle2,
  CircleAlert,
  Cpu,
  ExternalLink,
  FolderOpen,
  KeyRound,
  LogIn,
  Plus,
  RefreshCcw,
  RotateCcw,
  Settings,
  Trash2,
  X,
} from 'lucide-react'
import {
  AntigravityStatus,
  AppSettings,
  EncoderCapabilities,
  ProjectSummary,
} from '../../types/editor'
import { getProjectDocument, useEditorStore } from '../../store/useEditorStore'
import { createAnimationProject } from '../../project'

export default function ProjectSettingsDialog({
  onClose,
  onStorageChanged = () => undefined,
}: {
  onClose: () => void
  onStorageChanged?: () => void
}) {
  const { apiKeys, setApiKeys, projectId, projectName, loadProject } = useEditorStore()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || '')
  const [newProjectName, setNewProjectName] = useState('Untitled animation')
  const [antigravity, setAntigravity] = useState<AntigravityStatus | null>(null)
  const [capabilities, setCapabilities] = useState<EncoderCapabilities | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([
      window.electronAPI.getAppSettings(),
      window.electronAPI.getAntigravityStatus(),
      window.electronAPI.getEncoderCapabilities(),
      window.electronAPI.listProjects(),
    ])
      .then(([appSettings, antigravityStatus, encoderCapabilities, savedProjects]) => {
        if (cancelled) return
        setSettings(appSettings)
        setAntigravity(antigravityStatus)
        setCapabilities(encoderCapabilities)
        setProjects(savedProjects)
      })
      .catch((error) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : String(error))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const saveCurrentProject = async () => {
    const current = getProjectDocument()
    if (current) await window.electronAPI.saveProject(current)
  }

  const openProject = async () => {
    if (!selectedProjectId || selectedProjectId === projectId) return
    setBusy('project')
    setStatus('Opening project...')
    try {
      await saveCurrentProject()
      const project = await window.electronAPI.loadProject(selectedProjectId)
      loadProject(project)
      localStorage.setItem('gravity.lastProjectId', project.id)
      onClose()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const createProject = async () => {
    const name = newProjectName.replace(/\s+/g, ' ').trim()
    if (!name) {
      setStatus('Enter a project name first.')
      return
    }
    setBusy('project')
    setStatus('Creating project...')
    try {
      await saveCurrentProject()
      const project = createAnimationProject(name)
      await window.electronAPI.saveProject(project)
      loadProject(project)
      localStorage.setItem('gravity.lastProjectId', project.id)
      onClose()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const updateKey = (key: 'groq' | 'pexels' | 'youtube', value: string) => {
    setApiKeys({ [key]: value })
    if (key === 'groq') void window.electronAPI.setGroqKey(value)
    else if (key === 'pexels') void window.electronAPI.setPexelsKey(value)
    else void window.electronAPI.setYouTubeKey(value)
  }

  const chooseProjectsFolder = async () => {
    setBusy('projects')
    setStatus('')
    try {
      const next = await window.electronAPI.chooseProjectsDirectory()
      if (next) {
        setSettings(next)
        setProjects(await window.electronAPI.listProjects())
        onStorageChanged()
        setStatus('Project storage folder updated.')
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const resetProjectsFolder = async () => {
    setBusy('projects')
    setStatus('')
    try {
      const next = await window.electronAPI.resetProjectsDirectory()
      setSettings(next)
      setProjects(await window.electronAPI.listProjects())
      onStorageChanged()
      setStatus('Using the default project storage folder.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const chooseRenderFolder = async () => {
    setBusy('render')
    setStatus('')
    try {
      const next = await window.electronAPI.chooseRenderDirectory()
      if (next) {
        setSettings(next)
        onStorageChanged()
        setStatus('Default render and working-files folder updated.')
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const resetRenderFolder = async () => {
    setBusy('render')
    setStatus('')
    try {
      setSettings(await window.electronAPI.resetRenderDirectory())
      onStorageChanged()
      setStatus('Using the default Gravity Frames render folder.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const chooseStudioProjectsFolder = async () => {
    setBusy('studio-projects')
    setStatus('')
    try {
      const next = await window.electronAPI.chooseStudioProjectsDirectory()
      if (next) {
        setSettings(next)
        onStorageChanged()
        setStatus('HyperFrames Studio project folder updated.')
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const resetStudioProjectsFolder = async () => {
    setBusy('studio-projects')
    setStatus('')
    try {
      setSettings(await window.electronAPI.resetStudioProjectsDirectory())
      onStorageChanged()
      setStatus('Using the default HyperFrames Studio project folder.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const openStudioProjectsFolder = async () => {
    setBusy('studio-projects')
    setStatus('')
    try {
      await window.electronAPI.openStudioProjectsDirectory()
      setStatus('Opened the HyperFrames Studio project folder.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const refreshAntigravity = async () => {
    setBusy('oauth')
    setStatus('')
    try {
      setAntigravity(await window.electronAPI.getAntigravityStatus())
      setStatus('Antigravity status refreshed.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const connectAntigravity = async () => {
    setBusy('oauth')
    setStatus('')
    try {
      if (antigravity?.installed) {
        await window.electronAPI.launchAntigravityLogin()
        setStatus('Finish Google sign-in in the Antigravity terminal, then refresh this status.')
      } else {
        await window.electronAPI.openAntigravityInstallDocs()
        setStatus('Opened the Antigravity CLI installation guide.')
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const clearCache = async () => {
    if (
      !window.confirm(
        'Clear transcription chunks, app cache, and browser cache? Projects and reusable generated clips are kept.'
      )
    ) {
      return
    }
    setBusy('cache')
    setStatus('Clearing temporary files...')
    try {
      setSettings(await window.electronAPI.clearCache())
      setStatus('Temporary files and browser cache cleared. Projects and generated clips were kept.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const accountSummary = antigravity?.accountEmail
    ? 'Connected as ' +
      antigravity.accountEmail +
      (antigravity.accountPlan ? ' - ' + antigravity.accountPlan : '')
    : antigravity?.installed
      ? 'OAuth sign-in has not been confirmed in this app session.'
      : 'Antigravity OAuth is unavailable until the CLI is installed.'

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="App settings"
        className="custom-scrollbar max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#151821] shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-white/10 bg-[#151821] px-5">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-semibold">App settings</h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 p-5">
          <section>
            <h3 className="text-xs font-medium text-slate-200">Projects</h3>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              Each animation is saved by name and gets its own editable HyperFrames source
              directory. The current project is saved before you create or open another one.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/15 p-4">
                <div className="text-[9px] uppercase tracking-[0.14em] text-slate-600">
                  Current project
                </div>
                <div className="mt-1 truncate text-[12px] font-medium text-slate-200">
                  {projectName || 'Untitled animation'}
                </div>
                <div className="mt-1 truncate font-mono text-[9px] text-slate-600">
                  {projectId}
                </div>
                <div className="mt-3 flex gap-2">
                  <select
                    value={selectedProjectId}
                    onChange={(event) => setSelectedProjectId(event.target.value)}
                    disabled={busy !== null}
                    aria-label="Saved project"
                    className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0d0f14] px-2.5 text-[10px] text-slate-300 outline-none focus:border-emerald-400/50"
                  >
                    {!projects.some((project) => project.id === projectId) && projectId ? (
                      <option value={projectId}>{projectName || 'Current project'}</option>
                    ) : null}
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={openProject}
                    disabled={
                      busy !== null || !selectedProjectId || selectedProjectId === projectId
                    }
                    className="h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-[10px] text-slate-300 hover:bg-white/10 disabled:opacity-35"
                  >
                    Open
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4">
                <div className="text-[11px] font-medium text-slate-200">Create new project</div>
                <p className="mt-1 text-[9px] leading-relaxed text-slate-500">
                  Starts with one five-second HyperFrames composition.
                </p>
                <div className="mt-3 flex gap-2">
                  <input
                    value={newProjectName}
                    onChange={(event) => setNewProjectName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void createProject()
                    }}
                    maxLength={120}
                    disabled={busy !== null}
                    aria-label="New project name"
                    className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0d0f14] px-3 text-[10px] text-slate-200 outline-none placeholder:text-slate-700 focus:border-emerald-400/50"
                    placeholder="Project name"
                  />
                  <button
                    type="button"
                    onClick={createProject}
                    disabled={busy !== null || !newProjectName.trim()}
                    className="flex h-9 items-center gap-1.5 rounded-lg bg-[#3ce6ac] px-3 text-[10px] font-semibold text-neutral-950 hover:bg-[#69edbf] disabled:bg-slate-800 disabled:text-slate-600"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="border-t border-white/10 pt-5">
            <h3 className="text-xs font-medium text-slate-200">Files and rendering</h3>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              Exports use the render folder by default. Generated clips, downloads, and
              temporary render data stay inside its hidden .gravity-frames working folder.
              Existing files are not moved when you change either location.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <FolderSetting
                label="Default render folder"
                path={settings?.renderDirectory}
                detail={
                  settings
                    ? 'Working files: ' +
                      settings.workingDirectory +
                      ' (' +
                      formatBytes(settings.workingFilesSizeBytes) +
                      ')'
                    : undefined
                }
                busy={busy !== null}
                canReset={Boolean(
                  settings &&
                    settings.renderDirectory !== settings.defaultRenderDirectory
                )}
                onChoose={chooseRenderFolder}
                onReset={resetRenderFolder}
              />
              <FolderSetting
                label="Project storage"
                path={settings?.projectsDirectory}
                detail="Autosaved project JSON. Existing projects are not moved automatically."
                busy={busy !== null}
                canReset={Boolean(
                  settings &&
                    settings.projectsDirectory !== settings.defaultProjectsDirectory
                )}
                onChoose={chooseProjectsFolder}
                onReset={resetProjectsFolder}
              />
              <FolderSetting
                label="HyperFrames Studio projects"
                path={settings?.studioProjectsDirectory}
                detail="Editable HTML, assets, storyboard, and lint context. Existing folders are not moved automatically."
                busy={busy !== null}
                canReset={Boolean(
                  settings &&
                    settings.studioProjectsDirectory !==
                      settings.defaultStudioProjectsDirectory
                )}
                onChoose={chooseStudioProjectsFolder}
                onReset={resetStudioProjectsFolder}
                onOpen={openStudioProjectsFolder}
              />
            </div>
          </section>

          <section className="border-t border-white/10 pt-5">
            <h3 className="text-xs font-medium text-slate-200">Connections and system</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/15 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[11px] font-medium text-slate-200">
                      {antigravity?.installed && antigravity.minimumVersionMet ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <CircleAlert className="h-3.5 w-3.5 text-amber-400" />
                      )}
                      Antigravity OAuth
                    </div>
                    <p className="mt-2 break-words text-[10px] leading-relaxed text-slate-400">
                      {accountSummary}
                    </p>
                    <p className="mt-1 text-[9px] text-slate-600">
                      {antigravity?.installed
                        ? (antigravity.version || 'CLI installed') + ' - system keyring'
                        : antigravity?.message || 'Checking CLI status...'}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={connectAntigravity}
                    disabled={busy !== null}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-[10px] hover:bg-violet-500 disabled:opacity-50"
                  >
                    {antigravity?.installed ? (
                      <LogIn className="h-3.5 w-3.5" />
                    ) : (
                      <ExternalLink className="h-3.5 w-3.5" />
                    )}
                    {antigravity?.installed ? 'Connect account' : 'Install CLI'}
                  </button>
                  <button
                    onClick={refreshAntigravity}
                    disabled={busy !== null}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-white/5 px-3 text-[10px] hover:bg-white/10 disabled:opacity-50"
                  >
                    <RefreshCcw className="h-3.5 w-3.5" />
                    Refresh
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/15 p-4">
                <div className="flex items-center gap-2 text-[11px] font-medium text-slate-200">
                  <Cpu className="h-3.5 w-3.5 text-sky-400" />
                  Render hardware
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
                  {capabilities
                    ? capabilities.gpuNames.join(' - ') || 'CPU rendering available'
                    : 'Checking graphics hardware...'}
                </p>
                <div className="mt-2 flex gap-2">
                  <StatusPill ready label="CPU H.264" />
                  <StatusPill
                    ready={Boolean(capabilities?.nvenc)}
                    label={capabilities?.nvenc ? 'NVENC ready' : 'NVENC unavailable'}
                  />
                </div>
                {capabilities?.nvencReason ? (
                  <p className="mt-2 text-[9px] leading-relaxed text-amber-400/80">
                    {capabilities.nvencReason}
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="border-t border-white/10 pt-5">
            <h3 className="text-xs font-medium text-slate-200">AI scene builder</h3>
            <label className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/15 p-3">
              <div>
                <div className="text-[11px] text-slate-300">
                  Auto-fill new scenes with Pexels video
                </div>
                <div className="mt-1 text-[9px] text-slate-600">
                  Uses Groq's recommended keywords after transcription.
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

          <section className="border-t border-white/10 pt-5">
            <div className="mb-3 flex items-center gap-2">
              <KeyRound className="h-3.5 w-3.5 text-slate-500" />
              <h3 className="text-xs font-medium text-slate-200">API keys</h3>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {(
                [
                  ['groq', 'Groq API key', 'Whisper transcription'],
                  ['pexels', 'Pexels API key', 'Automatic stock footage'],
                  ['youtube', 'YouTube Data API key', 'YouTube search'],
                ] as const
              ).map(([key, label, hint]) => (
                <label key={key} className="text-[10px] text-slate-500">
                  {label}
                  <input
                    type="password"
                    value={apiKeys[key]}
                    onChange={(event) => updateKey(key, event.target.value)}
                    placeholder={hint}
                    className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-[#0d0f14] px-3 text-xs text-slate-300 outline-none focus:border-violet-500/50"
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="border-t border-white/10 pt-5">
            <h3 className="text-xs font-medium text-slate-200">Temporary data</h3>
            <p className="mt-1 text-[10px] text-slate-500">
              Transcription chunks and app cache: {formatBytes(settings?.cacheSizeBytes || 0)}.
              Reusable generated clips in the working folder are preserved.
            </p>
            <button
              onClick={clearCache}
              disabled={busy !== null}
              className="mt-3 flex h-9 items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 text-[10px] text-red-300 hover:bg-red-500/20 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {busy === 'cache' ? 'Clearing...' : 'Clear temporary data'}
            </button>
          </section>

          {status ? (
            <div className="rounded-lg border border-white/10 bg-black/15 p-3 text-[10px] text-slate-400">
              {status}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function FolderSetting({
  label,
  path,
  detail,
  busy,
  canReset,
  onChoose,
  onReset,
  onOpen,
}: {
  label: string
  path?: string
  detail?: string
  busy: boolean
  canReset: boolean
  onChoose: () => void
  onReset: () => void
  onOpen?: () => void
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/15 p-4">
      <div className="text-[11px] font-medium text-slate-300">{label}</div>
      <div className="mt-2 break-all rounded-lg border border-white/5 bg-black/20 p-2.5 text-[9px] text-slate-400">
        {path || 'Loading...'}
      </div>
      {detail ? (
        <p className="mt-2 break-all text-[9px] leading-relaxed text-slate-600">{detail}</p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          onClick={onChoose}
          disabled={busy}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-[10px] hover:bg-violet-500 disabled:opacity-50"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Browse
        </button>
        <button
          onClick={onReset}
          disabled={busy || !canReset}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-white/5 px-3 text-[10px] hover:bg-white/10 disabled:opacity-35"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Use default
        </button>
        {onOpen ? (
          <button
            onClick={onOpen}
            disabled={busy}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-white/5 px-3 text-[10px] hover:bg-white/10 disabled:opacity-35"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </button>
        ) : null}
      </div>
    </div>
  )
}

function StatusPill({ ready, label }: { ready: boolean; label: string }) {
  return (
    <span
      className={
        'rounded-full border px-2 py-1 text-[9px] ' +
        (ready
          ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
          : 'border-white/10 bg-white/5 text-slate-500')
      }
    >
      {label}
    </span>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB'
  return (bytes / 1024 ** 3).toFixed(2) + ' GB'
}
