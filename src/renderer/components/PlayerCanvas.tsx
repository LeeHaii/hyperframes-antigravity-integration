import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Code2, LoaderCircle } from 'lucide-react'
import { Player, PlayerRef } from '@remotion/player'
import { MainComposition } from '../../remotion/Composition'
import { useEditorStore } from '../../store/useEditorStore'
import { SceneSegment } from '../../types/editor'
import HyperframesScenePlayer from './HyperframesScenePlayer'
import PlaybackController, { PreviewQuality } from './PlaybackController'

const QUALITY_SIZES = {
  low: { width: 640, height: 360 },
  medium: { width: 1280, height: 720 },
  high: { width: 1920, height: 1080 },
  ultra: { width: 3840, height: 2160 },
} as const

const mediaSignature = (scene: SceneSegment) =>
  scene.media
    ? `${scene.media.type}\u0000${scene.media.sourceUrl}\u0000${
        scene.media.sourceStartSec ?? 0
      }`
    : ''

const isVideoScene = (scene: SceneSegment) =>
  scene.media?.type === 'pexels_video' ||
  scene.media?.type === 'youtube_clip' ||
  scene.media?.type === 'local_video'

const nextPaint = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  )

async function waitForSceneMedia(
  container: HTMLDivElement | null,
  scene: SceneSegment,
  timeoutMs = 2500
) {
  if (!scene.media) return
  const deadline = performance.now() + timeoutMs

  while (performance.now() < deadline) {
    const sceneNode = Array.from(
      container?.querySelectorAll<HTMLElement>('[data-rhymx-scene-id]') || []
    ).find((node) => node.dataset.rhymxSceneId === scene.id)
    if (isVideoScene(scene)) {
      const video = sceneNode?.querySelector('video')
      if (
        video &&
        !video.seeking &&
        video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
      ) {
        return
      }
    } else {
      const image = sceneNode?.querySelector('img')
      if (image?.complete && image.naturalWidth > 0) return
    }
    await nextPaint()
  }
}

export default function PlayerCanvas({ sceneOnly = false }: { sceneOnly?: boolean }) {
  // Keep playback-clock updates from re-rendering the Player and recreating
  // every active media element. This is especially important with overlays.
  const scenes = useEditorStore((state) => state.scenes)
  const activeSceneId = useEditorStore((state) => state.activeSceneId)
  const videoTracks = useEditorStore((state) => state.videoTracks)
  const voiceTrackSettings = useEditorStore((state) => state.voiceTrackSettings)
  const audioTrackSettings = useEditorStore((state) => state.audioTrackSettings)
  const subtitles = useEditorStore((state) => state.subtitles)
  const audioFile = useEditorStore((state) => state.audioFile)
  const audioClips = useEditorStore((state) => state.audioClips)
  const subtitleSettings = useEditorStore((state) => state.subtitleSettings)
  const seekTargetSec = useEditorStore((state) => state.seekTargetSec)
  const seekVersion = useEditorStore((state) => state.seekVersion)
  const playbackCommand = useEditorStore((state) => state.playbackCommand)
  const playbackVersion = useEditorStore((state) => state.playbackVersion)
  const setCurrentTimeSec = useEditorStore((state) => state.setCurrentTimeSec)
  const setIsPlaying = useEditorStore((state) => state.setIsPlaying)
  const playerRef = useRef<PlayerRef>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const previousMediaRef = useRef<Map<string, string> | null>(null)
  const mediaRefreshVersionRef = useRef(0)
  const appliedPlaybackVersionRef = useRef(playbackVersion)
  const [zoom, setZoom] = useState<'fit' | number>('fit')
  const [fitWidth, setFitWidth] = useState(960)
  const [isRefreshingMedia, setIsRefreshingMedia] = useState(false)
  const [quality, setQuality] = useState<PreviewQuality>(
    () =>
      (localStorage.getItem('rhymx.previewQuality') as
        | PreviewQuality) || 'medium'
  )
  const qualitySize = QUALITY_SIZES[quality]
  const activeScene = scenes.find((scene) => scene.id === activeSceneId)
  const hyperframesScene =
    activeScene?.hyperframes?.html && (sceneOnly || !activeScene.hyperframes.renderedPath)
      ? activeScene
      : null

  const totalDurationSec = useMemo(() => {
    const sceneEnd = scenes.reduce((max, scene) => Math.max(max, scene.endTimeSec), 0)
    const subtitleEnd = subtitles.reduce(
      (max, subtitle) => Math.max(max, subtitle.endTimeSec),
      0
    )
    const clipEnd = audioClips.reduce(
      (max, clip) => Math.max(max, clip.startTimeSec + clip.durationSec),
      0
    )
    return Math.max(audioFile?.duration || 0, sceneEnd, subtitleEnd, clipEnd, 10)
  }, [audioFile?.duration, scenes, subtitles, audioClips])
  const durationInFrames = Math.max(1, Math.round(totalDurationSec * 30))
  const inputProps = useMemo(
    () => ({
      scenes,
      videoTracks,
      voiceTrackSettings,
      audioTrackSettings,
      renderScale: qualitySize.width / 1920,
      subtitles,
      audioPath: audioFile?.path || '',
      audioClips,
      subtitleSettings,
    }),
    [
      scenes,
      videoTracks,
      voiceTrackSettings,
      audioTrackSettings,
      qualitySize.width,
      subtitles,
      audioFile?.path,
      audioClips,
      subtitleSettings,
    ]
  )

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const updateFit = () => {
      const availableWidth = Math.max(240, viewport.clientWidth - 48)
      const availableHeight = Math.max(135, viewport.clientHeight - 132)
      setFitWidth(Math.min(availableWidth, availableHeight * (16 / 9)))
    }
    updateFit()
    const observer = new ResizeObserver(updateFit)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    localStorage.setItem('rhymx.previewQuality', quality)
  }, [quality])

  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    const syncFrame = () => setCurrentTimeSec(player.getCurrentFrame() / 30)
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => {
      syncFrame()
      setIsPlaying(false)
    }

    syncFrame()
    setIsPlaying(player.isPlaying())
    player.addEventListener('frameupdate', syncFrame)
    player.addEventListener('seeked', syncFrame)
    player.addEventListener('play', onPlay)
    player.addEventListener('pause', onPause)
    player.addEventListener('ended', onEnded)
    return () => {
      player.removeEventListener('frameupdate', syncFrame)
      player.removeEventListener('seeked', syncFrame)
      player.removeEventListener('play', onPlay)
      player.removeEventListener('pause', onPause)
      player.removeEventListener('ended', onEnded)
    }
  }, [setCurrentTimeSec, setIsPlaying, hyperframesScene?.id])

  useEffect(() => {
    const nextMedia = new Map(
      scenes.map((scene) => [scene.id, mediaSignature(scene)] as const)
    )
    const previousMedia = previousMediaRef.current
    previousMediaRef.current = nextMedia
    if (!previousMedia) return

    const player = playerRef.current
    if (!player) return
    const currentFrame = player.getCurrentFrame()
    const currentTime = currentFrame / 30
    const changedScene = scenes.find(
      (scene) =>
        previousMedia.get(scene.id) !== nextMedia.get(scene.id) &&
        currentTime >= scene.startTimeSec &&
        currentTime < scene.endTimeSec
    )
    if (!changedScene) return

    const refreshVersion = ++mediaRefreshVersionRef.current
    const wasPlaying = player.isPlaying()
    const startFrame = Math.round(changedScene.startTimeSec * 30)
    const endFrame = Math.max(startFrame, Math.round(changedScene.endTimeSec * 30) - 1)
    const warmFrame =
      currentFrame > startFrame
        ? Math.max(startFrame, currentFrame - 2)
        : Math.min(endFrame, currentFrame + 1)

    player.pause()
    setIsRefreshingMedia(true)
    player.seekTo(warmFrame)

    void (async () => {
      await nextPaint()
      if (refreshVersion !== mediaRefreshVersionRef.current) return
      player.seekTo(currentFrame)
      await waitForSceneMedia(player.getContainerNode(), changedScene)
      if (refreshVersion !== mediaRefreshVersionRef.current) return
      setIsRefreshingMedia(false)
      if (wasPlaying) player.play()
    })()
  }, [scenes])

  useEffect(
    () => () => {
      mediaRefreshVersionRef.current += 1
    },
    []
  )

  useEffect(() => {
    playerRef.current?.seekTo(Math.round(seekTargetSec * 30))
  }, [seekTargetSec, seekVersion])

  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    if (appliedPlaybackVersionRef.current === playbackVersion) return
    appliedPlaybackVersionRef.current = playbackVersion
    if (playbackCommand === 'play') player.play()
    else if (playbackCommand === 'pause') player.pause()
    else if (player.isPlaying()) player.pause()
    else player.play()
  }, [playbackCommand, playbackVersion])

  return (
    <div ref={viewportRef} className="w-full h-full overflow-auto custom-scrollbar relative">
      <div className="min-w-full min-h-full flex items-center justify-center p-4">
        <div
          className="flex shrink-0 flex-col gap-2"
          style={{ width: fitWidth * (zoom === 'fit' ? 1 : zoom / 100) }}
        >
          <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl shadow-black/60">
            {hyperframesScene ? (
              <>
                <HyperframesScenePlayer scene={hyperframesScene} />
                <div className="absolute left-3 top-3 z-50 flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-black/65 px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.16em] text-emerald-200 backdrop-blur">
                  <Code2 className="h-3 w-3" /> HyperFrames live HTML
                </div>
              </>
            ) : (
              <Player
                ref={playerRef}
                component={MainComposition}
                inputProps={inputProps}
                durationInFrames={durationInFrames}
                fps={30}
                compositionWidth={qualitySize.width}
                compositionHeight={qualitySize.height}
                style={{ width: '100%', height: '100%' }}
                className={`preview-quality-${quality}`}
                controls={false}
              />
            )}
            {isRefreshingMedia && (
              <div className="absolute inset-0 z-40 pointer-events-none flex items-center justify-center bg-black/20">
                <div className="rounded-lg border border-white/10 bg-[#101219]/90 px-3 py-2 flex items-center gap-2 text-[10px] text-slate-300 shadow-xl">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin text-violet-400" />
                  Buffering replacement media…
                </div>
              </div>
            )}
          </div>
          <PlaybackController
            startSec={hyperframesScene || (sceneOnly && activeScene) ? activeScene?.startTimeSec : 0}
            endSec={
              hyperframesScene || (sceneOnly && activeScene) ? activeScene?.endTimeSec || totalDurationSec : totalDurationSec
            }
            quality={quality}
            onQualityChange={setQuality}
            zoom={zoom}
            onZoomChange={setZoom}
          />
        </div>
      </div>
    </div>
  )
}
