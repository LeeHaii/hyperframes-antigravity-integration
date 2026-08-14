import { Composition } from 'remotion'
import { MainComposition } from './Composition'

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="MainComposition"
        component={MainComposition}
        durationInFrames={300} // This is overridden dynamically by the player
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          scenes: [],
          videoTracks: [],
          voiceTrackSettings: { muted: false, visible: true },
          audioTrackSettings: { muted: false, visible: true },
          renderScale: 1,
          subtitles: [],
          audioPath: '',
          audioClips: [],
          subtitleSettings: {
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
            position: 'bottom' as const,
          },
        }}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.max(
            1,
            Math.ceil(
              Math.max(
                1,
                ...props.scenes.map((scene) => scene.endTimeSec),
                ...(props.subtitles || []).map((subtitle) => subtitle.endTimeSec),
                ...(props.audioClips || []).map(
                  (clip) => clip.startTimeSec + clip.durationSec
                )
              ) * 30
            )
          ),
        })}
      />
    </>
  )
}
