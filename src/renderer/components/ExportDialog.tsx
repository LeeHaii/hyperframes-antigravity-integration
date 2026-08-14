import React, { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Cpu, FolderOpen, MonitorUp, X } from 'lucide-react'
import { EncoderCapabilities, ExportEncoder } from '../../types/editor'
import { useEditorStore } from '../../store/useEditorStore'

const resolutionOptions = [
  { label: '720p HD', width: 1280, height: 720, bitrate: '5M' },
  { label: '1080p Full HD', width: 1920, height: 1080, bitrate: '10M' },
  { label: '1440p QHD', width: 2560, height: 1440, bitrate: '16M' },
  { label: '2160p 4K', width: 3840, height: 2160, bitrate: '35M' },
]

export default function ExportDialog({ onClose }: { onClose: () => void }) {
  const {
    projectName,
    scenes,
    videoTracks,
    voiceTrackSettings,
    audioTrackSettings,
    subtitles,
    audioFile,
    audioClips,
    subtitleSettings,
    exportProgress,
    setExportProgress,
  } = useEditorStore(
    useShallow((state) => ({
      projectName: state.projectName,
      scenes: state.scenes,
      videoTracks: state.videoTracks,
      voiceTrackSettings: state.voiceTrackSettings,
      audioTrackSettings: state.audioTrackSettings,
      subtitles: state.subtitles,
      audioFile: state.audioFile,
      audioClips: state.audioClips,
      subtitleSettings: state.subtitleSettings,
      exportProgress: state.exportProgress,
      setExportProgress: state.setExportProgress,
    }))
  )
  const [name, setName] = useState(projectName.trim() || 'AI Video')
  const [outputPath, setOutputPath] = useState('')
  const [resolutionIndex, setResolutionIndex] = useState(1)
  const [videoBitrate, setVideoBitrate] = useState('10M')
  const [encoder, setEncoder] = useState<ExportEncoder>('cpu')
  const [capabilities, setCapabilities] = useState<EncoderCapabilities | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [status, setStatus] = useState('')
  const resolution = resolutionOptions[resolutionIndex]

  useEffect(() => {
    window.electronAPI.getEncoderCapabilities().then((detected) => {
      setCapabilities(detected)
      if (detected.nvenc) setEncoder('nvenc')
    })
    window.electronAPI.onExportProgress((progress) => setExportProgress(progress))
  }, [setExportProgress])

  const encoderSummary = useMemo(() => {
    if (!capabilities) return 'Checking your graphics hardware…'
    if (capabilities.gpuNames.length === 0) return 'No dedicated GPU detected'
    return capabilities.gpuNames.join(' · ')
  }, [capabilities])

  const choosePath = async () => {
    const selected = await window.electronAPI.chooseExportPath(`${safeName(name)}.mp4`)
    if (selected) setOutputPath(selected)
  }

  const startExport = async () => {
    if (!audioFile || !outputPath) return
    setIsExporting(true)
    setExportProgress(0)
    setStatus(
      encoder === 'nvenc'
        ? 'Preparing render with verified NVIDIA NVENC…'
        : 'Preparing CPU render…'
    )
    try {
      const renderedPath = await window.electronAPI.exportVideo({
        scenes,
        audioPath: audioFile.path,
        audioClips,
        subtitleSettings,
        subtitles,
        videoTracks,
        voiceTrackSettings,
        audioTrackSettings,
        outputPath,
        width: resolution.width,
        height: resolution.height,
        videoBitrate,
        encoder,
      })
      setStatus(`Export complete: ${renderedPath}`)
      setExportProgress(100)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatus(/cancel/i.test(message) ? 'Export cancelled.' : `Export failed: ${message}`)
    } finally {
      setIsExporting(false)
    }
  }

  const cancel = async () => {
    if (!isExporting) {
      onClose()
      return
    }
    setStatus('Cancelling…')
    await window.electronAPI.cancelExport()
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#151821] shadow-2xl overflow-hidden">
        <div className="h-14 flex items-center justify-between px-5 border-b border-white/8">
          <div className="flex items-center gap-2">
            <MonitorUp className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-semibold">Export video</h2>
          </div>
          <button
            onClick={cancel}
            className="p-2 text-slate-500 hover:text-white rounded-lg hover:bg-white/5"
            title={isExporting ? 'Cancel export' : 'Close'}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[10px] text-slate-500">
              File name
              <input
                value={name}
                disabled={isExporting}
                onChange={(event) => setName(event.target.value)}
                className="mt-1.5 w-full h-9 rounded-lg border border-white/10 bg-[#0d0f14] px-3 text-xs text-white outline-none focus:border-violet-500/50"
              />
            </label>
            <label className="text-[10px] text-slate-500">
              Resolution
              <select
                value={resolutionIndex}
                disabled={isExporting}
                onChange={(event) => {
                  const index = Number(event.target.value)
                  setResolutionIndex(index)
                  setVideoBitrate(resolutionOptions[index].bitrate)
                }}
                className="mt-1.5 w-full h-9 rounded-lg border border-white/10 bg-[#0d0f14] px-3 text-xs text-white"
              >
                {resolutionOptions.map((option, index) => (
                  <option key={option.label} value={index}>
                    {option.label} · {option.width}×{option.height}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <label className="text-[10px] text-slate-500">Export path</label>
            <div className="mt-1.5 flex gap-2">
              <div className="flex-1 min-w-0 h-9 rounded-lg border border-white/10 bg-[#0d0f14] px-3 flex items-center text-[10px] text-slate-400 truncate">
                {outputPath || 'Choose where to save the MP4 file'}
              </div>
              <button
                onClick={choosePath}
                disabled={isExporting}
                className="h-9 px-3 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 flex items-center gap-2 text-[10px]"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Browse
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-[10px] text-slate-500">
              Video bitrate
              <select
                value={videoBitrate}
                disabled={isExporting}
                onChange={(event) => setVideoBitrate(event.target.value)}
                className="mt-1.5 w-full h-9 rounded-lg border border-white/10 bg-[#0d0f14] px-3 text-xs text-white"
              >
                {['4M', '5M', '8M', '10M', '12M', '16M', '20M', '35M', '50M'].map(
                  (value) => (
                    <option key={value} value={value}>
                      {value.replace('M', ' Mbps')}
                    </option>
                  )
                )}
              </select>
            </label>
            <label className="text-[10px] text-slate-500">
              Encoder
              <select
                value={encoder}
                disabled={isExporting}
                onChange={(event) => setEncoder(event.target.value as ExportEncoder)}
                className="mt-1.5 w-full h-9 rounded-lg border border-white/10 bg-[#0d0f14] px-3 text-xs text-white"
              >
                {capabilities?.nvenc && <option value="nvenc">NVIDIA NVENC</option>}
                <option value="cpu">CPU · H.264 software</option>
              </select>
            </label>
          </div>

          <div className="rounded-lg border border-white/5 bg-black/15 p-3 flex gap-3">
            <Cpu className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-[10px] text-slate-300 truncate">{encoderSummary}</div>
              {capabilities?.amdGpuDetected && !capabilities.nvenc && (
                <div className="text-[9px] text-amber-400/80 mt-1">
                  AMD GPU detected. The bundled renderer does not provide AMF, so CPU is
                  selected automatically.
                </div>
              )}
              {encoder === 'nvenc' && (
                <div className="text-[9px] text-emerald-400/80 mt-1">
                  h264_nvenc passed a real encode test. Export will stop with an error
                  instead of falling back to CPU encoding.
                </div>
              )}
              {capabilities && !capabilities.nvenc && capabilities.nvencReason && (
                <div className="text-[9px] text-amber-400/80 mt-1 break-words">
                  {capabilities.nvencReason}
                </div>
              )}
              <div className="text-[9px] text-slate-600 mt-1">
                Chromium still uses CPU to draw composition frames; NVENC accelerates the
                H.264 encoding stage.
              </div>
            </div>
          </div>

          {(isExporting || exportProgress !== null || status) && (
            <div>
              <div className="h-2 rounded-full bg-black/30 overflow-hidden">
                <div
                  className="h-full bg-violet-500 transition-[width]"
                  style={{ width: `${Math.max(0, Math.min(100, exportProgress || 0))}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between gap-3 text-[10px]">
                <span className="text-slate-500 truncate">{status || 'Rendering…'}</span>
                <span className="text-slate-300">{Math.round(exportProgress || 0)}%</span>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-white/8 bg-black/10 flex justify-end gap-2">
          <button
            onClick={cancel}
            className="h-9 px-4 rounded-lg bg-white/5 hover:bg-white/10 text-xs"
          >
            {isExporting ? 'Cancel export' : 'Close'}
          </button>
          <button
            onClick={startExport}
            disabled={isExporting || !outputPath || scenes.length === 0}
            className="h-9 px-5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-600 text-xs font-medium"
          >
            {isExporting ? `Exporting ${Math.round(exportProgress || 0)}%` : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}

function safeName(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'AI Video'
}
