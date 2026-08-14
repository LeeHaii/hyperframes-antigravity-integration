import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  LoaderCircle,
  LogIn,
  Send,
  Sparkles,
  Square,
  UserRound,
  WandSparkles,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useEditorStore } from '../../store/useEditorStore'
import { AgentChatMessage, AntigravityStatus, SceneSegment } from '../../types/editor'
import { localMediaUrl } from '../services/localMedia'

const starterPrompts = [
  'Add a cinematic title reveal',
  'Animate this with kinetic typography',
  'Create a subtle parallax camera move',
]

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function seedComposition(scene: SceneSegment) {
  const compositionId = `scene-${scene.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  const duration = Math.max(0.1, scene.durationSec)
  const mediaUrl = scene.media?.sourceUrl ? localMediaUrl(scene.media.sourceUrl) : ''
  const isVideo = scene.media?.type === 'local_video' || scene.media?.type === 'youtube_clip' || scene.media?.type === 'pexels_video'
  const media = mediaUrl
    ? isVideo
      ? `<video class="clip media" data-start="0" data-duration="${duration}" data-track-index="0" src="${escapeHtml(mediaUrl)}" muted playsinline></video>`
      : `<img class="clip media" data-start="0" data-duration="${duration}" data-track-index="0" src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(scene.media?.title || 'Scene media')}" />`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #070b12; font-family: Inter, Arial, sans-serif; }
    #${compositionId} { position: relative; width: 1920px; height: 1080px; overflow: hidden; color: white; background: radial-gradient(circle at 28% 22%, #294260 0, #101827 38%, #070b12 76%); }
    .media { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .shade { position: absolute; inset: 0; background: linear-gradient(120deg, rgba(4,8,14,.76), rgba(4,8,14,.12)); }
    .copy { position: absolute; left: 120px; bottom: 112px; max-width: 1120px; }
    .eyebrow { color: #79f2c0; text-transform: uppercase; letter-spacing: .28em; font-size: 22px; font-weight: 700; }
    h1 { margin: 20px 0 0; font-size: 108px; line-height: .94; letter-spacing: -.055em; }
  </style>
</head>
<body>
  <div id="${compositionId}" data-composition-id="${compositionId}" data-start="0" data-duration="${duration}" data-width="1920" data-height="1080">
    ${media}
    <div class="clip shade" data-start="0" data-duration="${duration}" data-track-index="1"></div>
    <div class="clip copy" data-start="0" data-duration="${duration}" data-track-index="2">
      <div class="eyebrow">HyperFrames scene</div>
      <h1>${escapeHtml(scene.transcriptText || 'Make motion feel inevitable.')}</h1>
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
  <script>
    const tl = gsap.timeline({ paused: true });
    tl.from('.media', { scale: 1.08, duration: ${duration}, ease: 'none' }, 0);
    tl.from('.eyebrow', { opacity: 0, y: 24, duration: .6, ease: 'power3.out' }, .2);
    tl.from('h1', { opacity: 0, y: 64, duration: .9, ease: 'power3.out' }, .35);
    window.__timelines = window.__timelines || {};
    window.__timelines['${compositionId}'] = tl;
  </script>
</body>
</html>`
}

function extractHtml(response: string) {
  const fenced = response.match(/```html\s*([\s\S]*?)```/i)?.[1]
  if (fenced?.includes('data-composition-id')) return fenced.trim()
  const document = response.match(/(<!doctype html[\s\S]*<\/html>)/i)?.[1]
  return document?.includes('data-composition-id') ? document.trim() : null
}

function assistantSummary(response: string, changed: boolean) {
  const withoutCode = response.replace(/```html[\s\S]*?```/gi, '').trim()
  if (withoutCode) return withoutCode.slice(0, 2_000)
  return changed
    ? 'Updated the selected scene with a new seekable HyperFrames composition.'
    : response.slice(0, 2_000)
}

function buildAgentPrompt(scene: SceneSegment, request: string, history: AgentChatMessage[]) {
  const existingHtml = scene.hyperframes?.html || seedComposition(scene)
  const compactHistory = history
    .filter((message) => message.sceneId === scene.id)
    .slice(-6)
    .map((message) => `${message.role.toUpperCase()}: ${message.text}`)
    .join('\n')

  return `You are the motion-design agent inside Gravity Frames Studio. Create or revise ONE HyperFrames HTML composition.

Hard requirements:
- Return a complete standalone HTML document inside one \`\`\`html code fence.
- Keep a single composition root with data-composition-id, data-start="0", data-duration="${scene.durationSec}", data-width="1920", and data-height="1080".
- Every timed visual uses class="clip", data-start, data-duration, and data-track-index.
- Animations must be deterministic and seekable. Prefer a paused GSAP timeline registered in window.__timelines[compositionId]. Do not use setTimeout, Date, random values, autoplay loops, or wall-clock-only CSS animation.
- Keep the exact scene duration ${scene.durationSec} seconds. The HTML must work directly in @hyperframes/player and with the HyperFrames CLI.
- Preserve any existing local media URL exactly unless the user asks to remove it.
- Do not access the filesystem, shell, network APIs, cookies, localStorage, parent window, or Electron APIs. CDN script tags for animation libraries are allowed.
- Before the HTML fence, give a concise one-sentence summary. Do not output a diff.

Selected scene:
- id: ${scene.id}
- timeline range: ${scene.startTimeSec}s to ${scene.endTimeSec}s
- media: ${scene.media?.title || 'none (blank scene)'}
- user request: ${request}

Recent scene conversation:
${compactHistory || '(none)'}

Current composition:
\`\`\`html
${existingHtml}
\`\`\``
}

export default function AntigravityChat({ compact = false }: { compact?: boolean }) {
  const {
    projectId,
    scenes,
    activeSceneId,
    agentChat,
    antigravityConversationId,
    updateScene,
    addMediaAssets,
    appendAgentChat,
    clearAgentChat,
    setAntigravityConversationId,
  } = useEditorStore(
    useShallow((state) => ({
      projectId: state.projectId,
      scenes: state.scenes,
      activeSceneId: state.activeSceneId,
      agentChat: state.agentChat,
      antigravityConversationId: state.antigravityConversationId,
      updateScene: state.updateScene,
      addMediaAssets: state.addMediaAssets,
      appendAgentChat: state.appendAgentChat,
      clearAgentChat: state.clearAgentChat,
      setAntigravityConversationId: state.setAntigravityConversationId,
    }))
  )
  const activeScene = scenes.find((scene) => scene.id === activeSceneId)
  const [status, setStatus] = useState<AntigravityStatus | null>(null)
  const [draft, setDraft] = useState('')
  const [runningRequestId, setRunningRequestId] = useState<string | null>(null)
  const [activity, setActivity] = useState('')
  const [isRendering, setIsRendering] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const sceneMessages = useMemo(
    () => agentChat.filter((message) => !message.sceneId || message.sceneId === activeSceneId),
    [agentChat, activeSceneId]
  )

  const refreshStatus = () => window.electronAPI.getAntigravityStatus().then(setStatus)

  useEffect(() => {
    void refreshStatus()
    const onWindowFocus = () => void refreshStatus()
    window.addEventListener('focus', onWindowFocus)
    const removeAgentListener = window.electronAPI.onAntigravityStream((event) => {
      if (event.requestId !== runningRequestId) return
      const readable = event.chunk
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-1)[0]
      if (readable) setActivity(event.stream === 'stderr' ? readable : 'Antigravity is composing…')
    })
    const removeRenderListener = window.electronAPI.onHyperframesRenderProgress((event) => {
      if (event.sceneId === activeSceneId) setActivity(event.chunk.trim().slice(-160))
    })
    return () => {
      window.removeEventListener('focus', onWindowFocus)
      removeAgentListener()
      removeRenderListener()
    }
  }, [runningRequestId, activeSceneId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [sceneMessages.length, runningRequestId])

  const connect = async () => {
    if (!status?.installed) {
      await window.electronAPI.openAntigravityInstallDocs()
      return
    }
    await window.electronAPI.launchAntigravityLogin()
    appendAgentChat({
      id: crypto.randomUUID(),
      role: 'system',
      text: 'Finish Google sign-in in the Antigravity terminal, then return here and send a message.',
      createdAt: new Date().toISOString(),
    })
  }

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    const request = draft.trim()
    if (!request || !activeScene || !projectId || runningRequestId) return

    const userMessage: AgentChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: request,
      createdAt: new Date().toISOString(),
      sceneId: activeScene.id,
    }
    appendAgentChat(userMessage)
    setDraft('')
    setActivity('Starting Antigravity…')
    if (!activeScene.hyperframes?.html) {
      updateScene(activeScene.id, {
        sceneType: 'hyperframes',
        hyperframes: {
          html: seedComposition(activeScene),
          updatedAt: new Date().toISOString(),
          lastPrompt: request,
        },
      })
    }
    const requestId = crypto.randomUUID()
    setRunningRequestId(requestId)

    try {
      const result = await window.electronAPI.runAntigravity({
        requestId,
        projectId,
        conversationId: antigravityConversationId || undefined,
        prompt: buildAgentPrompt(activeScene, request, [...agentChat, userMessage]),
      })
      const html = extractHtml(result.text)
      if (html) {
        updateScene(activeScene.id, {
          sceneType: 'hyperframes',
          hyperframes: {
            html,
            updatedAt: new Date().toISOString(),
            lastPrompt: request,
            renderedPath: undefined,
          },
        })
      }
      if (result.conversationId) setAntigravityConversationId(result.conversationId)
      appendAgentChat({
        id: crypto.randomUUID(),
        role: 'assistant',
        text: assistantSummary(result.text, Boolean(html)),
        createdAt: new Date().toISOString(),
        sceneId: activeScene.id,
      })
      await refreshStatus()
    } catch (error) {
      appendAgentChat({
        id: crypto.randomUUID(),
        role: 'system',
        text: error instanceof Error ? error.message : String(error),
        createdAt: new Date().toISOString(),
        sceneId: activeScene.id,
      })
    } finally {
      setRunningRequestId(null)
      setActivity('')
    }
  }

  const cancel = async () => {
    if (runningRequestId) await window.electronAPI.cancelAntigravity(runningRequestId)
  }

  const renderScene = async () => {
    if (!projectId || !activeScene?.hyperframes?.html || isRendering) return
    setIsRendering(true)
    setActivity('Preparing HyperFrames render…')
    try {
      const outputPath = await window.electronAPI.renderHyperframesScene({
        projectId,
        sceneId: activeScene.id,
        html: activeScene.hyperframes.html,
      })
      const assetId = `hf-${activeScene.id}`
      addMediaAssets([
        {
          id: assetId,
          name: `HyperFrames · ${activeScene.transcriptText || 'Motion scene'}`,
          path: outputPath,
          kind: 'video',
          durationSec: activeScene.durationSec,
          origin: 'imported',
        },
      ])
      updateScene(activeScene.id, {
        media: {
          id: assetId,
          type: 'local_video',
          sourceUrl: outputPath,
          thumbnailUrl: outputPath,
          title: 'Rendered HyperFrames scene',
          sourceDurationSec: activeScene.durationSec,
          sourceStartSec: 0,
        },
        hyperframes: { ...activeScene.hyperframes, renderedPath: outputPath },
      })
      appendAgentChat({
        id: crypto.randomUUID(),
        role: 'system',
        text: 'Rendered this HyperFrames scene to MP4 and attached it to the timeline clip.',
        createdAt: new Date().toISOString(),
        sceneId: activeScene.id,
      })
    } catch (error) {
      appendAgentChat({
        id: crypto.randomUUID(),
        role: 'system',
        text: error instanceof Error ? error.message : String(error),
        createdAt: new Date().toISOString(),
        sceneId: activeScene.id,
      })
    } finally {
      setIsRendering(false)
      setActivity('')
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#0d1119]">
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.07] px-3 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-[#79f2c0] to-[#56a8ff] text-[#071018]">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            Antigravity
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[9px] text-slate-500">
            {status?.installed && status.minimumVersionMet ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            ) : (
              <CircleAlert className="h-3 w-3 text-amber-400" />
            )}
            {status?.installed ? status.version || 'CLI installed' : 'CLI required'} · system keyring OAuth
          </div>
          <div
            className="mt-1 flex max-w-[230px] items-center gap-1.5 truncate text-[9px] text-slate-400"
            title={status?.accountEmail || status?.message}
          >
            <UserRound className="h-3 w-3 shrink-0 text-[#79f2c0]" />
            {status?.accountEmail ? (
              <span className="truncate">
                Account · {status.accountEmail}{status.accountPlan ? ` · ${status.accountPlan}` : ''}
              </span>
            ) : status?.installed ? (
              <span className="truncate">Account · confirm by sending your first message</span>
            ) : (
              <span>Account · not connected</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {activeScene?.hyperframes?.html && (
            <button
              onClick={renderScene}
              disabled={isRendering}
              className="rounded-lg border border-emerald-300/15 bg-emerald-300/10 px-2 py-1.5 text-[9px] font-medium text-emerald-200 hover:bg-emerald-300/15 disabled:opacity-50"
              title="Render with HyperFrames CLI and attach the MP4"
            >
              {isRendering ? 'Rendering…' : 'Render MP4'}
            </button>
          )}
          <button
            onClick={connect}
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[9px] text-slate-300 hover:bg-white/10"
          >
            {status?.installed ? <LogIn className="h-3 w-3" /> : <ExternalLink className="h-3 w-3" />}
            {status?.installed ? 'Connect' : 'Install'}
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-3">
        {sceneMessages.length === 0 && (
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
            <Bot className="mb-2 h-5 w-5 text-[#79f2c0]" />
            <p className="text-[11px] leading-relaxed text-slate-300">
              Describe the motion you want. Antigravity will return seekable HyperFrames HTML for the selected scene.
            </p>
            <div className="mt-3 space-y-1.5">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => setDraft(prompt)}
                  className="block w-full rounded-lg border border-white/[0.06] bg-black/15 px-2.5 py-2 text-left text-[10px] text-slate-500 hover:border-[#79f2c0]/20 hover:text-slate-200"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        {sceneMessages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[92%] rounded-xl px-3 py-2.5 text-[11px] leading-relaxed whitespace-pre-wrap ${
              message.role === 'user'
                ? 'ml-auto bg-[#2276f5] text-white'
                : message.role === 'system'
                  ? 'border border-amber-400/15 bg-amber-400/[0.06] text-amber-100/80'
                  : 'border border-white/[0.07] bg-white/[0.04] text-slate-300'
            }`}
          >
            {message.text}
          </div>
        ))}
        {(runningRequestId || isRendering) && (
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[#79f2c0]" />
            <span className="truncate">{activity || 'Working…'}</span>
          </div>
        )}
      </div>

      <form onSubmit={submit} className="shrink-0 border-t border-white/[0.07] p-3">
        {!activeScene && (
          <div className="mb-2 text-[10px] text-amber-300/70">Select or create a scene first.</div>
        )}
        <div className="rounded-xl border border-white/10 bg-black/25 p-2 focus-within:border-[#79f2c0]/35">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void submit()
              }
            }}
            disabled={!activeScene || Boolean(runningRequestId)}
            rows={compact ? 2 : 3}
            placeholder="Make the headline arrive like a camera flash…"
            className="block w-full resize-none bg-transparent px-1 text-[11px] text-slate-200 outline-none placeholder:text-slate-700"
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-1 text-[9px] text-slate-700">
              <WandSparkles className="h-3 w-3" /> Uses your Antigravity quota
            </div>
            <div className="flex items-center gap-1">
              {agentChat.length > 0 && !runningRequestId && (
                <button type="button" onClick={clearAgentChat} className="px-2 text-[9px] text-slate-600 hover:text-slate-300">
                  Clear
                </button>
              )}
              {runningRequestId ? (
                <button type="button" onClick={cancel} className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/15 text-red-300">
                  <Square className="h-3 w-3 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!draft.trim() || !activeScene}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#79f2c0] text-[#071018] disabled:bg-slate-800 disabled:text-slate-600"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    </section>
  )
}
