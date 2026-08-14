import React from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useEditorStore } from '../../store/useEditorStore'

const FPS = 30

export type PreviewQuality = 'low' | 'medium' | 'high' | 'ultra'

const RESOLUTION_LABELS: Record<PreviewQuality, string> = {
  low: '360p',
  medium: '720p',
  high: '1080p',
  ultra: '2160p',
}

function formatTime(value: number) {
  const safe = Math.max(0, value)
  const minutes = Math.floor(safe / 60)
  const seconds = Math.floor(safe % 60)
  const frames = Math.floor((safe % 1) * FPS)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`
}

export default function PlaybackController({
  startSec = 0,
  endSec,
  quality,
  onQualityChange,
  zoom,
  onZoomChange,
}: {
  startSec?: number
  endSec: number
  quality: PreviewQuality
  onQualityChange: (quality: PreviewQuality) => void
  zoom: 'fit' | number
  onZoomChange: (zoom: 'fit' | number) => void
}) {
  const { currentTimeSec, isPlaying, requestSeek, requestPlayback } = useEditorStore(
    useShallow((state) => ({
      currentTimeSec: state.currentTimeSec,
      isPlaying: state.isPlaying,
      requestSeek: state.requestSeek,
      requestPlayback: state.requestPlayback,
    }))
  )
  const clampedTime = Math.max(startSec, Math.min(endSec, currentTimeSec))
  const duration = Math.max(1 / FPS, endSec - startSec)

  const seekRelative = (difference: number) =>
    requestSeek(Math.max(startSec, Math.min(endSec, clampedTime + difference)))

  return (
    <div className="w-full rounded-xl border border-white/[0.08] bg-[#10151e]/95 px-3 py-2 shadow-xl shadow-black/25">
      <input
        aria-label="Playback position"
        type="range"
        min={startSec}
        max={endSec}
        step={1 / FPS}
        value={clampedTime}
        onChange={(event) => requestSeek(Number(event.target.value))}
        className="mb-2 h-1 w-full cursor-pointer accent-[#79f2c0]"
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => seekRelative(-5)}
            className="playback-button"
            title="Back 5 seconds"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            onClick={() => seekRelative(-1 / FPS)}
            className="playback-button"
            title="Previous frame"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => requestPlayback('toggle')}
            className="mx-1 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-950 transition hover:scale-105"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
          </button>
          <button
            onClick={() => seekRelative(1 / FPS)}
            className="playback-button"
            title="Next frame"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => seekRelative(5)}
            className="playback-button"
            title="Forward 5 seconds"
          >
            <RotateCw className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <div className="hidden rounded-md bg-black/45 px-2 py-1 font-mono text-[10px] text-slate-300 sm:block">
            {formatTime(clampedTime - startSec)}
            <span className="mx-1 text-slate-600">/</span>
            {formatTime(duration)}
          </div>
          <label className="flex items-center gap-1.5 text-[9px] text-slate-500" title="Preview resolution">
            <span className="hidden lg:inline">Resolution</span>
            <select
              aria-label="Preview resolution"
              value={quality}
              onChange={(event) => onQualityChange(event.target.value as PreviewQuality)}
              className="rounded-md border border-white/10 bg-[#0a0e15] px-1.5 py-1 text-[10px] text-slate-300 outline-none"
            >
              {(Object.keys(RESOLUTION_LABELS) as PreviewQuality[]).map((value) => (
                <option key={value} value={value}>{RESOLUTION_LABELS[value]}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center rounded-md border border-white/10 bg-[#0a0e15]">
            <button
              onClick={() => onZoomChange(Math.max(25, (zoom === 'fit' ? 100 : zoom) - 25))}
              className="p-1.5 text-slate-500 hover:text-white"
              title="Zoom preview out"
            >
              <Minus className="h-3 w-3" />
            </button>
            <select
              aria-label="Preview zoom"
              value={String(zoom)}
              onChange={(event) => onZoomChange(event.target.value === 'fit' ? 'fit' : Number(event.target.value))}
              className="w-[54px] bg-transparent text-center text-[9px] text-slate-400 outline-none"
            >
              <option value="fit">Fit</option>
              {[25, 50, 75, 100, 125, 150, 200].map((value) => (
                <option key={value} value={value}>{value}%</option>
              ))}
            </select>
            <button
              onClick={() => onZoomChange(Math.min(200, (zoom === 'fit' ? 100 : zoom) + 25))}
              className="p-1.5 text-slate-500 hover:text-white"
              title="Zoom preview in"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
