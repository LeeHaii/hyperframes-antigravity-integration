import React from 'react'
import { AlertTriangle, AudioLines, Check, LoaderCircle } from 'lucide-react'
import { useEditorStore } from '../../store/useEditorStore'

export default function TranscribingScreen() {
  const {
    projectName,
    audioFile,
    processingError,
    processingStage,
    processingProgress,
    setScreen,
    setProcessingError,
  } = useEditorStore()
  const fileName = audioFile?.path.split(/[\\/]/).pop()

  if (processingError) {
    return (
      <div className="min-h-screen bg-[#0b0d12] text-white flex items-center justify-center p-8">
        <div className="w-full max-w-lg rounded-2xl border border-red-500/20 bg-[#141217] p-8 text-center">
          <div className="h-12 w-12 rounded-2xl bg-red-500/10 text-red-400 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold">Transcription failed</h1>
          <p className="mt-3 text-sm text-red-200/80 bg-red-950/30 rounded-xl p-4 text-left break-words">
            {processingError}
          </p>
          <button
            onClick={() => {
              setProcessingError(null)
              setScreen('new-project')
            }}
            className="mt-6 rounded-xl bg-white/10 hover:bg-white/15 px-5 py-2.5 text-sm transition-colors"
          >
            Back and try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0b0d12] text-white flex items-center justify-center p-8">
      <div className="w-full max-w-xl text-center">
        <div className="relative h-24 w-24 mx-auto mb-8">
          <div className="absolute inset-0 rounded-full bg-violet-500/15 animate-ping" />
          <div className="absolute inset-2 rounded-full bg-[#171522] border border-violet-500/30 flex items-center justify-center">
            <AudioLines className="h-9 w-9 text-violet-300" />
          </div>
          <LoaderCircle className="absolute -inset-1 h-[104px] w-[104px] text-violet-500 animate-spin opacity-70" />
        </div>
        <h1 className="text-2xl font-semibold">Building {projectName}</h1>
        <p className="text-slate-500 mt-2 truncate">{fileName}</p>

        <div className="mt-10 rounded-2xl border border-white/8 bg-[#12141b] p-5 text-left space-y-4">
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <Check className="h-4 w-4 text-emerald-400" />
            Voiceover uploaded
          </div>
          <div className="flex items-center gap-3 text-sm text-white">
            {processingStage === 'transcribing' ? (
              <LoaderCircle className="h-4 w-4 text-violet-400 animate-spin" />
            ) : (
              <Check className="h-4 w-4 text-emerald-400" />
            )}
            <span className="flex-1">
              Transcribing speech and checking for omissions
              {processingStage === 'transcribing' && processingProgress.message && (
                <span className="block text-[10px] text-slate-500 mt-0.5">
                  {processingProgress.message}
                </span>
              )}
            </span>
          </div>
          {processingStage === 'transcribing' && processingProgress.total > 0 && (
            <div className="h-1.5 rounded-full bg-black/30 overflow-hidden">
              <div
                className="h-full bg-violet-500 transition-[width]"
                style={{
                  width: `${
                    (processingProgress.completed / processingProgress.total) * 100
                  }%`,
                }}
              />
            </div>
          )}
          <div
            className={`flex items-center gap-3 text-sm ${
              processingStage === 'transcribing' ? 'text-slate-600' : 'text-white'
            }`}
          >
            {processingStage === 'matching-stock' ? (
              <LoaderCircle className="h-4 w-4 text-violet-400 animate-spin" />
            ) : processingStage === 'saving' ? (
              <Check className="h-4 w-4 text-emerald-400" />
            ) : (
              <div className="h-4 w-4 rounded-full border border-slate-700" />
            )}
            <span className="flex-1">
              Matching scenes with Pexels stock footage
              {processingStage === 'matching-stock' && processingProgress.total > 0 && (
                <span className="block text-[10px] text-slate-500 mt-0.5">
                  {processingProgress.completed}/{processingProgress.total} searched ·{' '}
                  {processingProgress.matched} matched
                </span>
              )}
            </span>
          </div>
          {processingStage === 'matching-stock' && processingProgress.total > 0 && (
            <div className="h-1.5 rounded-full bg-black/30 overflow-hidden">
              <div
                className="h-full bg-violet-500 transition-[width]"
                style={{
                  width: `${
                    (processingProgress.completed / processingProgress.total) * 100
                  }%`,
                }}
              />
            </div>
          )}
          <div
            className={`flex items-center gap-3 text-sm ${
              processingStage === 'saving' ? 'text-white' : 'text-slate-600'
            }`}
          >
            {processingStage === 'saving' ? (
              <LoaderCircle className="h-4 w-4 text-violet-400 animate-spin" />
            ) : (
              <div className="h-4 w-4 rounded-full border border-slate-700" />
            )}
            Creating synchronized subtitles and saving project
          </div>
        </div>
        <p className="text-xs text-slate-600 mt-5">Keep this window open while Groq Whisper processes the audio.</p>
      </div>
    </div>
  )
}
