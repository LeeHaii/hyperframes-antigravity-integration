import React, { DragEvent, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, AudioLines, FileAudio, FolderOpen, KeyRound, Sparkles, Video } from 'lucide-react'
import {
  extendVisualScenesAcrossSpeechGaps,
  getProjectDocument,
  useEditorStore,
} from '../../store/useEditorStore'

type FileWithPath = File & { path?: string }

export default function NewProject() {
  const {
    projectName,
    audioFile,
    apiKeys,
    setApiKeys,
    setScreen,
    beginProject,
    setScenes,
    setIsProcessingAudio,
    setProcessingError,
    setProcessingStage,
    setProcessingProgress,
    setEditorNotice,
  } = useEditorStore()
  const [name, setName] = useState(projectName || `My video ${new Date().toLocaleDateString()}`)
  const [selectedAudio, setSelectedAudio] = useState(audioFile)
  const [isDragging, setIsDragging] = useState(false)
  const [autoStockEnabled, setAutoStockEnabled] = useState(true)

  useEffect(() => {
    window.electronAPI
      .getAppSettings()
      .then((settings) => setAutoStockEnabled(settings.autoStockEnabled))
    window.electronAPI.onTranscriptionProgress((progress) => {
      setProcessingProgress({
        completed: progress.completed,
        total: progress.total,
        matched: 0,
        message: progress.message,
      })
    })
    window.electronAPI.onPexelsAutoMatchProgress((progress) => {
      setProcessingProgress({
        completed: progress.completed,
        total: progress.total,
        matched: progress.matched,
        message: 'Searching Pexels for each scene',
      })
    })
  }, [setProcessingProgress])

  const fileName = useMemo(
    () => selectedAudio?.path.split(/[\\/]/).pop() || '',
    [selectedAudio]
  )

  const browse = async () => {
    const file = await window.electronAPI.openAudioFile()
    if (file) setSelectedAudio(file)
  }

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files[0] as FileWithPath | undefined
    if (!file?.path) return
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!extension || !['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'webm'].includes(extension)) {
      alert('Please drop a supported audio file.')
      return
    }
    setSelectedAudio({
      path: file.path,
      duration: (await window.electronAPI.getMediaDuration(file.path)) || 0,
    })
  }

  const createProject = async () => {
    if (!selectedAudio) {
      alert('Choose a voiceover first.')
      return
    }
    if (!apiKeys.groq.trim()) {
      alert('Enter a Groq API key to transcribe your voiceover.')
      return
    }
    if (autoStockEnabled && !apiKeys.pexels.trim()) {
      alert('Enter a Pexels API key, or turn off automatic stock footage.')
      return
    }

    await window.electronAPI.setGroqKey(apiKeys.groq.trim())
    if (autoStockEnabled) {
      await window.electronAPI.setPexelsKey(apiKeys.pexels.trim())
    }
    beginProject(name, selectedAudio)
    setProcessingProgress({
      completed: 0,
      total: 0,
      matched: 0,
      message: 'Analyzing voiceover',
    })

    try {
      const result = await window.electronAPI.transcribeAudio(selectedAudio.path, apiKeys.groq)
      const subtitleTimingScenes = result.map((scene, index) => ({
        ...scene,
        id: scene.id || `scene_${index + 1}`,
        media: scene.media || null,
      }))
      if (subtitleTimingScenes.length === 0) {
        throw new Error('Groq Whisper returned an empty transcript.')
      }
      const measuredDuration =
        selectedAudio.duration ||
        subtitleTimingScenes.reduce(
          (maximum, scene) => Math.max(maximum, scene.endTimeSec),
          0
        )
      let scenes = extendVisualScenesAcrossSpeechGaps(
        subtitleTimingScenes,
        measuredDuration
      )
      if (autoStockEnabled) {
        setProcessingStage('matching-stock')
        setProcessingProgress({
          completed: 0,
          total: scenes.length,
          matched: 0,
          message: 'Searching Pexels for each scene',
        })
        try {
          const stockResult = await window.electronAPI.autoMatchPexelsVideos(
            scenes,
            apiKeys.pexels
          )
          scenes = stockResult.scenes
          setEditorNotice(
            stockResult.unmatchedCount === 0
              ? `Pexels matched all ${stockResult.matchedCount} scenes automatically.`
              : `Pexels matched ${stockResult.matchedCount} of ${scenes.length} scenes. Unmatched scenes are ready for manual media.`
          )
        } catch (stockError) {
          const message =
            stockError instanceof Error ? stockError.message : String(stockError)
          setEditorNotice(
            `Transcription succeeded, but automatic Pexels matching could not finish: ${message}`
          )
        }
      }
      setScenes(scenes, subtitleTimingScenes)
      setProcessingStage('saving')
      setIsProcessingAudio(false)
      setScreen('editor')
      const project = getProjectDocument()
      if (project) await window.electronAPI.saveProject(project)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      setIsProcessingAudio(false)
      setProcessingError(message)
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0d12] text-white flex flex-col">
      <header className="h-20 border-b border-white/5 flex items-center px-10">
        <button
          onClick={() => setScreen('projects')}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Projects
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <div className="h-12 w-12 rounded-2xl bg-violet-500/15 text-violet-300 flex items-center justify-center mx-auto mb-4">
              <AudioLines className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Create from voiceover</h1>
            <p className="text-slate-500 mt-2">
              Import narration and Rhymx will build timed scenes and subtitles.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#12141b] p-6">
            <label className="block text-xs font-medium text-slate-400 mb-2">Project name</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#0c0e13] px-4 py-3 text-sm outline-none focus:border-violet-500/60 mb-5"
            />

            <div
              onDragOver={(event) => {
                event.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={`rounded-2xl border-2 border-dashed px-8 py-10 text-center transition-colors ${
                isDragging
                  ? 'border-violet-400 bg-violet-500/10'
                  : selectedAudio
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-white/10 bg-white/[0.015]'
              }`}
            >
              {selectedAudio ? (
                <>
                  <FileAudio className="h-9 w-9 text-emerald-400 mx-auto mb-3" />
                  <div className="font-medium text-sm truncate">{fileName}</div>
                  <div className="text-xs text-slate-500 mt-1">Voiceover ready</div>
                </>
              ) : (
                <>
                  <FolderOpen className="h-9 w-9 text-slate-500 mx-auto mb-3" />
                  <div className="text-sm font-medium">Drag your voiceover here</div>
                  <div className="text-xs text-slate-500 mt-1">MP3, WAV, M4A, AAC, FLAC, OGG or WebM</div>
                </>
              )}
              <button
                onClick={browse}
                className="mt-5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs transition-colors"
              >
                {selectedAudio ? 'Choose another file' : 'Browse files'}
              </button>
            </div>

            <div className="mt-5">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-2">
                <KeyRound className="h-3.5 w-3.5" />
                Groq API key
              </label>
              <input
                type="password"
                value={apiKeys.groq}
                onChange={(event) => setApiKeys({ groq: event.target.value })}
                placeholder="gsk_…"
                className="w-full rounded-xl border border-white/10 bg-[#0c0e13] px-4 py-3 text-sm outline-none focus:border-violet-500/60"
              />
              <p className="text-[11px] text-slate-600 mt-2">
                Encrypted by the desktop app and sent only to Groq for transcription and scene keywords.
              </p>
            </div>

            <div className="mt-5 rounded-xl border border-white/8 bg-black/15 p-4">
              <label className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Video className="h-4 w-4 text-violet-400 mt-0.5" />
                  <div>
                    <div className="text-xs font-medium text-slate-300">
                      Automatically add Pexels stock video
                    </div>
                    <div className="text-[10px] text-slate-600 mt-1">
                      Matches each timed scene using Groq’s recommended search keywords.
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={autoStockEnabled}
                  onChange={(event) => setAutoStockEnabled(event.target.checked)}
                  className="h-4 w-4 accent-violet-500"
                />
              </label>
              {autoStockEnabled && (
                <label className="block mt-4 text-[10px] text-slate-500">
                  Pexels API key
                  <input
                    type="password"
                    value={apiKeys.pexels}
                    onChange={(event) => setApiKeys({ pexels: event.target.value })}
                    placeholder="Required for automatic stock footage"
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0c0e13] px-4 py-3 text-sm outline-none focus:border-violet-500/60"
                  />
                  <span className="mt-1.5 block text-[9px] text-slate-600">
                    Pexels and its contributors are credited in the scene inspector.
                  </span>
                </label>
              )}
            </div>

            <button
              onClick={createProject}
              disabled={
                !selectedAudio ||
                !apiKeys.groq.trim() ||
                (autoStockEnabled && !apiKeys.pexels.trim())
              }
              className="mt-6 w-full rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed py-3.5 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              Create and transcribe
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
