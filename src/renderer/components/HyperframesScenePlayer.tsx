import React, { useEffect, useRef, useState } from 'react'
import '@hyperframes/player'
import type { HyperframesPlayer } from '@hyperframes/player'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useEditorStore } from '../../store/useEditorStore'
import { SceneSegment } from '../../types/editor'
import { prepareHyperframesPreviewHtml } from '../services/hyperframesPreview'

type PlayerEvent = Event & { detail?: { currentTime?: number; duration?: number; message?: string } }
type PreviewBridgeMessage = {
  source?: string
  type?: string
  currentTime?: number
  duration?: number
  isPlaying?: boolean
  message?: string
}

export default function HyperframesScenePlayer({
  scene,
  embeddedInTimeline = false,
}: {
  scene: SceneSegment
  embeddedInTimeline?: boolean
}) {
  const playerRef = useRef<HyperframesPlayer | null>(null)
  const bridgeReadyRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const {
    seekTargetSec,
    seekVersion,
    playbackCommand,
    playbackVersion,
    isPlaying,
    setCurrentTimeSec,
    setIsPlaying,
  } = useEditorStore(
    useShallow((state) => ({
      seekTargetSec: state.seekTargetSec,
      seekVersion: state.seekVersion,
      playbackCommand: state.playbackCommand,
      playbackVersion: state.playbackVersion,
      isPlaying: state.isPlaying,
      setCurrentTimeSec: state.setCurrentTimeSec,
      setIsPlaying: state.setIsPlaying,
    }))
  )
  const appliedPlaybackVersionRef = useRef(playbackVersion)

  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    // Generated motion runs in a unique-origin sandbox. HyperFrames injects its
    // postMessage runtime into srcdoc, so playback does not need same-origin DOM
    // access and the composition cannot reach the Electron bridge on parent.
    player.iframeElement.sandbox.remove('allow-same-origin')
    setReady(false)
    bridgeReadyRef.current = false
    setError(null)
    player.setAttribute(
      'srcdoc',
      prepareHyperframesPreviewHtml(scene.hyperframes?.html || '')
    )
  }, [scene.hyperframes?.html])

  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    const onReady = () => {
      bridgeReadyRef.current = true
      setReady(true)
      setError(null)
      const timelineTime = useEditorStore.getState().currentTimeSec
      const localTime = Math.max(0, Math.min(scene.durationSec, timelineTime - scene.startTimeSec))
      player.seek(localTime)
      if (embeddedInTimeline) {
        if (useEditorStore.getState().isPlaying) void player.play()
      } else {
        setCurrentTimeSec(scene.startTimeSec + localTime)
        setIsPlaying(false)
      }
    }
    const onTimeUpdate = (event: Event) => {
      if (embeddedInTimeline) return
      const localTime = Number((event as PlayerEvent).detail?.currentTime ?? player.currentTime)
      if (Number.isFinite(localTime)) setCurrentTimeSec(scene.startTimeSec + localTime)
    }
    const onPlay = () => {
      if (!embeddedInTimeline) setIsPlaying(true)
    }
    const onPause = () => {
      if (!embeddedInTimeline) setIsPlaying(false)
    }
    const onEnded = () => {
      if (!embeddedInTimeline) {
        setIsPlaying(false)
        setCurrentTimeSec(scene.endTimeSec)
      }
    }
    const onError = (event: Event) => {
      if (bridgeReadyRef.current) return
      setReady(false)
      if (!embeddedInTimeline) setIsPlaying(false)
      setError((event as PlayerEvent).detail?.message || 'The HTML preview could not start.')
    }
    player.addEventListener('ready', onReady)
    player.addEventListener('timeupdate', onTimeUpdate)
    player.addEventListener('play', onPlay)
    player.addEventListener('pause', onPause)
    player.addEventListener('ended', onEnded)
    player.addEventListener('error', onError)
    const onBridgeMessage = (event: MessageEvent<PreviewBridgeMessage>) => {
      if (event.source !== player.iframeElement.contentWindow) return
      const message = event.data
      if (!message || message.source !== 'gravity-hyperframes-preview') return
      if (message.type === 'ready') {
        bridgeReadyRef.current = true
        setReady(true)
        setError(null)
        const timelineTime = useEditorStore.getState().currentTimeSec
        const localTime = Math.max(0, Math.min(scene.durationSec, timelineTime - scene.startTimeSec))
        player.seek(localTime)
        if (embeddedInTimeline && useEditorStore.getState().isPlaying) {
          void player.play()
        }
      } else if (message.type === 'state') {
        if (embeddedInTimeline) return
        const localTime = Number(message.currentTime)
        if (Number.isFinite(localTime)) setCurrentTimeSec(scene.startTimeSec + localTime)
        setIsPlaying(Boolean(message.isPlaying))
      } else if (message.type === 'play') {
        if (!embeddedInTimeline) setIsPlaying(true)
      } else if (message.type === 'pause') {
        if (!embeddedInTimeline) setIsPlaying(false)
      } else if (message.type === 'ended') {
        if (!embeddedInTimeline) {
          setIsPlaying(false)
          setCurrentTimeSec(scene.endTimeSec)
        }
      } else if (message.type === 'error') {
        setReady(false)
        if (!embeddedInTimeline) setIsPlaying(false)
        setError(message.message || 'The HTML preview could not start.')
      }
    }
    window.addEventListener('message', onBridgeMessage)
    return () => {
      player.removeEventListener('ready', onReady)
      player.removeEventListener('timeupdate', onTimeUpdate)
      player.removeEventListener('play', onPlay)
      player.removeEventListener('pause', onPause)
      player.removeEventListener('ended', onEnded)
      player.removeEventListener('error', onError)
      window.removeEventListener('message', onBridgeMessage)
    }
  }, [scene.id, scene.startTimeSec, scene.endTimeSec, scene.durationSec, embeddedInTimeline, setCurrentTimeSec, setIsPlaying])

  useEffect(() => {
    const player = playerRef.current
    if (!player || !ready) return
    player.seek(Math.max(0, Math.min(scene.durationSec, seekTargetSec - scene.startTimeSec)))
  }, [seekTargetSec, seekVersion, scene.startTimeSec, scene.durationSec, ready])

  useEffect(() => {
    const player = playerRef.current
    if (!player || !ready) return
    if (appliedPlaybackVersionRef.current === playbackVersion) return
    appliedPlaybackVersionRef.current = playbackVersion
    if (playbackCommand === 'play') void player.play()
    else if (playbackCommand === 'pause') player.pause()
    else if (isPlaying) player.pause()
    else void player.play()
  }, [playbackCommand, playbackVersion, ready, isPlaying])

  return (
    <div className="relative h-full w-full bg-black">
      {React.createElement('hyperframes-player', {
        ref: (node: HyperframesPlayer | null) => {
          playerRef.current = node
        },
        width: '1920',
        height: '1080',
        'shader-loading': 'player',
        style: { width: '100%', height: '100%', display: 'block' },
      } as React.HTMLAttributes<HTMLElement>)}
      {!ready && !error && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-black/35">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#101219]/90 px-3 py-2 text-[10px] text-slate-300">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[#79f2c0]" />
            Loading HTML preview…
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#080b11]/95 p-6 text-center">
          <div className="max-w-md text-[11px] text-amber-100/80">
            <TriangleAlert className="mx-auto mb-2 h-5 w-5 text-amber-300" />
            <div className="font-medium text-amber-200">HTML preview unavailable</div>
            <div className="mt-1 text-slate-500">{error}</div>
          </div>
        </div>
      )}
    </div>
  )
}
