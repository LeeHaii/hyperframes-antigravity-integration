import React, { useEffect, useMemo, useState } from 'react'
import { CheckSquare, Cpu, FolderOpen, Square, X } from 'lucide-react'
import {
  BatchExportProgress,
  BatchExportResult,
  EncoderCapabilities,
  ExportEncoder,
  ProjectSummary,
} from '../../types/editor'

const resolutions = [
  { label: '720p HD', width: 1280, height: 720, bitrate: '5M' },
  { label: '1080p Full HD', width: 1920, height: 1080, bitrate: '10M' },
  { label: '2160p 4K', width: 3840, height: 2160, bitrate: '35M' },
]

export default function BatchExportDialog({
  projects,
  onClose,
}: {
  projects: ProjectSummary[]
  onClose: () => void
}) {
  const [selected, setSelected] = useState(() => new Set(projects.map((project) => project.id)))
  const [outputDirectory, setOutputDirectory] = useState('')
  const [resolutionIndex, setResolutionIndex] = useState(1)
  const [encoder, setEncoder] = useState<ExportEncoder>('cpu')
  const [capabilities, setCapabilities] = useState<EncoderCapabilities | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [progress, setProgress] = useState<BatchExportProgress | null>(null)
  const [result, setResult] = useState<BatchExportResult | null>(null)
  const resolution = resolutions[resolutionIndex]

  useEffect(() => {
    window.electronAPI.getEncoderCapabilities().then((detected) => {
      setCapabilities(detected)
      if (detected.nvenc) setEncoder('nvenc')
    })
    window.electronAPI.onBatchExportProgress(setProgress)
  }, [])

  const selectedProjects = useMemo(
    () => projects.filter((project) => selected.has(project.id)),
    [projects, selected]
  )

  const toggle = (projectId: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  const chooseDirectory = async () => {
    const directory = await window.electronAPI.chooseBatchExportDirectory()
    if (directory) setOutputDirectory(directory)
  }

  const start = async () => {
    if (!outputDirectory || selectedProjects.length === 0) return
    setIsExporting(true)
    setResult(null)
    setProgress(null)
    try {
      setResult(
        await window.electronAPI.batchExportProjects({
          projectIds: selectedProjects.map((project) => project.id),
          outputDirectory,
          width: resolution.width,
          height: resolution.height,
          videoBitrate: resolution.bitrate,
          encoder,
        })
      )
    } catch (error) {
      setResult({
        completed: [],
        failed: [
          {
            projectId: 'batch',
            error: error instanceof Error ? error.message : String(error),
          },
        ],
        cancelled: false,
      })
    } finally {
      setIsExporting(false)
    }
  }

  const cancel = async () => {
    if (isExporting) {
      await window.electronAPI.cancelBatchExport()
      return
    }
    onClose()
  }

  const overallProgress = result
    ? 100
    : progress
      ? ((progress.projectIndex + progress.projectProgress / 100) /
          Math.max(1, progress.totalProjects)) *
        100
      : 0

  return (
    <div className="fixed inset-0 z-[300] bg-black/75 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#151821] shadow-2xl overflow-hidden">
        <div className="h-14 flex items-center justify-between px-5 border-b border-white/8">
          <div>
            <h2 className="text-sm font-semibold">Batch render projects</h2>
            <p className="text-[9px] text-slate-600 mt-0.5">
              Projects render sequentially to keep playback and memory stable.
            </p>
          </div>
          <button onClick={cancel} className="p-2 text-slate-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500">
              {selected.size} of {projects.length} selected
            </span>
            <button
              disabled={isExporting}
              onClick={() =>
                setSelected(
                  selected.size === projects.length
                    ? new Set()
                    : new Set(projects.map((project) => project.id))
                )
              }
              className="text-[10px] text-violet-300 hover:text-violet-200"
            >
              {selected.size === projects.length ? 'Clear all' : 'Select all'}
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto custom-scrollbar rounded-xl border border-white/8 divide-y divide-white/5">
            {projects.map((project) => {
              const checked = selected.has(project.id)
              return (
                <button
                  key={project.id}
                  disabled={isExporting}
                  onClick={() => toggle(project.id)}
                  className="w-full p-3 flex items-center gap-3 text-left hover:bg-white/[0.025] disabled:opacity-60"
                >
                  {checked ? (
                    <CheckSquare className="h-4 w-4 text-violet-400 shrink-0" />
                  ) : (
                    <Square className="h-4 w-4 text-slate-700 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] text-slate-200 truncate">
                      {project.name}
                    </span>
                    <span className="block mt-0.5 text-[9px] text-slate-600">
                      {project.sceneCount} scenes · {Math.round(project.duration)}s
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-[10px] text-slate-500">
              Resolution
              <select
                value={resolutionIndex}
                disabled={isExporting}
                onChange={(event) => setResolutionIndex(Number(event.target.value))}
                className="mt-1.5 w-full h-9 rounded-lg border border-white/10 bg-[#0d0f14] px-3 text-xs"
              >
                {resolutions.map((option, index) => (
                  <option key={option.label} value={index}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] text-slate-500">
              Encoder
              <select
                value={encoder}
                disabled={isExporting}
                onChange={(event) => setEncoder(event.target.value as ExportEncoder)}
                className="mt-1.5 w-full h-9 rounded-lg border border-white/10 bg-[#0d0f14] px-3 text-xs"
              >
                {capabilities?.nvenc && <option value="nvenc">NVIDIA NVENC</option>}
                <option value="cpu">CPU · H.264</option>
              </select>
            </label>
          </div>
          {encoder === 'nvenc' && (
            <div className="text-[9px] text-emerald-400/80">
              h264_nvenc was verified with a real test frame. Batch export will not
              silently fall back to CPU encoding.
            </div>
          )}
          {capabilities && !capabilities.nvenc && capabilities.nvencReason && (
            <div className="text-[9px] text-amber-400/80 break-words">
              {capabilities.nvencReason}
            </div>
          )}

          <div>
            <label className="text-[10px] text-slate-500">Output folder</label>
            <div className="mt-1.5 flex gap-2">
              <div className="h-9 flex-1 min-w-0 rounded-lg border border-white/10 bg-[#0d0f14] px-3 flex items-center text-[10px] text-slate-400 truncate">
                {outputDirectory || 'Choose a folder for all rendered MP4 files'}
              </div>
              <button
                disabled={isExporting}
                onClick={chooseDirectory}
                className="h-9 px-3 rounded-lg bg-white/5 hover:bg-white/10 flex items-center gap-2 text-[10px]"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Browse
              </button>
            </div>
          </div>

          {(isExporting || progress || result) && (
            <div className="rounded-xl border border-white/8 bg-black/15 p-3">
              <div className="h-2 rounded-full bg-black/30 overflow-hidden">
                <div
                  className="h-full bg-violet-500 transition-[width]"
                  style={{ width: `${Math.max(0, Math.min(100, overallProgress))}%` }}
                />
              </div>
              <div className="mt-2 text-[10px] text-slate-400 truncate">
                {result
                  ? `${result.completed.length} completed · ${result.failed.length} failed${
                      result.cancelled ? ' · cancelled' : ''
                    }`
                  : progress
                    ? `${progress.projectName} · ${progress.status} ${Math.round(
                        progress.projectProgress
                      )}%`
                    : 'Preparing batch…'}
              </div>
              {progress?.message && (
                <div className="mt-1 text-[9px] text-slate-600 truncate">
                  {progress.message}
                </div>
              )}
              {result?.failed[0] && (
                <div className="mt-1 text-[9px] text-red-300/80 break-words">
                  {result.failed[0].error}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-white/8 bg-black/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[9px] text-slate-600">
            <Cpu className="h-3.5 w-3.5" />
            {capabilities?.gpuNames.join(' · ') || 'CPU rendering available'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={cancel}
              className="h-9 px-4 rounded-lg bg-white/5 hover:bg-white/10 text-xs"
            >
              {isExporting ? 'Cancel batch' : 'Close'}
            </button>
            <button
              onClick={start}
              disabled={
                isExporting || !outputDirectory || selectedProjects.length === 0
              }
              className="h-9 px-5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-600 text-xs"
            >
              {isExporting ? 'Rendering…' : `Render ${selectedProjects.length} projects`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
