import { ProjectDocument } from './types/editor'

export function createAnimationProject(name = 'Untitled animation'): ProjectDocument {
  const now = new Date().toISOString()
  const trackId = crypto.randomUUID()
  const sceneId = crypto.randomUUID()
  const projectName = name.replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled animation'

  return {
    id: crypto.randomUUID(),
    name: projectName,
    createdAt: now,
    updatedAt: now,
    audioFile: null,
    scenes: [
      {
        id: sceneId,
        startTimeSec: 0,
        endTimeSec: 5,
        durationSec: 5,
        transcriptText: 'Main composition',
        keywords: [],
        media: null,
        trackId,
        volume: 1,
        scale: 1,
        opacity: 1,
        sceneType: 'blank',
      },
    ],
    videoTracks: [{ id: trackId, name: 'Main', muted: false, visible: true }],
    voiceTrackSettings: { muted: false, visible: true },
    audioTrackSettings: { muted: false, visible: true },
    subtitles: [],
    mediaLibrary: [],
    audioClips: [],
    subtitleSettings: {
      enabled: false,
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
    },
    visualGapsFilled: true,
  }
}
