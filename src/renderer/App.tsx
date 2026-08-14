import React, { PointerEvent, useEffect, useState } from 'react'
import AntigravityChat from './components/AntigravityChat'
import ContextInspector from './components/Inspector/ContextInspector'
import MediaBin from './components/MediaBin'
import PlayerCanvas from './components/PlayerCanvas'
import StudioHeader from './components/StudioHeader'
import Timeline from './components/Timeline/Timeline'
import { getProjectDocument, useEditorStore } from '../store/useEditorStore'
import { ProjectDocument, WorkspaceMode } from '../types/editor'

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value))

function blankProject(): ProjectDocument {
  const now = new Date().toISOString()
  const trackId = crypto.randomUUID()
  const sceneId = crypto.randomUUID()
  return {
    id: crypto.randomUUID(),
    name: 'Untitled motion project',
    createdAt: now,
    updatedAt: now,
    audioFile: null,
    scenes: [
      {
        id: sceneId,
        startTimeSec: 0,
        endTimeSec: 5,
        durationSec: 5,
        transcriptText: 'Opening scene',
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

function Workspace() {
  const projectUpdatedAt = useEditorStore((state) => state.projectUpdatedAt)
  const projectId = useEditorStore((state) => state.projectId)
  const editorNotice = useEditorStore((state) => state.editorNotice)
  const setEditorNotice = useEditorStore((state) => state.setEditorNotice)
  const [mode, setMode] = useState<WorkspaceMode>(() =>
    localStorage.getItem('gravity.workspaceMode') === 'editor' ? 'editor' : 'scene'
  )
  const [mediaWidth, setMediaWidth] = useState(224)
  const [inspectorWidth, setInspectorWidth] = useState(360)
  const [timelineHeight, setTimelineHeight] = useState(292)

  useEffect(() => localStorage.setItem('gravity.workspaceMode', mode), [mode])

  useEffect(() => {
    if (!projectId || !projectUpdatedAt) return
    localStorage.setItem('gravity.lastProjectId', projectId)
    const timer = window.setTimeout(() => {
      const project = getProjectDocument()
      if (project) void window.electronAPI.saveProject(project)
    }, 600)
    return () => window.clearTimeout(timer)
  }, [projectId, projectUpdatedAt])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = useEditorStore.getState()
      const target = event.target as HTMLElement | null
      const editing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable
      const command = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()

      if (command && key === 's') {
        event.preventDefault()
        const project = getProjectDocument()
        if (project) void window.electronAPI.saveProject(project)
      } else if (command && key === 'z') {
        event.preventDefault()
        event.shiftKey ? state.redo() : state.undo()
      } else if (command && key === 'y') {
        event.preventDefault()
        state.redo()
      } else if (!editing && event.code === 'Space') {
        event.preventDefault()
        state.requestPlayback('toggle')
      } else if (!editing && command && key === 'b' && state.activeSceneId) {
        event.preventDefault()
        state.splitScene(state.activeSceneId, state.currentTimeSec)
      } else if (!editing && (event.key === 'Delete' || event.key === 'Backspace')) {
        if (state.activeSceneId) state.deleteScene(state.activeSceneId)
        else if (state.activeAudioClipId) state.removeAudioClip(state.activeAudioClipId)
      } else if (!editing && event.key === 'ArrowLeft') {
        event.preventDefault()
        state.requestSeek(Math.max(0, state.currentTimeSec - (event.shiftKey ? 1 : 1 / 30)))
      } else if (!editing && event.key === 'ArrowRight') {
        event.preventDefault()
        state.requestSeek(state.currentTimeSec + (event.shiftKey ? 1 : 1 / 30))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const beginResize = (
    event: PointerEvent<HTMLDivElement>,
    direction: 'media' | 'inspector' | 'timeline'
  ) => {
    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    const initial =
      direction === 'media' ? mediaWidth : direction === 'inspector' ? inspectorWidth : timelineHeight
    const onMove = (moveEvent: globalThis.PointerEvent) => {
      if (direction === 'media') setMediaWidth(clamp(initial + moveEvent.clientX - startX, 188, 360))
      else if (direction === 'inspector') setInspectorWidth(clamp(initial - (moveEvent.clientX - startX), 310, 480))
      else setTimelineHeight(clamp(initial - (moveEvent.clientY - startY), 220, 460))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#080b11] text-slate-50">
      <StudioHeader mode={mode} onModeChange={setMode} />
      {editorNotice && (
        <div className="absolute left-1/2 top-16 z-[180] flex w-[min(680px,calc(100%-32px))] -translate-x-1/2 items-start gap-3 rounded-xl border border-emerald-300/15 bg-[#111923]/95 px-4 py-3 text-[11px] text-emerald-100 shadow-2xl">
          <span className="flex-1">{editorNotice}</span>
          <button onClick={() => setEditorNotice(null)} className="text-slate-500 hover:text-white">×</button>
        </div>
      )}

      {mode === 'scene' ? (
        <div className="flex min-h-0 flex-1">
          <div className="w-[370px] shrink-0 border-r border-white/[0.07]">
            <AntigravityChat />
          </div>
          <main className="min-w-0 flex-1 bg-[radial-gradient(circle_at_50%_25%,#172235_0,#080b11_58%)] p-5">
            <PlayerCanvas sceneOnly />
          </main>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <MediaBin width={mediaWidth} />
          <div onPointerDown={(event) => beginResize(event, 'media')} className="resize-handle-x" />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1 bg-[radial-gradient(circle_at_50%_20%,#151e2d_0,#080b11_60%)] p-4">
              <PlayerCanvas />
            </div>
            <div onPointerDown={(event) => beginResize(event, 'timeline')} className="resize-handle-y" />
            <div className="min-h-0 shrink-0 bg-[#0d1119]" style={{ height: timelineHeight }}>
              <Timeline />
            </div>
          </div>
          <div onPointerDown={(event) => beginResize(event, 'inspector')} className="resize-handle-x" />
          <aside className="flex min-w-0 shrink-0 flex-col bg-[#0d1119]" style={{ width: inspectorWidth }}>
            <div className="min-h-0 flex-[1.05] border-b border-white/[0.07]">
              <ContextInspector />
            </div>
            <div className="min-h-[280px] flex-1">
              <AntigravityChat compact />
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const projectId = useEditorStore((state) => state.projectId)
  const loadProject = useEditorStore((state) => state.loadProject)
  const setApiKeys = useEditorStore((state) => state.setApiKeys)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const initialize = async () => {
      const previousProjectId = localStorage.getItem('gravity.lastProjectId')
      if (previousProjectId) {
        try {
          const project = await window.electronAPI.loadProject(previousProjectId)
          if (!cancelled) loadProject(project)
        } catch {
          localStorage.removeItem('gravity.lastProjectId')
        }
      }
      if (!cancelled && !useEditorStore.getState().projectId) loadProject(blankProject())
      if (!cancelled) setReady(true)
    }
    void initialize()
    return () => {
      cancelled = true
    }
  }, [loadProject])

  useEffect(() => {
    Promise.all([
      window.electronAPI.getGroqKey(),
      window.electronAPI.getPexelsKey(),
      window.electronAPI.getYouTubeKey(),
    ]).then(([groq, pexels, youtube]) =>
      setApiKeys({ groq: groq || '', pexels: pexels || '', youtube: youtube || '' })
    )
  }, [setApiKeys])

  if (!ready || !projectId) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#080b11] text-xs text-slate-500">
        Opening Gravity Frames…
      </div>
    )
  }
  return <Workspace />
}
