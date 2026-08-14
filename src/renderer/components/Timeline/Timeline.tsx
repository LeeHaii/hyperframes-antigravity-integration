import React, { PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  Captions,
  Eye,
  EyeOff,
  Layers3,
  Magnet,
  Mic2,
  Minus,
  Music2,
  Plus,
  Scissors,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { LibraryAsset, SceneSegment } from '../../../types/editor'
import { useEditorStore } from '../../../store/useEditorStore'

const VOICE_HEIGHT = 36
const VIDEO_HEIGHT = 54
const TEXT_HEIGHT = 40
const AUDIO_HEIGHT = 40
const FPS = 30
const MIN_CLIP_DURATION = 1 / FPS

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  const remaining = safe % 60
  return `${minutes}:${remaining.toFixed(2).padStart(5, '0')}`
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value))
const toFrame = (seconds: number) => Math.round(seconds * FPS) / FPS

function TimelineClock({ totalDuration }: { totalDuration: number }) {
  const currentTimeSec = useEditorStore((state) => state.currentTimeSec)
  return (
    <div className="text-[10px] text-slate-500 font-mono">
      {formatTime(currentTimeSec)} / {formatTime(totalDuration)}
    </div>
  )
}

function TimelinePlayhead({
  totalDuration,
  onPointerDown,
}: {
  totalDuration: number
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
}) {
  const currentTimeSec = useEditorStore((state) => state.currentTimeSec)
  return (
    <div
      onPointerDown={onPointerDown}
      className="absolute top-0 bottom-0 w-3 -translate-x-1/2 z-50 cursor-ew-resize group will-change-[left]"
      style={{
        left: `${clamp(currentTimeSec / Math.max(totalDuration, 0.001), 0, 1) * 100}%`,
      }}
      title="Drag playhead"
    >
      <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-px bg-rose-500" />
      <div className="absolute -top-1 left-1/2 -translate-x-1/2 h-2.5 w-2.5 rotate-45 bg-rose-500 rounded-sm group-hover:scale-125" />
    </div>
  )
}

function SplitSceneButton() {
  const { activeSceneId, scenes, currentTimeSec, splitScene } = useEditorStore(
    useShallow((state) => ({
      activeSceneId: state.activeSceneId,
      scenes: state.scenes,
      currentTimeSec: state.currentTimeSec,
      splitScene: state.splitScene,
    }))
  )
  const activeScene = scenes.find((scene) => scene.id === activeSceneId)
  const canSplit =
    Boolean(activeScene) &&
    currentTimeSec > (activeScene?.startTimeSec || 0) + 0.2 &&
    currentTimeSec < (activeScene?.endTimeSec || 0) - 0.2

  return (
    <button
      onClick={() => activeSceneId && splitScene(activeSceneId, currentTimeSec)}
      disabled={!canSplit}
      className="h-8 px-3 rounded-lg hover:bg-white/5 disabled:text-slate-700 text-slate-400 flex items-center gap-2 text-xs"
      title="Split selected scene at playhead (Ctrl+B)"
    >
      <Scissors className="h-3.5 w-3.5" />
      Split <kbd className="text-[9px] text-slate-600">Ctrl+B</kbd>
    </button>
  )
}

export default function Timeline() {
  const {
    scenes,
    videoTracks,
    voiceTrackSettings,
    audioTrackSettings,
    subtitles,
    audioClips,
    activeSceneId,
    activeAudioClipId,
    activeSubtitleId,
    setActiveSceneId,
    setActiveAudioClipId,
    setActiveSubtitleId,
    audioFile,
    requestSeek,
    trimScene,
    checkpointHistory,
    deleteScene,
    addVideoTrack,
    removeVideoTrack,
    updateVideoTrack,
    updateVoiceTrackSettings,
    updateAudioTrackSettings,
    addSceneFromAsset,
    addBlankScene,
    addAudioClip,
    moveScene,
    moveAudioClip,
    removeAudioClip,
    trimAudioClip,
  } = useEditorStore(
    useShallow((state) => ({
      scenes: state.scenes,
      videoTracks: state.videoTracks,
      voiceTrackSettings: state.voiceTrackSettings,
      audioTrackSettings: state.audioTrackSettings,
      subtitles: state.subtitles,
      audioClips: state.audioClips,
      activeSceneId: state.activeSceneId,
      activeAudioClipId: state.activeAudioClipId,
      activeSubtitleId: state.activeSubtitleId,
      setActiveSceneId: state.setActiveSceneId,
      setActiveAudioClipId: state.setActiveAudioClipId,
      setActiveSubtitleId: state.setActiveSubtitleId,
      audioFile: state.audioFile,
      requestSeek: state.requestSeek,
      trimScene: state.trimScene,
      checkpointHistory: state.checkpointHistory,
      deleteScene: state.deleteScene,
      addVideoTrack: state.addVideoTrack,
      removeVideoTrack: state.removeVideoTrack,
      updateVideoTrack: state.updateVideoTrack,
      updateVoiceTrackSettings: state.updateVoiceTrackSettings,
      updateAudioTrackSettings: state.updateAudioTrackSettings,
      addSceneFromAsset: state.addSceneFromAsset,
      addBlankScene: state.addBlankScene,
      addAudioClip: state.addAudioClip,
      moveScene: state.moveScene,
      moveAudioClip: state.moveAudioClip,
      removeAudioClip: state.removeAudioClip,
      trimAudioClip: state.trimAudioClip,
    }))
  )
  const trackRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(() => {
    const savedZoom = Number(localStorage.getItem('rhymx.timelineZoom') || 100)
    return Number.isFinite(savedZoom) ? clamp(savedZoom, 100, 2000) : 100
  })
  const [snapEnabled, setSnapEnabled] = useState(
    () => localStorage.getItem('rhymx.timelineSnap') !== 'false'
  )
  const [snapGuideSec, setSnapGuideSec] = useState<number | null>(null)

  useEffect(() => {
    localStorage.setItem('rhymx.timelineZoom', String(zoom))
  }, [zoom])

  useEffect(() => {
    const onTimelineZoom = (event: Event) => {
      const action = (
        event as CustomEvent<{ action?: 'in' | 'out' | 'reset' }>
      ).detail?.action
      setZoom((value) =>
        action === 'reset'
          ? 100
          : clamp(value + (action === 'out' ? -50 : 50), 100, 2000)
      )
    }
    window.addEventListener('rhymx:timeline-zoom', onTimelineZoom)
    return () => window.removeEventListener('rhymx:timeline-zoom', onTimelineZoom)
  }, [])

  const totalDuration = useMemo(() => {
    const sceneEnd = scenes.reduce((max, scene) => Math.max(max, scene.endTimeSec), 0)
    const subtitleEnd = subtitles.reduce(
      (max, subtitle) => Math.max(max, subtitle.endTimeSec),
      0
    )
    const audioEnd = audioClips.reduce(
      (max, clip) => Math.max(max, clip.startTimeSec + clip.durationSec),
      0
    )
    return Math.max(audioFile?.duration || 0, sceneEnd, subtitleEnd, audioEnd, 10)
  }, [audioFile?.duration, scenes, subtitles, audioClips])

  const subtitleTop = VOICE_HEIGHT + videoTracks.length * VIDEO_HEIGHT
  const audioTop = subtitleTop + TEXT_HEIGHT
  const bodyHeight = audioTop + AUDIO_HEIGHT
  const rulerDivisions = Math.max(10, Math.round(zoom / 10))
  const left = (seconds: number) => `${(seconds / totalDuration) * 100}%`
  const width = (seconds: number) => `${Math.max(0.12, (seconds / totalDuration) * 100)}%`

  const snapCandidates = useMemo(
    () =>
      Array.from(
        new Set(
          [
            0,
            ...scenes.flatMap((scene) => [scene.startTimeSec, scene.endTimeSec]),
            ...subtitles.flatMap((subtitle) => [
              subtitle.startTimeSec,
              subtitle.endTimeSec,
            ]),
            ...audioClips.flatMap((clip) => [
              clip.startTimeSec,
              clip.startTimeSec + clip.durationSec,
            ]),
          ].map(toFrame)
        )
      ),
    [scenes, subtitles, audioClips]
  )

  const snapValue = (
    value: number,
    rectangleWidth: number,
    candidates = snapCandidates
  ) => {
    if (!snapEnabled) return { value: toFrame(value), guide: null as number | null }
    const threshold = (8 / Math.max(1, rectangleWidth)) * totalDuration
    const closest = candidates.reduce<number | null>((best, candidate) => {
      if (Math.abs(candidate - value) > threshold) return best
      if (best === null || Math.abs(candidate - value) < Math.abs(best - value)) {
        return candidate
      }
      return best
    }, null)
    return {
      value: closest ?? toFrame(value),
      guide: closest,
    }
  }

  const snapClipStart = (
    value: number,
    duration: number,
    rectangleWidth: number,
    candidates: number[]
  ) => {
    if (!snapEnabled) return { value: toFrame(value), guide: null as number | null }
    const threshold = (8 / Math.max(1, rectangleWidth)) * totalDuration
    let bestOffset: number | null = null
    let guide: number | null = null
    for (const candidate of candidates) {
      for (const edge of [value, value + duration]) {
        const offset = candidate - edge
        if (
          Math.abs(offset) <= threshold &&
          (bestOffset === null || Math.abs(offset) < Math.abs(bestOffset))
        ) {
          bestOffset = offset
          guide = candidate
        }
      }
    }
    return {
      value: bestOffset === null ? toFrame(value) : value + bestOffset,
      guide,
    }
  }

  const seekAtClientX = (clientX: number, disableSnap = false) => {
    const rectangle = trackRef.current?.getBoundingClientRect()
    if (!rectangle) return
    const ratio = clamp((clientX - rectangle.left) / rectangle.width, 0, 1)
    const rawTime = ratio * totalDuration
    const snapped = disableSnap
      ? { value: toFrame(rawTime), guide: null }
      : snapValue(rawTime, rectangle.width)
    setSnapGuideSec(snapped.guide)
    requestSeek(snapped.value)
  }

  const beginScrub = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    seekAtClientX(event.clientX, event.altKey)
    const onMove = (moveEvent: globalThis.PointerEvent) =>
      seekAtClientX(moveEvent.clientX, moveEvent.altKey)
    const onUp = () => {
      setSnapGuideSec(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const startTrim = (
    event: PointerEvent<HTMLDivElement>,
    scene: SceneSegment,
    edge: 'start' | 'end'
  ) => {
    event.preventDefault()
    event.stopPropagation()
    const rectangle = trackRef.current?.getBoundingClientRect()
    if (!rectangle) return
    checkpointHistory()
    const pointerStart = event.clientX
    const originalStart = scene.startTimeSec
    const originalEnd = scene.endTimeSec
    const originalSourceStart = scene.media?.sourceStartSec ?? 0
    const sourceDuration = scene.media?.sourceDurationSec
    const isStillImage =
      scene.media?.type === 'local_image' ||
      scene.media?.type === 'google_image' ||
      scene.media?.type === 'duckduckgo_image'
    const hasSourceCap = Boolean(scene.media && !isStillImage && sourceDuration)
    const candidates = snapCandidates.filter(
      (candidate) =>
        Math.abs(candidate - originalStart) > 1 / FPS &&
        Math.abs(candidate - originalEnd) > 1 / FPS
    )

    const onMove = (moveEvent: globalThis.PointerEvent) => {
      const delta = ((moveEvent.clientX - pointerStart) / rectangle.width) * totalDuration
      if (edge === 'start') {
        const minimumStart = hasSourceCap
          ? Math.max(0, originalStart - originalSourceStart)
          : 0
        const rawStart = clamp(
          originalStart + delta,
          minimumStart,
          originalEnd - MIN_CLIP_DURATION
        )
        const snapped = moveEvent.altKey
          ? { value: toFrame(rawStart), guide: null }
          : snapValue(rawStart, rectangle.width, candidates)
        const nextStart = clamp(
          snapped.value,
          minimumStart,
          originalEnd - MIN_CLIP_DURATION
        )
        setSnapGuideSec(snapped.guide)
        trimScene(
          scene.id,
          nextStart,
          originalEnd,
          hasSourceCap
            ? Math.max(0, originalSourceStart + nextStart - originalStart)
            : undefined
        )
      } else {
        const maximumEnd = hasSourceCap
          ? originalStart + Math.max(0, (sourceDuration || 0) - originalSourceStart)
          : Number.POSITIVE_INFINITY
        const rawEnd = clamp(
          originalEnd + delta,
          originalStart + MIN_CLIP_DURATION,
          maximumEnd
        )
        const snapped = moveEvent.altKey
          ? { value: toFrame(rawEnd), guide: null }
          : snapValue(rawEnd, rectangle.width, candidates)
        const nextEnd = clamp(
          snapped.value,
          originalStart + MIN_CLIP_DURATION,
          maximumEnd
        )
        setSnapGuideSec(snapped.guide)
        trimScene(
          scene.id,
          originalStart,
          nextEnd,
          hasSourceCap ? originalSourceStart : undefined
        )
      }
    }
    const onUp = () => {
      setSnapGuideSec(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const startSceneDrag = (event: PointerEvent<HTMLDivElement>, scene: SceneSegment) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const rectangle = trackRef.current?.getBoundingClientRect()
    if (!rectangle) return
    setActiveSceneId(scene.id)
    const pointerX = event.clientX
    const pointerY = event.clientY
    const originalStart = scene.startTimeSec
    const candidates = snapCandidates.filter(
      (candidate) =>
        Math.abs(candidate - scene.startTimeSec) > 1 / FPS &&
        Math.abs(candidate - scene.endTimeSec) > 1 / FPS
    )
    let dragging = false

    const onMove = (moveEvent: globalThis.PointerEvent) => {
      if (!dragging && Math.hypot(moveEvent.clientX - pointerX, moveEvent.clientY - pointerY) > 3) {
        dragging = true
        checkpointHistory()
      }
      if (!dragging) return
      const deltaTime = ((moveEvent.clientX - pointerX) / rectangle.width) * totalDuration
      const rawStart = Math.max(0, originalStart + deltaTime)
      const snapped = moveEvent.altKey
        ? { value: toFrame(rawStart), guide: null }
        : snapClipStart(rawStart, scene.durationSec, rectangle.width, candidates)
      const newStart = Math.max(0, snapped.value)
      setSnapGuideSec(snapped.guide)
      const rawTrackIndex = Math.floor(
        (moveEvent.clientY - rectangle.top - VOICE_HEIGHT) / VIDEO_HEIGHT
      )
      const trackIndex = clamp(rawTrackIndex, 0, videoTracks.length - 1)
      moveScene(scene.id, newStart, videoTracks[trackIndex].id)
    }
    const onUp = (upEvent: globalThis.PointerEvent) => {
      if (!dragging) seekAtClientX(upEvent.clientX, upEvent.altKey)
      setSnapGuideSec(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const startAudioDrag = (
    event: PointerEvent<HTMLDivElement>,
    clipId: string,
    originalStart: number,
    durationSec: number
  ) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const rectangle = trackRef.current?.getBoundingClientRect()
    if (!rectangle) return
    setActiveAudioClipId(clipId)
    const pointerX = event.clientX
    const candidates = snapCandidates.filter(
      (candidate) =>
        Math.abs(candidate - originalStart) > 1 / FPS &&
        Math.abs(candidate - (originalStart + durationSec)) > 1 / FPS
    )
    let dragging = false
    const onMove = (moveEvent: globalThis.PointerEvent) => {
      if (!dragging && Math.abs(moveEvent.clientX - pointerX) > 3) {
        dragging = true
        checkpointHistory()
      }
      if (!dragging) return
      const deltaTime = ((moveEvent.clientX - pointerX) / rectangle.width) * totalDuration
      const rawStart = Math.max(0, originalStart + deltaTime)
      const snapped = moveEvent.altKey
        ? { value: toFrame(rawStart), guide: null }
        : snapClipStart(rawStart, durationSec, rectangle.width, candidates)
      setSnapGuideSec(snapped.guide)
      moveAudioClip(clipId, Math.max(0, snapped.value))
    }
    const onUp = () => {
      setSnapGuideSec(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const startAudioTrim = (
    event: PointerEvent<HTMLDivElement>,
    clip: (typeof audioClips)[number],
    edge: 'start' | 'end'
  ) => {
    event.preventDefault()
    event.stopPropagation()
    const rectangle = trackRef.current?.getBoundingClientRect()
    if (!rectangle) return
    checkpointHistory()
    setActiveAudioClipId(clip.id)
    const pointerStart = event.clientX
    const originalStart = clip.startTimeSec
    const originalDuration = clip.durationSec
    const originalEnd = originalStart + originalDuration
    const originalSourceStart = clip.sourceStartSec ?? 0
    const sourceDuration = clip.sourceDurationSec
    const candidates = snapCandidates.filter(
      (candidate) =>
        Math.abs(candidate - originalStart) > 1 / FPS &&
        Math.abs(candidate - originalEnd) > 1 / FPS
    )

    const onMove = (moveEvent: globalThis.PointerEvent) => {
      const delta = ((moveEvent.clientX - pointerStart) / rectangle.width) * totalDuration
      if (edge === 'start') {
        const minimumStart = Math.max(0, originalStart - originalSourceStart)
        const rawStart = clamp(
          originalStart + delta,
          minimumStart,
          originalEnd - MIN_CLIP_DURATION
        )
        const snapped = moveEvent.altKey
          ? { value: toFrame(rawStart), guide: null }
          : snapValue(rawStart, rectangle.width, candidates)
        const nextStart = clamp(
          snapped.value,
          minimumStart,
          originalEnd - MIN_CLIP_DURATION
        )
        setSnapGuideSec(snapped.guide)
        trimAudioClip(
          clip.id,
          nextStart,
          originalEnd - nextStart,
          Math.max(0, originalSourceStart + nextStart - originalStart)
        )
      } else {
        const maximumDuration = sourceDuration
          ? Math.max(MIN_CLIP_DURATION, sourceDuration - originalSourceStart)
          : Number.POSITIVE_INFINITY
        const rawEnd =
          originalStart +
          clamp(
            originalDuration + delta,
            MIN_CLIP_DURATION,
            maximumDuration
          )
        const snapped = moveEvent.altKey
          ? { value: toFrame(rawEnd), guide: null }
          : snapValue(rawEnd, rectangle.width, candidates)
        const nextEnd = clamp(
          snapped.value,
          originalStart + MIN_CLIP_DURATION,
          originalStart + maximumDuration
        )
        setSnapGuideSec(snapped.guide)
        trimAudioClip(
          clip.id,
          originalStart,
          nextEnd - originalStart,
          originalSourceStart
        )
      }
    }
    const onUp = () => {
      setSnapGuideSec(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const droppedAsset = (event: React.DragEvent<HTMLElement>): LibraryAsset | null => {
    try {
      const serialized = event.dataTransfer.getData('application/x-rhymx-media')
      return serialized ? (JSON.parse(serialized) as LibraryAsset) : null
    } catch {
      return null
    }
  }

  const dropTime = (clientX: number) => {
    const rectangle = trackRef.current?.getBoundingClientRect()
    if (!rectangle) return useEditorStore.getState().currentTimeSec
    const rawTime =
      clamp((clientX - rectangle.left) / rectangle.width, 0, 1) * totalDuration
    return snapValue(rawTime, rectangle.width).value
  }

  return (
    <div
      className="w-full h-full flex flex-col select-none"
      onWheel={(event) => {
        if (!(event.ctrlKey || event.metaKey)) return
        event.preventDefault()
        setZoom((value) =>
          clamp(value + (event.deltaY > 0 ? -50 : 50), 100, 2000)
        )
      }}
    >
      <div className="h-11 shrink-0 border-b border-white/5 flex items-center justify-between px-3">
        <div className="flex items-center gap-1">
          <SplitSceneButton />
          <button
            onClick={() => addBlankScene(videoTracks[0]?.id)}
            disabled={videoTracks.length === 0}
            className="h-8 px-3 rounded-lg hover:bg-emerald-400/10 hover:text-emerald-300 disabled:text-slate-700 text-slate-400 flex items-center gap-2 text-xs whitespace-nowrap"
            title="Create a blank five-second scene at the playhead"
          >
            <Square className="h-3.5 w-3.5" />
            Blank scene
          </button>
          <button
            onClick={() => activeSceneId && deleteScene(activeSceneId)}
            disabled={!activeSceneId}
            className="h-8 px-3 rounded-lg hover:bg-red-500/10 hover:text-red-400 disabled:text-slate-700 text-slate-400 flex items-center gap-2 text-xs whitespace-nowrap"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
          <button
            onClick={addVideoTrack}
            className="h-8 px-3 rounded-lg hover:bg-white/5 text-slate-400 flex items-center gap-2 text-xs whitespace-nowrap"
            title="Add an overlay video track"
          >
            <Layers3 className="h-3.5 w-3.5" />
            Add track
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const enabled = !snapEnabled
              setSnapEnabled(enabled)
              localStorage.setItem('rhymx.timelineSnap', String(enabled))
            }}
            className={`h-7 px-2 rounded-lg border flex items-center gap-1.5 text-[10px] ${
              snapEnabled
                ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
                : 'border-white/5 bg-black/20 text-slate-600'
            }`}
            title="Snap playhead and clip edges (hold Alt to bypass)"
          >
            <Magnet className="h-3 w-3" />
            Snap
          </button>
          <TimelineClock totalDuration={totalDuration} />
          <div className="h-7 flex items-center gap-1 rounded-lg border border-white/5 bg-black/20 px-1.5">
            <button
              onClick={() => setZoom((value) => Math.max(100, value - 50))}
              className="p-1 text-slate-500 hover:text-white"
              title="Zoom timeline out (Ctrl+-)"
            >
              <Minus className="h-3 w-3" />
            </button>
            <input
              type="range"
              min="100"
              max="2000"
              step="25"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="w-20 accent-violet-500"
            />
            <button
              onClick={() => setZoom((value) => Math.min(2000, value + 50))}
              className="p-1 text-slate-500 hover:text-white"
              title="Zoom timeline in (Ctrl++)"
            >
              <Plus className="h-3 w-3" />
            </button>
            <span className="w-10 text-[9px] text-slate-600 text-right">{zoom}%</span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex">
        <div className="w-[92px] shrink-0 bg-[#0d0f14] border-r border-white/5 text-[10px] text-slate-600 z-10">
          <div className="h-7 border-b border-white/5" />
          <div style={{ height: VOICE_HEIGHT }} className="flex items-center px-2 gap-1">
            <Mic2 className="h-3 w-3 text-violet-400 shrink-0" />
            <span className="truncate mr-auto">Voice</span>
            <TrackToggle
              enabled={!voiceTrackSettings.muted}
              onClick={() =>
                updateVoiceTrackSettings({ muted: !voiceTrackSettings.muted })
              }
              enabledIcon={Volume2}
              disabledIcon={VolumeX}
              title="Mute voiceover"
            />
            <TrackToggle
              enabled={voiceTrackSettings.visible}
              onClick={() =>
                updateVoiceTrackSettings({ visible: !voiceTrackSettings.visible })
              }
              enabledIcon={Eye}
              disabledIcon={EyeOff}
              title="Enable voiceover track"
            />
          </div>
          {videoTracks.map((track, index) => (
            <div
              key={track.id}
              style={{ height: VIDEO_HEIGHT }}
              className="flex items-center px-2 gap-1 border-t border-white/5 truncate"
              title={track.name}
            >
              <Layers3 className="h-3 w-3 text-violet-400 shrink-0" />
              <span className="truncate mr-auto">{index === 0 ? 'Main' : track.name}</span>
              <TrackToggle
                enabled={!track.muted}
                onClick={() => updateVideoTrack(track.id, { muted: !track.muted })}
                enabledIcon={Volume2}
                disabledIcon={VolumeX}
                title="Mute track"
              />
              <TrackToggle
                enabled={track.visible}
                onClick={() => updateVideoTrack(track.id, { visible: !track.visible })}
                enabledIcon={Eye}
                disabledIcon={EyeOff}
                title="Show or hide track"
              />
              {index > 0 && (
                <button
                  onClick={() => removeVideoTrack(track.id)}
                  className="text-slate-700 hover:text-red-400"
                  title="Remove track; its clips move to Main"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          <div style={{ height: TEXT_HEIGHT }} className="flex items-center px-3 gap-2">
            <Captions className="h-3 w-3 text-sky-400" /> Text
          </div>
          <div style={{ height: AUDIO_HEIGHT }} className="flex items-center px-2 gap-1">
            <Music2 className="h-3 w-3 text-emerald-400 shrink-0" />
            <span className="truncate mr-auto">Audio</span>
            <TrackToggle
              enabled={!audioTrackSettings.muted}
              onClick={() =>
                updateAudioTrackSettings({ muted: !audioTrackSettings.muted })
              }
              enabledIcon={Volume2}
              disabledIcon={VolumeX}
              title="Mute audio track"
            />
            <TrackToggle
              enabled={audioTrackSettings.visible}
              onClick={() =>
                updateAudioTrackSettings({ visible: !audioTrackSettings.visible })
              }
              enabledIcon={Eye}
              disabledIcon={EyeOff}
              title="Enable audio track"
            />
          </div>
        </div>

        <div className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden custom-scrollbar">
          <div style={{ width: `${zoom}%`, minWidth: '100%' }}>
            <div className="h-7 relative border-b border-white/5 bg-[#0d0f14]">
              {Array.from({ length: rulerDivisions + 1 }, (_, index) => (
                <div
                  key={index}
                  className="absolute top-0 bottom-0 border-l border-white/5 text-[9px] text-slate-600 pl-1 pt-1"
                  style={{ left: `${(index / rulerDivisions) * 100}%` }}
                >
                  {formatTime((totalDuration / rulerDivisions) * index)}
                </div>
              ))}
            </div>

            <div
              ref={trackRef}
              onPointerDown={beginScrub}
              className="relative bg-[#0c0e13] cursor-ew-resize"
              style={{ height: bodyHeight }}
            >
              {Array.from({ length: rulerDivisions + 1 }, (_, index) => (
                <div
                  key={index}
                  className="absolute top-0 bottom-0 border-l border-white/[0.035]"
                  style={{ left: `${(index / rulerDivisions) * 100}%` }}
                />
              ))}

              {snapGuideSec !== null && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-cyan-300/90 z-40 pointer-events-none shadow-[0_0_8px_rgba(103,232,249,.7)]"
                  style={{ left: left(snapGuideSec) }}
                />
              )}

              <TimelinePlayhead
                totalDuration={totalDuration}
                onPointerDown={beginScrub}
              />

              <div
                className="absolute top-0 left-0 right-0 border-b border-white/5 p-1 pointer-events-none"
                style={{ height: VOICE_HEIGHT }}
              >
                {audioFile && (
                  <div className="h-full rounded-md bg-violet-600/20 border border-violet-500/25 px-2 flex items-center text-[10px] text-violet-300 overflow-hidden">
                    <span className="truncate">
                      {audioFile.path.split(/[\\/]/).pop()} · waveform
                    </span>
                  </div>
                )}
              </div>

              {videoTracks.map((track, trackIndex) => (
                <div
                  key={track.id}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    event.dataTransfer.dropEffect = 'copy'
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    const asset = droppedAsset(event)
                    if (asset?.kind === 'video' || asset?.kind === 'image') {
                      addSceneFromAsset(asset, track.id, dropTime(event.clientX))
                    }
                  }}
                  className="absolute left-0 right-0 border-b border-white/5"
                  style={{
                    top: VOICE_HEIGHT + trackIndex * VIDEO_HEIGHT,
                    height: VIDEO_HEIGHT,
                  }}
                >
                  {scenes
                    .filter((scene) => scene.trackId === track.id)
                    .map((scene) => {
                      const sceneIndex = scenes.findIndex((item) => item.id === scene.id)
                      const selected = activeSceneId === scene.id
                      return (
                        <div
                          key={scene.id}
                          onPointerDown={(event) => startSceneDrag(event, scene)}
                          className={`absolute top-1 bottom-1 rounded-md border cursor-grab active:cursor-grabbing overflow-hidden pointer-events-auto ${
                            selected
                              ? 'border-violet-400 bg-violet-600/35 z-20'
                              : 'border-white/10 bg-slate-700/35 hover:bg-slate-700/55'
                          }`}
                          style={{
                            left: left(scene.startTimeSec),
                            width: width(scene.durationSec),
                          }}
                        >
                          {selected && (
                            <>
                              <div
                                onPointerDown={(event) => startTrim(event, scene, 'start')}
                                className="absolute left-0 top-0 bottom-0 w-2 bg-violet-300 cursor-ew-resize z-30"
                              />
                              <div
                                onPointerDown={(event) => startTrim(event, scene, 'end')}
                                className="absolute right-0 top-0 bottom-0 w-2 bg-violet-300 cursor-ew-resize z-30"
                              />
                            </>
                          )}
                          <div className="h-4 px-2 bg-black/20 flex items-center text-[9px] text-slate-400">
                            Scene {sceneIndex + 1}
                            {scene.hyperframes?.html ? (
                              <span className="ml-1 text-emerald-300">· motion</span>
                            ) : scene.media ? (
                              <span className="ml-1 text-sky-300">· media</span>
                            ) : (
                              <span className="ml-1 text-slate-500">· blank</span>
                            )}
                          </div>
                          <div className="px-2 py-1 text-[10px] text-slate-200 truncate">
                            {scene.transcriptText || 'Empty scene'}
                          </div>
                        </div>
                      )
                    })}
                </div>
              ))}

              <div
                className="absolute left-0 right-0 border-b border-white/5 pointer-events-none"
                style={{ top: subtitleTop, height: TEXT_HEIGHT }}
              >
                {subtitles.map((subtitle) => (
                  <div
                    key={subtitle.id}
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      setActiveSubtitleId(subtitle.id)
                      requestSeek(subtitle.startTimeSec)
                    }}
                    className={`absolute top-1 bottom-1 rounded px-2 flex items-center text-[9px] truncate pointer-events-auto cursor-pointer ${
                      activeSubtitleId === subtitle.id
                        ? 'bg-sky-500/30 border border-sky-300/70 text-sky-100'
                        : 'bg-sky-500/15 border border-sky-500/20 text-sky-200/80'
                    }`}
                    style={{
                      left: left(subtitle.startTimeSec),
                      width: width(subtitle.endTimeSec - subtitle.startTimeSec),
                    }}
                  >
                    {subtitle.text}
                  </div>
                ))}
              </div>

              <div
                onDragOver={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  event.dataTransfer.dropEffect = 'copy'
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  const asset = droppedAsset(event)
                  if (asset?.kind === 'music' || asset?.kind === 'sfx') {
                    addAudioClip(asset, dropTime(event.clientX))
                  }
                }}
                className="absolute left-0 right-0"
                style={{ top: audioTop, height: AUDIO_HEIGHT }}
              >
                {audioClips.map((clip) => (
                  <div
                    key={clip.id}
                    onPointerDown={(event) =>
                      startAudioDrag(
                        event,
                        clip.id,
                        clip.startTimeSec,
                        clip.durationSec
                      )
                    }
                    className={`group absolute top-1 bottom-1 rounded px-2 flex items-center text-[9px] truncate pointer-events-auto cursor-grab active:cursor-grabbing ${
                      activeAudioClipId === clip.id
                        ? 'bg-emerald-500/35 border border-emerald-200 text-emerald-50 z-20'
                        : 'bg-emerald-500/15 border border-emerald-500/25 text-emerald-200'
                    }`}
                    style={{ left: left(clip.startTimeSec), width: width(clip.durationSec) }}
                  >
                    {activeAudioClipId === clip.id && (
                      <>
                        <div
                          onPointerDown={(event) =>
                            startAudioTrim(event, clip, 'start')
                          }
                          className="absolute left-0 top-0 bottom-0 w-2 bg-emerald-200 cursor-ew-resize z-30"
                          title="Trim or extend clip head"
                        />
                        <div
                          onPointerDown={(event) =>
                            startAudioTrim(event, clip, 'end')
                          }
                          className="absolute right-0 top-0 bottom-0 w-2 bg-emerald-200 cursor-ew-resize z-30"
                          title="Trim or extend clip tail"
                        />
                      </>
                    )}
                    {clip.name}
                    <button
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => removeAudioClip(clip.id)}
                      className="ml-auto opacity-0 group-hover:opacity-100 hover:text-red-300"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TrackToggle({
  enabled,
  onClick,
  enabledIcon: EnabledIcon,
  disabledIcon: DisabledIcon,
  title,
}: {
  enabled: boolean
  onClick: () => void
  enabledIcon: React.ComponentType<{ className?: string }>
  disabledIcon: React.ComponentType<{ className?: string }>
  title: string
}) {
  const Icon = enabled ? EnabledIcon : DisabledIcon
  return (
    <button
      onClick={onClick}
      className={enabled ? 'text-slate-500 hover:text-white' : 'text-amber-400'}
      title={title}
    >
      <Icon className="h-3 w-3" />
    </button>
  )
}
