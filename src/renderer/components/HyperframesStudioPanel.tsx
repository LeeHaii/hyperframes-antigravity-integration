import React, { useCallback, useEffect, useRef, useState } from 'react'
import { CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useEditorStore } from '../../store/useEditorStore'
import AntigravityChat, { seedComposition } from './AntigravityChat'
import PlayerCanvas from './PlayerCanvas'
import ProjectSettingsDialog from './ProjectSettingsDialog'

const STUDIO_MESSAGE_SOURCE = 'gravity-frames-studio'
let scheduledStudioClose: number | null = null

type SidebarChatBounds = {
  left: number
  top: number
  width: number
  height: number
}

export default function HyperframesStudioPanel() {
  const { projectId, projectName, scenes, activeSceneId, updateScene } = useEditorStore(
    useShallow((state) => ({
      projectId: state.projectId,
      projectName: state.projectName,
      scenes: state.scenes,
      activeSceneId: state.activeSceneId,
      updateScene: state.updateScene,
    }))
  )
  const activeScene = scenes.find((scene) => scene.id === activeSceneId)
  const activeHtml = activeScene?.hyperframes?.html || ''
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState('Starting Gravity Frames Studio...')
  const [error, setError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const [studioRevision, setStudioRevision] = useState(0)
  const [instantVideoOpen, setInstantVideoOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarChatOpen, setSidebarChatOpen] = useState(false)
  const [sidebarChatBounds, setSidebarChatBounds] =
    useState<SidebarChatBounds | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const lastHtmlRef = useRef('')
  const pendingStudioHtmlRef = useRef<string | null>(null)
  const studioAgentRequestRef = useRef<string | null>(null)
  const studioAgentConversationIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    studioAgentConversationIdRef.current = undefined
  }, [projectId])

  useEffect(() => {
    if (scheduledStudioClose !== null) {
      window.clearTimeout(scheduledStudioClose)
      scheduledStudioClose = null
    }
    if (!projectId || !activeScene) {
      setUrl('')
      setStatus('')
      return
    }

    let disposed = false
    let syncing = false
    let pollTimer: number | undefined
    const sceneId = activeScene.id
    const initialHtml = activeScene.hyperframes?.html || seedComposition(activeScene)
    lastHtmlRef.current = initialHtml
    setStudioRevision(0)
    setUrl('')
    setError('')
    setStatus('Starting Gravity Frames Studio...')
    setInstantVideoOpen(false)
    setSidebarChatOpen(false)
    setSidebarChatBounds(null)

    if (!activeScene.hyperframes?.html) {
      updateScene(sceneId, {
        sceneType: 'hyperframes',
        hyperframes: {
          html: initialHtml,
          updatedAt: new Date().toISOString(),
        },
      })
    }

    const commitStudioHtml = (html: string) => {
      if (
        pendingStudioHtmlRef.current &&
        html !== pendingStudioHtmlRef.current
      ) {
        return
      }
      if (!html || html === lastHtmlRef.current) return
      lastHtmlRef.current = html
      const currentScene = useEditorStore
        .getState()
        .scenes.find((scene) => scene.id === sceneId)
      if (!currentScene) return
      updateScene(sceneId, {
        sceneType: 'hyperframes',
        hyperframes: {
          ...currentScene.hyperframes,
          html,
          updatedAt: new Date().toISOString(),
          renderedPath: undefined,
        },
      })
    }

    const syncStudioHtml = async () => {
      if (disposed || syncing) return
      syncing = true
      try {
        const html = await window.electronAPI.readHyperframesStudioHtml({
          projectId,
          sceneId,
        })
        if (!disposed) commitStudioHtml(html)
      } catch (syncError) {
        if (!disposed) {
          setError(
            syncError instanceof Error ? syncError.message : String(syncError)
          )
        }
      } finally {
        syncing = false
      }
    }

    const open = async () => {
      try {
        const session = await window.electronAPI.openHyperframesStudio({
          projectId,
          sceneId,
          html: initialHtml,
        })
        if (disposed) return
        setUrl(session.url)
        setStatus('')
        pollTimer = window.setInterval(() => {
          void syncStudioHtml()
        }, 1000)
      } catch (openError) {
        if (!disposed) {
          setError(openError instanceof Error ? openError.message : String(openError))
          setStatus('')
        }
      }
    }
    void open()

    return () => {
      disposed = true
      if (pollTimer !== undefined) window.clearInterval(pollTimer)
      void window.electronAPI
        .readHyperframesStudioHtml({ projectId, sceneId })
        .then(commitStudioHtml)
        .catch(() => undefined)
      scheduledStudioClose = window.setTimeout(() => {
        scheduledStudioClose = null
        void window.electronAPI.closeHyperframesStudio()
      }, 500)
    }
  }, [projectId, activeScene?.id, reloadToken, updateScene])

  const commitGeneratedComposition = useCallback(
    async (html: string) => {
      if (!projectId || !activeScene) return
      const previousHtml = lastHtmlRef.current
      pendingStudioHtmlRef.current = html
      // Claim this version before React processes the Zustand update. This keeps
      // the polling reader from restoring the previous file while the write is
      // in flight.
      lastHtmlRef.current = html
      try {
        await window.electronAPI.writeHyperframesStudioHtml({
          projectId,
          sceneId: activeScene.id,
          html,
        })
        setError('')
        setStudioRevision((revision) => revision + 1)
      } catch (writeError) {
        lastHtmlRef.current = previousHtml
        throw writeError
      } finally {
        if (pendingStudioHtmlRef.current === html) {
          pendingStudioHtmlRef.current = null
        }
      }
    },
    [projectId, activeScene?.id]
  )

  const appendGeneratedComposition = useCallback(
    async (html: string, label: string) => {
      if (!projectId || !activeScene) {
        throw new Error('Open an animation project before creating a Comp.')
      }
      const currentScene = useEditorStore
        .getState()
        .scenes.find((scene) => scene.id === activeScene.id)
      const result = await window.electronAPI.appendHyperframesStudioComposition({
        projectId,
        sceneId: activeScene.id,
        html,
        label,
        preserveCurrent: Boolean(currentScene?.hyperframes?.lastPrompt),
      })
      lastHtmlRef.current = result.masterHtml
      pendingStudioHtmlRef.current = null
      setError('')
      setStudioRevision((revision) => revision + 1)
      return result
    },
    [projectId, activeScene?.id]
  )

  useEffect(() => {
    if (!url || !projectId || !activeScene || !activeHtml) return
    if (activeHtml === lastHtmlRef.current) return
    let cancelled = false
    void commitGeneratedComposition(activeHtml)
      .catch((writeError) => {
        if (!cancelled) {
          setError(
            writeError instanceof Error ? writeError.message : String(writeError)
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [
    url,
    projectId,
    activeScene?.id,
    activeHtml,
    commitGeneratedComposition,
  ])

  useEffect(() => {
    if (!url || !projectId || !activeScene) return
    const studioOrigin = new URL(url).origin
    const postAgentStatus = (
      state: 'running' | 'completed' | 'error',
      message: string,
      surface: string
    ) => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          source: STUDIO_MESSAGE_SOURCE,
          type: 'agent-status',
          state,
          message,
          surface,
        },
        studioOrigin
      )
    }
    const runStudioAgent = async (
      prompt: string,
      surface: string,
      label: string
    ) => {
      if (studioAgentRequestRef.current) {
        postAgentStatus(
          'error',
          'Antigravity is already working on this Studio project.',
          surface
        )
        return
      }
      const requestId = crypto.randomUUID()
      studioAgentRequestRef.current = requestId
      postAgentStatus('running', `Antigravity is working on ${label}...`, surface)
      try {
        const result = await window.electronAPI.runStudioAntigravity({
          requestId,
          projectId,
          sceneId: activeScene.id,
          prompt,
          conversationId: studioAgentConversationIdRef.current,
        })
        if (result.conversationId) {
          studioAgentConversationIdRef.current = result.conversationId
        }
        postAgentStatus(
          'completed',
          'Antigravity finished. Studio will refresh changed files automatically.',
          surface
        )
      } catch (agentError) {
        postAgentStatus(
          'error',
          agentError instanceof Error ? agentError.message : String(agentError),
          surface
        )
      } finally {
        if (studioAgentRequestRef.current === requestId) {
          studioAgentRequestRef.current = null
        }
      }
    }
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      if (event.origin !== studioOrigin) return
      if (event.data?.source !== STUDIO_MESSAGE_SOURCE) return
      if (event.data?.type === 'view-change') {
        if (event.data.view === 'settings') {
          setSettingsOpen(true)
          return
        }
        setInstantVideoOpen(event.data.view === 'instant-video')
        return
      }
      if (event.data?.type === 'sidebar-chat-state') {
        const bounds = event.data.bounds
        const validBounds =
          bounds &&
          [bounds.left, bounds.top, bounds.width, bounds.height].every(
            (value) => Number.isFinite(value)
          ) &&
          bounds.width >= 160 &&
          bounds.height >= 120
        setSidebarChatOpen(Boolean(event.data.active && validBounds))
        setSidebarChatBounds(
          validBounds
            ? {
                left: Number(bounds.left),
                top: Number(bounds.top),
                width: Number(bounds.width),
                height: Number(bounds.height),
              }
            : null
        )
        return
      }
      if (event.data?.type === 'agent-run') {
        const prompt = String(event.data.prompt || '').trim()
        if (!prompt || prompt.length > 120_000) {
          postAgentStatus('error', 'The Studio agent prompt is invalid.', 'studio')
          return
        }
        const surface = String(event.data.surface || 'studio').slice(0, 40)
        const label = String(event.data.label || 'this request').slice(0, 80)
        void runStudioAgent(prompt, surface, label)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [url, projectId, activeScene?.id])

  useEffect(() => {
    if (!url) return
    iframeRef.current?.contentWindow?.postMessage(
      {
        source: STUDIO_MESSAGE_SOURCE,
        type: 'instant-video-state',
        active: instantVideoOpen,
      },
      new URL(url).origin
    )
    iframeRef.current?.contentWindow?.postMessage(
      {
        source: STUDIO_MESSAGE_SOURCE,
        type: 'project-context',
        name: projectName,
      },
      new URL(url).origin
    )
  }, [url, instantVideoOpen, projectName])

  const restartStudio = async () => {
    if (scheduledStudioClose !== null) {
      window.clearTimeout(scheduledStudioClose)
      scheduledStudioClose = null
    }
    await window.electronAPI.closeHyperframesStudio()
    setReloadToken((token) => token + 1)
  }

  const studioUrl = url
    ? (() => {
        const next = new URL(url)
        next.searchParams.set('gravity-frames-revision', String(studioRevision))
        return next.toString()
      })()
    : ''

  if (!activeScene) {
    return (
      <div className="flex h-full items-center justify-center bg-[#09090b] text-xs text-slate-500">
        Open an animation project to start Gravity Frames Studio.
      </div>
    )
  }

  return (
    <section className="relative h-full min-h-0 bg-[#09090b]">
      {url ? (
        <iframe
          ref={iframeRef}
          src={studioUrl}
          title="Gravity Frames Studio"
          allow="clipboard-read; clipboard-write"
          className="h-full w-full border-0 bg-[#09090b]"
          onLoad={() => {
            setStatus('')
            iframeRef.current?.contentWindow?.postMessage(
              {
                source: STUDIO_MESSAGE_SOURCE,
                type: 'instant-video-state',
                active: instantVideoOpen,
              },
              new URL(url).origin
            )
            iframeRef.current?.contentWindow?.postMessage(
              {
                source: STUDIO_MESSAGE_SOURCE,
                type: 'project-context',
                name: projectName,
              },
              new URL(url).origin
            )
          }}
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-[11px] text-slate-500">
            {error ? (
              <CircleAlert className="h-5 w-5 text-red-300" />
            ) : (
              <LoaderCircle className="h-5 w-5 animate-spin text-[#79f2c0]" />
            )}
            <span>{error || status}</span>
            {error ? (
              <button
                type="button"
                onClick={restartStudio}
                className="flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 text-[10px] text-slate-300 hover:bg-white/10"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Retry
              </button>
            ) : null}
          </div>
        </div>
      )}

      {url && instantVideoOpen ? (
        <div className="absolute inset-x-0 bottom-0 top-10 z-20 flex bg-[#18181b]">
          <aside className="w-[390px] shrink-0 border-r border-neutral-800 bg-neutral-950">
            <AntigravityChat
              onCompositionGenerated={appendGeneratedComposition}
            />
          </aside>
          <main className="min-w-0 flex-1 bg-neutral-900 p-px">
            <PlayerCanvas sceneOnly />
          </main>
        </div>
      ) : null}

      {url && sidebarChatOpen && sidebarChatBounds && !instantVideoOpen ? (
        <aside
          aria-label="Antigravity chat sidebar"
          className="absolute z-30 overflow-hidden border-x border-b border-neutral-800/50 bg-neutral-950"
          style={sidebarChatBounds}
        >
          <AntigravityChat
            compact
            onCompositionGenerated={appendGeneratedComposition}
          />
        </aside>
      ) : null}

      {settingsOpen ? (
        <ProjectSettingsDialog
          onClose={() => setSettingsOpen(false)}
          onStorageChanged={() => {
            void restartStudio()
          }}
        />
      ) : null}
    </section>
  )
}
