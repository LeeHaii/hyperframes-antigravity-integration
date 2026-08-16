import React, { useMemo } from 'react'
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  Video,
} from 'remotion'
import {
  SceneSegment,
  SubtitleSegment,
  SubtitleSettings,
  TimelineAudioClip,
  TrackSettings,
  VideoTrack,
} from '../types/editor'

const defaultSubtitleSettings: SubtitleSettings = {
  enabled: true,
  fontSize: 48,
  fontFamily: 'Inter, Arial, sans-serif',
  fontWeight: 650,
  textColor: '#ffffff',
  backgroundEnabled: true,
  backgroundColor: '#000000',
  backgroundOpacity: 0.8,
  outlineEnabled: false,
  outlineColor: '#000000',
  outlineWidth: 3,
  position: 'bottom',
}

const defaultTrackSettings: TrackSettings = { muted: false, visible: true }

function mediaSource(source: string) {
  if (!source || /^(https?:|data:|blob:|rhymx-media:)/.test(source)) return source
  let filePath = source
  if (source.startsWith('file:')) {
    const parsed = new URL(source)
    filePath = decodeURIComponent(parsed.pathname)
    if (/^\/[a-zA-Z]:\//.test(filePath)) filePath = filePath.slice(1)
  }
  return `rhymx-media://local/${encodeURIComponent(filePath)}`
}

export const MainComposition: React.FC<{
  scenes: SceneSegment[]
  subtitles?: SubtitleSegment[]
  audioPath: string
  audioStartSec?: number
  audioClips?: TimelineAudioClip[]
  subtitleSettings?: SubtitleSettings
  videoTracks?: VideoTrack[]
  voiceTrackSettings?: TrackSettings
  audioTrackSettings?: TrackSettings
  renderScale?: number
}> = ({
  scenes,
  subtitles = [],
  audioPath,
  audioStartSec = 0,
  audioClips = [],
  subtitleSettings = defaultSubtitleSettings,
  videoTracks = [],
  voiceTrackSettings = defaultTrackSettings,
  audioTrackSettings = defaultTrackSettings,
  renderScale = 1,
}) => {
  const { fps } = useVideoConfig()
  const orderedScenes = useMemo(
    () =>
      [...scenes].sort((first, second) => {
        const firstTrack = videoTracks.findIndex((track) => track.id === first.trackId)
        const secondTrack = videoTracks.findIndex((track) => track.id === second.trackId)
        const trackDifference =
          (firstTrack < 0 ? 0 : firstTrack) - (secondTrack < 0 ? 0 : secondTrack)
        return trackDifference || first.startTimeSec - second.startTimeSec
      }),
    [scenes, videoTracks]
  )

  return (
    <AbsoluteFill style={{ backgroundColor: '#07080b' }}>
      {audioPath && voiceTrackSettings.visible && !voiceTrackSettings.muted && (
        <Audio
          src={mediaSource(audioPath)}
          trimBefore={Math.max(0, Math.round(audioStartSec * fps))}
          pauseWhenBuffering
        />
      )}

      {audioTrackSettings.visible &&
        !audioTrackSettings.muted &&
        audioClips.map((clip) => (
          <Sequence
            key={clip.id}
            from={Math.round(clip.startTimeSec * fps)}
            durationInFrames={Math.max(1, Math.round(clip.durationSec * fps))}
            premountFor={Math.round(fps / 2)}
            postmountFor={Math.round(fps / 4)}
          >
            <Audio
              src={mediaSource(clip.path)}
              volume={clip.volume}
              trimBefore={Math.round((clip.sourceStartSec ?? 0) * fps)}
              pauseWhenBuffering
            />
          </Sequence>
        ))}

      {orderedScenes.map((scene) => {
        const track = videoTracks.find((item) => item.id === scene.trackId)
        if (track && !track.visible) return null
        return (
          <Sequence
            key={scene.id}
            from={Math.round(scene.startTimeSec * fps)}
            durationInFrames={Math.max(1, Math.round(scene.durationSec * fps))}
            premountFor={fps}
            postmountFor={Math.round(fps / 2)}
          >
            <SceneContent
              key={`${scene.media?.sourceUrl || 'empty'}:${scene.media?.sourceStartSec || 0}`}
              scene={scene}
              trackMuted={track?.muted || false}
            />
          </Sequence>
        )
      })}

      {subtitleSettings.enabled &&
        subtitles.map((subtitle) => (
          <Sequence
            key={subtitle.id}
            from={Math.round(subtitle.startTimeSec * fps)}
            durationInFrames={Math.max(
              1,
              Math.round((subtitle.endTimeSec - subtitle.startTimeSec) * fps)
            )}
          >
            <SubtitleContent
              subtitle={subtitle}
              settings={subtitleSettings}
              renderScale={renderScale}
            />
          </Sequence>
        ))}
    </AbsoluteFill>
  )
}

const SceneContent: React.FC<{ scene: SceneSegment; trackMuted: boolean }> = React.memo(({
  scene,
  trackMuted,
}) => {
  const { fps } = useVideoConfig()
  const frame = useCurrentFrame()
  const media = scene.media

  let transform = 'none'
  if (
    media &&
    (media.type === 'google_image' ||
      media.type === 'duckduckgo_image' ||
      media.type === 'local_image') &&
    media.enableKenBurnsEffect
  ) {
    const durationFrames = Math.round(scene.durationSec * fps)
    const scale = interpolate(frame, [0, durationFrames], [1, 1.12], {
      extrapolateRight: 'clamp',
    })
    transform = `scale(${scale})`
  }

  const isVideo =
    media?.type === 'pexels_video' ||
    media?.type === 'youtube_clip' ||
    media?.type === 'local_video'

  return (
    <AbsoluteFill
      data-rhymx-scene-id={scene.id}
      style={{
        opacity: scene.opacity ?? 1,
        transform: `scale(${scene.scale ?? 1})`,
        transformOrigin: 'center center',
      }}
    >
      {media?.missing ? (
        <AbsoluteFill
          style={{
            background: 'radial-gradient(circle at 50% 35%, #301b22 0%, #090a0e 68%)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 48,
            textAlign: 'center',
          }}
        >
          <div style={{ color: '#fca5a5', fontSize: 30, fontWeight: 650 }}>
            YouTube clip file is missing
          </div>
          <div style={{ color: '#8f6670', fontSize: 18, marginTop: 12 }}>
            Download this clip again from the YouTube search tab
          </div>
        </AbsoluteFill>
      ) : !media ? (
        <AbsoluteFill
          style={{
            background: 'radial-gradient(circle at 50% 30%, #20243a 0%, #090a0e 62%)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              color: '#737b94',
              fontSize: 32,
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}
          >
            Add media to this scene
          </div>
        </AbsoluteFill>
      ) : isVideo ? (
        <Video
          src={mediaSource(media.sourceUrl)}
          volume={trackMuted ? 0 : (scene.volume ?? 1)}
          trimBefore={Math.round((media.sourceStartSec ?? 0) * fps)}
          pauseWhenBuffering
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
          <Img
            src={mediaSource(media.sourceUrl)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: media.imageFit === 'contain' ? 'contain' : 'cover',
              transform,
            }}
          />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  )
})

const SubtitleContent: React.FC<{
  subtitle: SubtitleSegment
  settings: SubtitleSettings
  renderScale: number
}> = ({ subtitle, settings, renderScale }) => (
  <AbsoluteFill
    style={{
      justifyContent: settings.position === 'center' ? 'center' : 'flex-end',
      paddingBottom: settings.position === 'bottom' ? 72 * renderScale : 0,
      alignItems: 'center',
      pointerEvents: 'none',
    }}
  >
    <p
      style={{
        color: settings.textColor,
        fontSize: settings.fontSize * renderScale,
        fontFamily: settings.fontFamily,
        lineHeight: 1.25,
        fontWeight: settings.fontWeight,
        textAlign: 'center',
        whiteSpace: 'pre-line',
        backgroundColor: settings.backgroundEnabled
          ? colorWithOpacity(settings.backgroundColor, settings.backgroundOpacity)
          : 'transparent',
        margin: `0 ${110 * renderScale}px`,
        padding: `${12 * renderScale}px ${24 * renderScale}px`,
        borderRadius: 12 * renderScale,
        textShadow: `0 ${2 * renderScale}px ${8 * renderScale}px rgba(0,0,0,.55)`,
        WebkitTextStroke: settings.outlineEnabled
          ? `${settings.outlineWidth * renderScale}px ${settings.outlineColor}`
          : undefined,
        paintOrder: 'stroke fill',
      }}
    >
      {subtitle.text}
    </p>
  </AbsoluteFill>
)

function colorWithOpacity(color: string, opacity: number) {
  const normalized = color.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return color
  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, opacity))})`
}
