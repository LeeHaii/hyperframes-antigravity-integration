import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Cpu,
  ExternalLink,
  ImagePlus,
  LoaderCircle,
  LogIn,
  Send,
  Sparkles,
  Square,
  UserRound,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useEditorStore } from '../../store/useEditorStore'
import {
  AgentChatMessage,
  AntigravityStatus,
  ChatReferenceImage,
  HyperframesStudioAppendResult,
  SceneSegment,
} from '../../types/editor'
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

interface ModelInfo {
  id: string
  name: string
  provider: 'Google' | 'Anthropic' | 'OpenAI' | 'Other'
  badge: string
  badgeColor: string
}

function parseModelDetails(modelName: string): ModelInfo {
  let provider: 'Google' | 'Anthropic' | 'OpenAI' | 'Other' = 'Google'
  let badge = 'Standard'
  let badgeColor = 'text-neutral-400 bg-neutral-500/10 border-neutral-500/20'

  if (/claude/i.test(modelName)) {
    provider = 'Anthropic'
  } else if (/gpt/i.test(modelName)) {
    provider = 'OpenAI'
  } else if (/gemini/i.test(modelName)) {
    provider = 'Google'
  }

  if (/thinking/i.test(modelName)) {
    badge = 'Thinking'
    badgeColor = 'text-purple-400 bg-purple-500/10 border-purple-500/20'
  } else if (/high/i.test(modelName)) {
    badge = 'High Reasoning'
    badgeColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
  } else if (/medium/i.test(modelName)) {
    badge = 'Balanced'
    badgeColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20'
  } else if (/low/i.test(modelName)) {
    badge = 'Fast'
    badgeColor = 'text-sky-400 bg-sky-500/10 border-sky-500/20'
  }

  return {
    id: modelName,
    name: modelName,
    provider,
    badge,
    badgeColor,
  }
}

export function seedComposition(scene: SceneSegment, requestedCompositionId?: string) {
  const compositionId =
    requestedCompositionId || `scene-${scene.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  const duration = Math.max(0.1, scene.durationSec)
  const mediaUrl = scene.media?.sourceUrl ? localMediaUrl(scene.media.sourceUrl) : ''
  const isVideo = scene.media?.type === 'local_video' || scene.media?.type === 'youtube_clip' || scene.media?.type === 'pexels_video'
  const media = mediaUrl
    ? isVideo
      ? `<video id="${compositionId}-media" data-hf-id="hf-media" class="clip media" data-start="0" data-duration="${duration}" data-track-index="0" src="${escapeHtml(mediaUrl)}" muted playsinline></video>`
      : `<img id="${compositionId}-media" data-hf-id="hf-media" class="clip media" data-start="0" data-duration="${duration}" data-track-index="0" src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(scene.media?.title || 'Scene media')}" />`
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
  <div id="${compositionId}" data-hf-id="hf-${compositionId}-root" data-composition-id="${compositionId}" data-start="0" data-duration="${duration}" data-width="1920" data-height="1080">
    ${media}
    <div id="${compositionId}-shade" data-hf-id="hf-shade" class="clip shade" data-start="0" data-duration="${duration}" data-track-index="1"></div>
    <div id="${compositionId}-copy" data-hf-id="hf-copy" class="clip copy" data-start="0" data-duration="${duration}" data-track-index="2">
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
    ? 'Updated the animation with a new seekable HyperFrames composition.'
    : response.slice(0, 2_000)
}

function buildAgentPrompt(
  scene: SceneSegment,
  request: string,
  history: AgentChatMessage[],
  referenceImages: ChatReferenceImage[],
  compositionId: string
) {
  const clipDurationSec =
    scene.hyperframes?.clipDurationSec || Math.max(0.1, scene.durationSec)
  const newCompositionSeed = seedComposition(
    {
      ...scene,
      durationSec: clipDurationSec,
      endTimeSec: scene.startTimeSec + clipDurationSec,
      hyperframes: undefined,
    },
    compositionId
  )
  const compactHistory = history
    .filter((message) => message.sceneId === scene.id)
    .slice(-6)
    .map((message) => `${message.role.toUpperCase()}: ${message.text}`)
    .join('\n')
  const visualReferences = referenceImages.length
    ? referenceImages
        .map((image) => `- ${image.relativePath} (${image.name})`)
        .join('\n')
    : '(none)'

  return `You are the motion-design agent inside Gravity Frames Studio. Create ONE NEW HyperFrames child composition. It will be saved as a separate file and appended to a master timeline.

Hard requirements:
- Return a complete standalone HTML document inside one \`\`\`html code fence.
- Keep a single composition root with id="${compositionId}", data-composition-id="${compositionId}", data-start="0", data-duration="${clipDurationSec}", data-width="1920", and data-height="1080".
- The child root MUST NOT have data-track-index and its data-start must remain exactly zero. Child time is local; the master host controls where the whole child starts.
- Every timed visual uses class="clip", data-start, data-duration, and an integer data-track-index. Every timed visual must also have its own unique, stable id and data-hf-id so Studio can edit it reliably.
- Do not create a master timeline and do not use data-composition-src. Return only the new self-contained child animation.
- Animations must be deterministic and seekable. Prefer a paused GSAP timeline registered in window.__timelines[compositionId]. Do not use setTimeout, Date, random values, autoplay loops, or wall-clock-only CSS animation.
- Keep the exact child duration ${clipDurationSec} seconds. The HTML must work directly in @hyperframes/player and with the HyperFrames CLI.
- Preserve any existing local media URL exactly unless the user asks to remove it.
- Do not access the filesystem except to inspect the read-only visual reference files listed below. Do not use shell, network APIs, cookies, localStorage, parent window, or Electron APIs. CDN script tags for animation libraries are allowed.
- Before the HTML fence, give a concise one-sentence summary. Do not output a diff.

Selected scene:
- id: ${scene.id}
- animation duration: ${clipDurationSec}s
- media: ${scene.media?.title || 'none (blank scene)'}
- user request: ${request}

Visual references (inspect these files before designing):
${visualReferences}

Recent scene conversation:
${compactHistory || '(none)'}

Fresh child-composition starting point:
\`\`\`html
${newCompositionSeed}
\`\`\``
}

type AntigravityChatProps = {
  compact?: boolean
  onCompositionGenerated?: (
    html: string,
    label: string
  ) => Promise<HyperframesStudioAppendResult>
}

export default function AntigravityChat({
  compact = false,
  onCompositionGenerated,
}: AntigravityChatProps) {
  const {
    projectId,
    scenes,
    activeSceneId,
    agentChat,
    antigravityConversationId,
    antigravityModel,
    updateScene,
    appendAgentChat,
    clearAgentChat,
    setAntigravityConversationId,
    setAntigravityModel,
  } = useEditorStore(
    useShallow((state) => ({
      projectId: state.projectId,
      scenes: state.scenes,
      activeSceneId: state.activeSceneId,
      agentChat: state.agentChat,
      antigravityConversationId: state.antigravityConversationId,
      antigravityModel: state.antigravityModel,
      updateScene: state.updateScene,
      appendAgentChat: state.appendAgentChat,
      clearAgentChat: state.clearAgentChat,
      setAntigravityConversationId: state.setAntigravityConversationId,
      setAntigravityModel: state.setAntigravityModel,
    }))
  )
  const activeScene = scenes.find((scene) => scene.id === activeSceneId)
  const [status, setStatus] = useState<AntigravityStatus | null>(null)
  const [draft, setDraft] = useState('')
  const [runningRequestId, setRunningRequestId] = useState<string | null>(null)
  const [activity, setActivity] = useState('')
  const [referenceImages, setReferenceImages] = useState<ChatReferenceImage[]>([])
  const [isAddingReference, setIsAddingReference] = useState(false)
  const [referenceError, setReferenceError] = useState('')
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const modelDropdownRef = useRef<HTMLDivElement>(null)

  const sceneMessages = useMemo(
    () => agentChat.filter((message) => !message.sceneId || message.sceneId === activeSceneId),
    [agentChat, activeSceneId]
  )

  const availableModels = useMemo(() => {
    return status?.models && status.models.length > 0
      ? status.models
      : [
          'Gemini 3.7 Flash (High)',
          'Gemini 3.7 Flash (Medium)',
          'Gemini 3.7 Flash (Low)',
          'Gemini 3.6 Flash (High)',
          'Gemini 3.6 Flash (Medium)',
          'Gemini 3.6 Flash (Low)',
          'Gemini 3.5 Flash (High)',
          'Gemini 3.5 Flash (Medium)',
          'Gemini 3.5 Flash (Low)',
          'Gemini 3.1 Pro (High)',
          'Gemini 3.1 Pro (Low)',
          'Claude Sonnet 4.6 (Thinking)',
          'Claude Opus 4.6 (Thinking)',
          'GPT-OSS 120B (Medium)',
        ]
  }, [status?.models])

  const groupedModels = useMemo(() => {
    const groups: { [key: string]: string[] } = {
      'Google Gemini': [],
      'Anthropic Claude': [],
      'OpenAI / Other': [],
    }
    for (const model of availableModels) {
      if (/gemini/i.test(model)) {
        groups['Google Gemini'].push(model)
      } else if (/claude/i.test(model)) {
        groups['Anthropic Claude'].push(model)
      } else {
        groups['OpenAI / Other'].push(model)
      }
    }
    return Object.entries(groups).filter(([_, list]) => list.length > 0)
  }, [availableModels])

  const activeModelDetails = useMemo(
    () => parseModelDetails(antigravityModel || 'Gemini 3.7 Flash (High)'),
    [antigravityModel]
  )

  const refreshStatus = () => window.electronAPI.getAntigravityStatus().then(setStatus)

  useEffect(() => {
    if (!modelDropdownOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modelDropdownRef.current &&
        !modelDropdownRef.current.contains(event.target as Node)
      ) {
        setModelDropdownOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModelDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [modelDropdownOpen])

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
    return () => {
      window.removeEventListener('focus', onWindowFocus)
      removeAgentListener()
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

  const addReferences = (images: ChatReferenceImage[]) => {
    setReferenceImages((current) => {
      const known = new Set(current.map((image) => image.path))
      return [
        ...current,
        ...images.filter((image) => !known.has(image.path)),
      ].slice(0, 4)
    })
  }

  const browseReferences = async () => {
    if (!projectId || isAddingReference) return
    setIsAddingReference(true)
    setReferenceError('')
    try {
      addReferences(await window.electronAPI.openChatReferenceImages(projectId))
    } catch (error) {
      setReferenceError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsAddingReference(false)
    }
  }

  const pasteReferences = async (
    event: React.ClipboardEvent<HTMLTextAreaElement>
  ) => {
    if (!projectId || isAddingReference) return
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file))
      .slice(0, Math.max(0, 4 - referenceImages.length))
    if (files.length === 0) return
    event.preventDefault()
    setIsAddingReference(true)
    setReferenceError('')
    try {
      const saved = await Promise.all(
        files.map(async (file, index) =>
          window.electronAPI.saveChatReferenceImage(projectId, {
            name: file.name || `Pasted image ${index + 1}`,
            mimeType: file.type,
            data: await file.arrayBuffer(),
          })
        )
      )
      addReferences(saved)
    } catch (error) {
      setReferenceError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsAddingReference(false)
    }
  }

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    const submittedReferences = [...referenceImages]
    const request =
      draft.trim() ||
      (submittedReferences.length
        ? 'Use the attached image as the visual reference for this scene.'
        : '')
    if (!request || !activeScene || !projectId || runningRequestId) return

    const userMessage: AgentChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: request,
      createdAt: new Date().toISOString(),
      sceneId: activeScene.id,
      referenceImages: submittedReferences.length
        ? submittedReferences
        : undefined,
    }
    appendAgentChat(userMessage)
    setDraft('')
    setReferenceImages([])
    setActivity('Starting Antigravity…')
    if (!activeScene.hyperframes?.html) {
      updateScene(activeScene.id, {
        sceneType: 'hyperframes',
        hyperframes: {
          html: seedComposition(activeScene),
          updatedAt: new Date().toISOString(),
        },
      })
    }
    const requestId = crypto.randomUUID()
    const compositionId = `gravity-chat-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
    setRunningRequestId(requestId)

    try {
      const result = await window.electronAPI.runAntigravity({
        requestId,
        projectId,
        conversationId: antigravityConversationId || undefined,
        model: antigravityModel || undefined,
        prompt: buildAgentPrompt(
          activeScene,
          request,
          [...agentChat, userMessage],
          submittedReferences,
          compositionId
        ),
      })
      const html = extractHtml(result.text)
      if (html) {
        setActivity('Adding a new Comp to the master timeline…')
        const appended = await onCompositionGenerated?.(html, request)
        const nextHtml = appended?.masterHtml || html
        const clipDurationSec =
          appended?.clipDurationSec ||
          activeScene.hyperframes?.clipDurationSec ||
          activeScene.durationSec
        const totalDurationSec = appended?.totalDurationSec
        updateScene(activeScene.id, {
          sceneType: 'hyperframes',
          ...(totalDurationSec
            ? {
                durationSec: totalDurationSec,
                endTimeSec: activeScene.startTimeSec + totalDurationSec,
              }
            : {}),
          hyperframes: {
            ...activeScene.hyperframes,
            html: nextHtml,
            updatedAt: new Date().toISOString(),
            lastPrompt: request,
            renderedPath: undefined,
            clipDurationSec,
            compositionCount: appended?.compositionCount,
            lastCompositionPath: appended?.compositionPath,
          },
        })
      }
      if (result.conversationId) setAntigravityConversationId(result.conversationId)
      appendAgentChat({
        id: crypto.randomUUID(),
        role: 'assistant',
        text: `${assistantSummary(result.text, Boolean(html))}${
          html && onCompositionGenerated
            ? '\n\nAdded as a new Comp at the end of the master timeline.'
            : ''
        }`,
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

  return (
    <section className="flex h-full min-h-0 flex-col bg-neutral-950">
      <div className="flex shrink-0 flex-col gap-2.5 border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-neutral-100">
              <div className="flex h-6 w-6 items-center justify-center rounded-md border border-[#3ce6ac]/20 bg-[#3ce6ac]/10 text-[#3ce6ac]">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              Antigravity
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[9px] text-neutral-500">
              {status?.installed && status.minimumVersionMet ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              ) : (
                <CircleAlert className="h-3 w-3 text-amber-400" />
              )}
              {status?.installed ? status.version || 'CLI installed' : 'CLI required'} · system keyring OAuth
            </div>
            <div
              className="mt-0.5 flex max-w-[230px] items-center gap-1.5 truncate text-[9px] text-neutral-400"
              title={status?.accountEmail || status?.message}
            >
              <UserRound className="h-3 w-3 shrink-0 text-[#3ce6ac]" />
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
            <button
              onClick={connect}
              className="flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-[9px] text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800"
            >
              {status?.installed ? <LogIn className="h-3 w-3" /> : <ExternalLink className="h-3 w-3" />}
              {status?.installed ? 'Connect' : 'Install'}
            </button>
          </div>
        </div>

        {/* Model Selection Dropdown Bar */}
        <div className="relative" ref={modelDropdownRef}>
          <button
            type="button"
            onClick={() => setModelDropdownOpen((prev) => !prev)}
            aria-haspopup="listbox"
            aria-expanded={modelDropdownOpen}
            className={`group flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[10px] transition ${
              modelDropdownOpen
                ? 'border-[#3ce6ac]/60 bg-neutral-900 ring-1 ring-[#3ce6ac]/20'
                : 'border-neutral-800/90 bg-neutral-900/60 hover:border-neutral-700 hover:bg-neutral-900'
            }`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-[#3ce6ac]/20 bg-[#3ce6ac]/10 text-[#3ce6ac]">
                <Cpu className="h-3 w-3" />
              </div>
              <div className="min-w-0 flex-1 truncate">
                <span className="text-[9px] text-neutral-500">Model: </span>
                <span className="font-medium text-neutral-200 group-hover:text-white">
                  {antigravityModel || 'Gemini 3.7 Flash (High)'}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span
                className={`rounded border px-1.5 py-0.5 text-[8px] font-medium leading-none ${activeModelDetails.badgeColor}`}
              >
                {activeModelDetails.badge}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-neutral-400 transition-transform duration-200 ${
                  modelDropdownOpen ? 'rotate-180 text-[#3ce6ac]' : ''
                }`}
              />
            </div>
          </button>

          {modelDropdownOpen && (
            <div
              className="custom-scrollbar absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-neutral-700/80 bg-neutral-950/95 p-1.5 shadow-2xl backdrop-blur-xl ring-1 ring-black/60"
              role="listbox"
            >
              <div className="px-2 py-1 text-[8px] font-semibold uppercase tracking-wider text-neutral-500">
                Select Model
              </div>
              {groupedModels.map(([groupName, models]) => (
                <div key={groupName} className="mb-1.5 last:mb-0">
                  <div className="px-2 py-1 text-[8px] font-semibold uppercase tracking-wider text-neutral-500">
                    {groupName}
                  </div>
                  <div className="space-y-0.5">
                    {models.map((model) => {
                      const isSelected = model === antigravityModel
                      const details = parseModelDetails(model)
                      return (
                        <button
                          key={model}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => {
                            setAntigravityModel(model)
                            setModelDropdownOpen(false)
                          }}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[10px] transition ${
                            isSelected
                              ? 'border border-[#3ce6ac]/30 bg-[#3ce6ac]/10 text-neutral-100 font-medium'
                              : 'text-neutral-300 hover:bg-neutral-900 hover:text-white'
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            {isSelected ? (
                              <Check className="h-3 w-3 shrink-0 text-[#3ce6ac]" />
                            ) : (
                              <div className="h-3 w-3 shrink-0" />
                            )}
                            <span className="truncate">{model}</span>
                          </div>
                          <span
                            className={`shrink-0 rounded border px-1.5 py-0.5 text-[8px] font-medium leading-none ${details.badgeColor}`}
                          >
                            {details.badge}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-3">
        {sceneMessages.length === 0 && (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
            <Bot className="mb-2 h-5 w-5 text-[#3ce6ac]" />
            <p className="text-[11px] leading-relaxed text-neutral-300">
              Describe the motion you want. Antigravity will return a seekable HyperFrames animation you can refine in Studio.
            </p>
            <div className="mt-3 space-y-1.5">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => setDraft(prompt)}
                  className="block w-full rounded-md border border-neutral-800 bg-neutral-950/60 px-2.5 py-2 text-left text-[10px] text-neutral-500 hover:border-neutral-700 hover:bg-neutral-900 hover:text-neutral-200"
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
                ? 'ml-auto bg-[#3ce6ac] text-neutral-950'
                : message.role === 'system'
                  ? 'border border-amber-400/15 bg-amber-400/[0.06] text-amber-100/80'
                  : 'border border-neutral-800 bg-neutral-900 text-neutral-300'
            }`}
          >
            {message.referenceImages?.length ? (
              <div className="mb-2 grid grid-cols-2 gap-1.5">
                {message.referenceImages.map((image) => (
                  <img
                    key={image.id}
                    src={localMediaUrl(image.path)}
                    alt={image.name}
                    title={image.name}
                    className="aspect-video w-full rounded-md border border-neutral-800 object-cover"
                  />
                ))}
              </div>
            ) : null}
            {message.text}
          </div>
        ))}
        {runningRequestId && (
          <div className="flex items-center gap-2 text-[10px] text-neutral-500">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[#3ce6ac]" />
            <span className="truncate">{activity || 'Working…'}</span>
          </div>
        )}
      </div>

      <form onSubmit={submit} className="shrink-0 border-t border-neutral-800 p-3">
        {!activeScene && (
          <div className="mb-2 text-[10px] text-amber-300/70">Open an animation project first.</div>
        )}
        {referenceError ? (
          <div className="mb-2 text-[9px] text-red-300">{referenceError}</div>
        ) : null}
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-2 focus-within:border-[#3ce6ac]/60 focus-within:ring-1 focus-within:ring-[#3ce6ac]/20">
          {referenceImages.length ? (
            <div className="mb-2 grid grid-cols-4 gap-1.5">
              {referenceImages.map((image) => (
                <div key={image.id} className="group relative">
                  <img
                    src={localMediaUrl(image.path)}
                    alt={image.name}
                    title={image.name}
                    className="aspect-square w-full rounded-md border border-neutral-700 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setReferenceImages((current) =>
                        current.filter((item) => item.id !== image.id)
                      )
                    }
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/75 text-white opacity-0 transition group-hover:opacity-100"
                    title="Remove reference"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onPaste={pasteReferences}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void submit()
              }
            }}
            disabled={!activeScene || Boolean(runningRequestId)}
            rows={compact ? 2 : 3}
            placeholder="Make the headline arrive like a camera flash…"
            className="block w-full resize-none bg-transparent px-1 text-[11px] text-neutral-200 outline-none placeholder:text-neutral-600"
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                onClick={browseReferences}
                disabled={
                  !projectId ||
                  isAddingReference ||
                  referenceImages.length >= 4 ||
                  Boolean(runningRequestId)
                }
                className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[9px] text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-40"
                title="Browse for reference images, or paste one with Ctrl+V"
              >
                {isAddingReference ? (
                  <LoaderCircle className="h-3 w-3 animate-spin" />
                ) : (
                  <ImagePlus className="h-3 w-3" />
                )}
                Add image
              </button>
              <button
                type="button"
                onClick={() => setModelDropdownOpen((prev) => !prev)}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-neutral-400 hover:bg-neutral-800/80 hover:text-neutral-200"
                title={`Active model: ${antigravityModel || 'Gemini 3.7 Flash (High)'} - click to change`}
              >
                <Cpu className="h-2.5 w-2.5 text-[#3ce6ac]" />
                <span className="max-w-[120px] truncate">{antigravityModel || 'Gemini 3.7 Flash (High)'}</span>
              </button>
              <div className="hidden items-center gap-1 text-[9px] text-neutral-600 xl:flex">
                <WandSparkles className="h-3 w-3" /> Paste with Ctrl+V
              </div>
            </div>
            <div className="flex items-center gap-1">
              {agentChat.length > 0 && !runningRequestId && (
                <button type="button" onClick={clearAgentChat} className="px-2 text-[9px] text-neutral-600 hover:text-neutral-300">
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
                  disabled={
                    (!draft.trim() && referenceImages.length === 0) ||
                    !activeScene ||
                    isAddingReference
                  }
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-[#3ce6ac] text-neutral-950 hover:brightness-110 disabled:bg-neutral-800 disabled:text-neutral-600"
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
