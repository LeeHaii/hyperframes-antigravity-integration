import React, { useEffect, useState } from 'react'
import HyperframesStudioPanel from './components/HyperframesStudioPanel'
import { getProjectDocument, useEditorStore } from '../store/useEditorStore'
import { createAnimationProject } from '../project'

function StudioWorkspace() {
  const projectUpdatedAt = useEditorStore((state) => state.projectUpdatedAt)
  const projectId = useEditorStore((state) => state.projectId)
  const editorNotice = useEditorStore((state) => state.editorNotice)
  const setEditorNotice = useEditorStore((state) => state.setEditorNotice)

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
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="relative h-screen overflow-hidden bg-[#09090b] text-slate-50">
      <HyperframesStudioPanel />
      {editorNotice ? (
        <div className="absolute bottom-5 left-1/2 z-[180] flex w-[min(680px,calc(100%-32px))] -translate-x-1/2 items-start gap-3 rounded-xl border border-emerald-300/15 bg-[#111923]/95 px-4 py-3 text-[11px] text-emerald-100 shadow-2xl">
          <span className="flex-1">{editorNotice}</span>
          <button
            type="button"
            onClick={() => setEditorNotice(null)}
            className="text-slate-500 hover:text-white"
          >
            x
          </button>
        </div>
      ) : null}
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
      if (!cancelled && !useEditorStore.getState().projectId) {
        loadProject(createAnimationProject())
      }
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
      setApiKeys({
        groq: groq || '',
        pexels: pexels || '',
        youtube: youtube || '',
      })
    )
  }, [setApiKeys])

  if (!ready || !projectId) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#09090b] text-xs text-slate-500">
        Opening Gravity Frames Studio...
      </div>
    )
  }
  return <StudioWorkspace />
}
