(() => {
  const SOURCE = 'gravity-frames-studio'
  const INSTANT_VIDEO_ID = 'gravity-frames-instant-video'
  const SETTINGS_ID = 'gravity-frames-settings'
  const SIDEBAR_CHAT_ID = 'gravity-frames-sidebar-chat'
  const SIDEBAR_CHAT_STORAGE_KEY = 'gravity-frames-sidebar-chat-active'
  const AGENT_STATUS_ID = 'gravity-frames-agent-status'
  let instantVideoActive = false
  let scheduled = false
  let nativeMode = 'Preview'
  let activeTabClass = ''
  let inactiveTabClass = ''
  let pendingClipboardAction = null
  let pendingClipboardTimer = null
  let originalClipboardWriteText = null
  let clipboardBridgeInstalled = false
  let agentStatusTimer = null
  let currentProjectName = ''
  let sidebarChatActive = false
  try {
    sidebarChatActive = sessionStorage.getItem(SIDEBAR_CHAT_STORAGE_KEY) === 'true'
  } catch {
    sidebarChatActive = false
  }
  let sidebarResizeObserver = null
  let observedSidebar = null
  let sidebarActiveTabClass = ''
  let sidebarInactiveTabClass = ''
  let pendingChildSeek = null
  let masterTimelineClips = []
  let masterTimelineDuration = 0
  let masterTimelineProjectId = ''
  let masterTimelineLoad = null
  let masterTimelineLoadedAt = 0

  const studioRoute = () => {
    const separator = location.hash.indexOf('?')
    const route = separator >= 0 ? location.hash.slice(0, separator) : location.hash
    const query = separator >= 0 ? location.hash.slice(separator + 1) : ''
    return { route, params: new URLSearchParams(query) }
  }

  const activeStudioProjectId = () => {
    const route = studioRoute().route
    const prefix = '#project/'
    if (!route.startsWith(prefix)) return ''
    try {
      return decodeURIComponent(route.slice(prefix.length))
    } catch {
      return route.slice(prefix.length)
    }
  }

  const finiteNumber = (value, fallback = 0) => {
    const parsed = Number.parseFloat(value || '')
    return Number.isFinite(parsed) ? parsed : fallback
  }

  const readMasterTimeline = (html) => {
    const documentCopy = new DOMParser().parseFromString(html, 'text/html')
    const root = documentCopy.querySelector(
      '[data-gravity-frames-master="1"][data-composition-id]'
    )
    if (!root) return { clips: [], duration: 0 }
    const clips = [...root.querySelectorAll('[data-composition-src]')]
      .map((host, index) => {
        const compositionId = host.getAttribute('data-composition-id')
        const compositionSrc = host.getAttribute('data-composition-src')
        const duration = finiteNumber(host.getAttribute('data-duration'))
        if (!compositionId || !compositionSrc || duration <= 0) return null
        const id = host.id || `${compositionId}-host-${index + 1}`
        const timelineLabel =
          host.getAttribute('data-timeline-label') ||
          host.getAttribute('data-label') ||
          compositionId
        return {
          id,
          label: timelineLabel,
          start: Math.max(0, finiteNumber(host.getAttribute('data-start'))),
          duration,
          track: Math.max(
            0,
            finiteNumber(host.getAttribute('data-track-index'), index)
          ),
          zIndex: finiteNumber(host.style.zIndex),
          stackingContextId: null,
          kind: 'composition',
          tagName: host.tagName.toLowerCase(),
          compositionId,
          compositionAncestors: [],
          parentCompositionId: null,
          nodePath: null,
          compositionSrc,
          playbackStart: Math.max(
            0,
            finiteNumber(host.getAttribute('data-playback-start'))
          ),
          playbackRate: Math.max(
            0.1,
            finiteNumber(host.getAttribute('data-playback-rate'), 1)
          ),
          assetUrl: null,
          timelineRole: host.getAttribute('data-timeline-role'),
          timelineLabel,
          timelineGroup: host.getAttribute('data-timeline-group'),
          timelinePriority: null,
        }
      })
      .filter(Boolean)
    return {
      clips,
      duration: Math.max(
        finiteNumber(root.getAttribute('data-duration')),
        ...clips.map((clip) => clip.start + clip.duration)
      ),
    }
  }

  const loadEmbeddedMasterTimeline = () => {
    const encoded = document
      .querySelector('meta[name="gravity-frames-master-timeline"]')
      ?.getAttribute('content')
    if (!encoded) return
    try {
      const bytes = Uint8Array.from(atob(encoded), (character) =>
        character.charCodeAt(0)
      )
      const parsed = JSON.parse(new TextDecoder().decode(bytes))
      if (!Array.isArray(parsed.clips)) return
      masterTimelineClips = parsed.clips
      masterTimelineDuration = finiteNumber(parsed.duration)
      masterTimelineProjectId = activeStudioProjectId()
      masterTimelineLoadedAt = Date.now()
    } catch {
      // The normal project-file request below remains available as a fallback.
    }
  }

  loadEmbeddedMasterTimeline()

  const updateEmbeddedMasterTimeline = () => {
    const meta = document.querySelector('meta[name="gravity-frames-master-timeline"]')
    if (!meta) return
    try {
      const bytes = new TextEncoder().encode(
        JSON.stringify({ clips: masterTimelineClips, duration: masterTimelineDuration })
      )
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      meta.setAttribute('content', btoa(binary))
    } catch {
      // Keep the last valid embedded manifest if encoding fails.
    }
  }

  const refreshMasterTimeline = async (force = false) => {
    if (studioRoute().params.has('comp')) return masterTimelineClips
    const projectId = activeStudioProjectId()
    if (!projectId) return []
    const now = Date.now()
    if (
      !force &&
      projectId === masterTimelineProjectId &&
      masterTimelineClips.length > 0 &&
      now - masterTimelineLoadedAt < 1000
    ) {
      return masterTimelineClips
    }
    if (masterTimelineLoad) return await masterTimelineLoad
    masterTimelineLoad = fetch(
      `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(
        'index.html'
      )}`,
      { cache: 'no-store' }
    )
      .then((response) => {
        if (!response.ok) throw new Error(`Could not read index.html (${response.status}).`)
        return response.json()
      })
      .then((payload) => {
        const parsed = readMasterTimeline(String(payload.content || ''))
        masterTimelineProjectId = projectId
        masterTimelineClips = parsed.clips
        masterTimelineDuration = parsed.duration
        masterTimelineLoadedAt = Date.now()
        updateEmbeddedMasterTimeline()
        return masterTimelineClips
      })
      .catch(() => masterTimelineClips)
      .finally(() => {
        masterTimelineLoad = null
      })
    return await masterTimelineLoad
  }

  const mergeMasterTimelineManifest = (data) => {
    if (studioRoute().params.has('comp')) return
    if (
      !Array.isArray(data?.clips) ||
      masterTimelineClips.length === 0
    ) {
      return data
    }
    const receivedById = new Map(data.clips.map((clip) => [clip?.id, clip]))
    data.clips = masterTimelineClips.map((authored) => ({
      ...(receivedById.get(authored.id) || {}),
      ...authored,
    }))
    const fpsNumerator = finiteNumber(data.fps?.numerator)
    const fpsDenominator = finiteNumber(data.fps?.denominator, 1)
    const fps =
      fpsNumerator > 0 && fpsDenominator > 0
        ? fpsNumerator / fpsDenominator
        : data.durationSeconds > 0
          ? data.durationInFrames / data.durationSeconds
          : 30
    if (Number.isFinite(data.durationSeconds)) {
      data.durationSeconds = Math.max(data.durationSeconds, masterTimelineDuration)
    }
    if (Number.isFinite(data.durationInFrames) && fps > 0) {
      data.durationInFrames = Math.max(
        data.durationInFrames,
        Math.round(masterTimelineDuration * fps)
      )
    }
    return data
  }

  const mergeMasterTimelineMessage = (event) => {
    mergeMasterTimelineManifest(event.data)
  }

  window.addEventListener('message', mergeMasterTimelineMessage, true)

  const buttonByLabel = (label) =>
    [...document.querySelectorAll('button[role="tab"]')].find(
      (button) => button.textContent?.trim() === label
    )

  const sendView = (view) => {
    window.parent.postMessage({ source: SOURCE, type: 'view-change', view }, '*')
  }

  const sidebarElements = () => {
    const nativeButtons = ['Code', 'Comps', 'Assets', 'Catalog']
      .map((label) =>
        [...document.querySelectorAll('button')].find(
          (button) => button.textContent?.trim() === label
        )
      )
      .filter(Boolean)
    if (nativeButtons.length !== 4) return null
    const tabGrid = nativeButtons[0].parentElement?.parentElement
    if (!tabGrid || !nativeButtons.every((button) => tabGrid.contains(button))) {
      return null
    }
    const header = tabGrid.parentElement?.parentElement
    const sidebar = header?.parentElement
    if (!header || !sidebar) return null
    return { nativeButtons, tabGrid, header, sidebar }
  }

  const sendSidebarChatState = () => {
    const elements = sidebarElements()
    if (!sidebarChatActive || !elements) {
      window.parent.postMessage(
        { source: SOURCE, type: 'sidebar-chat-state', active: false },
        '*'
      )
      return
    }
    const sidebarRect = elements.sidebar.getBoundingClientRect()
    const headerRect = elements.header.getBoundingClientRect()
    window.parent.postMessage(
      {
        source: SOURCE,
        type: 'sidebar-chat-state',
        active: true,
        bounds: {
          left: sidebarRect.left,
          top: headerRect.bottom,
          width: sidebarRect.width,
          height: Math.max(0, sidebarRect.bottom - headerRect.bottom),
        },
      },
      '*'
    )
  }

  const updateSidebarChatAppearance = (selectedNativeButton = null) => {
    const elements = sidebarElements()
    const chatButton = document.getElementById(SIDEBAR_CHAT_ID)
    if (!elements || !chatButton) return
    const selectedByStudio =
      selectedNativeButton ||
      elements.nativeButtons.find((button) =>
        String(button.className).includes('bg-neutral-800')
      )
    if (!sidebarChatActive && selectedByStudio) {
      sidebarActiveTabClass = selectedByStudio.className
      sidebarInactiveTabClass =
        elements.nativeButtons.find((button) => button !== selectedByStudio)?.className ||
        sidebarInactiveTabClass
    }
    sidebarActiveTabClass ||=
      'rounded-[14px] px-1.5 py-2 text-[10px] font-semibold truncate bg-neutral-800 text-white'
    sidebarInactiveTabClass ||=
      'rounded-[14px] px-1.5 py-2 text-[10px] font-semibold truncate text-neutral-500 hover:text-neutral-200'
    chatButton.className = sidebarChatActive
      ? sidebarActiveTabClass
      : sidebarInactiveTabClass
    chatButton.setAttribute('aria-selected', String(sidebarChatActive))
    if (sidebarChatActive) {
      for (const button of elements.nativeButtons) {
        button.className = sidebarInactiveTabClass
        button.setAttribute('aria-selected', 'false')
      }
    } else if (selectedNativeButton) {
      for (const button of elements.nativeButtons) {
        const selected = button === selectedNativeButton
        button.className = selected ? sidebarActiveTabClass : sidebarInactiveTabClass
        button.setAttribute('aria-selected', String(selected))
      }
    }
  }

  const setSidebarChatActive = (active, selectedNativeButton = null) => {
    sidebarChatActive = Boolean(active)
    try {
      sessionStorage.setItem(
        SIDEBAR_CHAT_STORAGE_KEY,
        String(sidebarChatActive)
      )
    } catch {
      // Session storage is optional; the parent still retains the open panel.
    }
    updateSidebarChatAppearance(selectedNativeButton)
    sendSidebarChatState()
  }

  const installSidebarChat = () => {
    const elements = sidebarElements()
    if (!elements) {
      return
    }
    elements.tabGrid.style.gridTemplateColumns = 'repeat(5, minmax(0, 1fr))'
    let chatButton = document.getElementById(SIDEBAR_CHAT_ID)
    if (!chatButton) {
      chatButton = elements.nativeButtons[3].cloneNode(false)
      chatButton.id = SIDEBAR_CHAT_ID
      chatButton.type = 'button'
      chatButton.textContent = 'Chat'
      chatButton.title = 'Chat with Antigravity'
      chatButton.removeAttribute('aria-selected')
      chatButton.addEventListener('click', () => setSidebarChatActive(true))
      elements.tabGrid.appendChild(chatButton)
    }
    for (const button of elements.nativeButtons) {
      if (button.dataset.gravityChatBound === 'true') continue
      button.dataset.gravityChatBound = 'true'
      button.addEventListener('click', () => {
        window.setTimeout(() => setSidebarChatActive(false, button), 0)
      })
    }
    if (observedSidebar !== elements.sidebar && typeof ResizeObserver !== 'undefined') {
      sidebarResizeObserver?.disconnect()
      observedSidebar = elements.sidebar
      sidebarResizeObserver = new ResizeObserver(() => {
        if (sidebarChatActive) sendSidebarChatState()
      })
      sidebarResizeObserver.observe(elements.sidebar)
    }
    updateSidebarChatAppearance()
    if (sidebarChatActive) sendSidebarChatState()
  }

  const showAgentStatus = (state, message) => {
    let status = document.getElementById(AGENT_STATUS_ID)
    if (!status) {
      status = document.createElement('div')
      status.id = AGENT_STATUS_ID
      status.setAttribute('role', 'status')
      status.setAttribute('aria-live', 'polite')
      const indicator = document.createElement('span')
      indicator.setAttribute('data-gravity-agent-indicator', '')
      const copy = document.createElement('span')
      copy.setAttribute('data-gravity-agent-message', '')
      status.append(indicator, copy)
      document.body.appendChild(status)
    }
    status.dataset.state = state
    status.querySelector('[data-gravity-agent-message]').textContent = message
    document.documentElement.toggleAttribute(
      'data-gravity-agent-running',
      state === 'running'
    )
    if (agentStatusTimer) window.clearTimeout(agentStatusTimer)
    if (state !== 'running') {
      agentStatusTimer = window.setTimeout(
        () => status?.remove(),
        state === 'error' ? 8000 : 5000
      )
    }
  }

  const postAgentRun = (prompt, surface, label) => {
    const normalizedPrompt = String(prompt || '').trim()
    if (!normalizedPrompt) {
      showAgentStatus('error', 'The agent prompt is empty.')
      return
    }
    showAgentStatus('running', `Starting Antigravity for ${label}...`)
    window.parent.postMessage(
      {
        source: SOURCE,
        type: 'agent-run',
        prompt: normalizedPrompt,
        surface,
        label,
      },
      '*'
    )
  }

  const armClipboardAction = (surface, label) => {
    pendingClipboardAction = { surface, label }
    if (pendingClipboardTimer) window.clearTimeout(pendingClipboardTimer)
    pendingClipboardTimer = window.setTimeout(() => {
      pendingClipboardAction = null
    }, 60_000)
  }

  const consumeClipboardAction = () => {
    const action = pendingClipboardAction
    pendingClipboardAction = null
    if (pendingClipboardTimer) window.clearTimeout(pendingClipboardTimer)
    pendingClipboardTimer = null
    return action
  }

  const installClipboardBridge = () => {
    if (clipboardBridgeInstalled || !navigator.clipboard?.writeText) return
    originalClipboardWriteText = navigator.clipboard.writeText.bind(navigator.clipboard)
    const bridgedWriteText = async (text) => {
      const action = consumeClipboardAction()
      if (!action) return await originalClipboardWriteText(text)
      postAgentRun(text, action.surface, action.label)
    }
    try {
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true,
        value: bridgedWriteText,
      })
      clipboardBridgeInstalled = navigator.clipboard.writeText === bridgedWriteText
    } catch {
      clipboardBridgeInstalled = false
    }
  }

  const updateTabAppearance = () => {
    const instantButton = document.getElementById(INSTANT_VIDEO_ID)
    const storyboardButton = buttonByLabel('Storyboard')
    const previewButton = buttonByLabel('Preview')
    if (!instantButton || !storyboardButton || !previewButton) return

    const selectedByStudio = [storyboardButton, previewButton].find(
      (button) => button.getAttribute('aria-selected') === 'true'
    )
    if (!instantVideoActive && selectedByStudio) {
      nativeMode = selectedByStudio.textContent?.trim() || nativeMode
      activeTabClass = selectedByStudio.className
      inactiveTabClass =
        [storyboardButton, previewButton].find(
          (button) => button !== selectedByStudio
        )?.className || inactiveTabClass
    }
    activeTabClass ||=
      'rounded px-3 py-1 text-[11px] font-medium bg-neutral-200 text-neutral-900'
    inactiveTabClass ||=
      'rounded px-3 py-1 text-[11px] font-medium text-neutral-400 hover:text-neutral-200'

    instantButton.className = instantVideoActive ? activeTabClass : inactiveTabClass
    instantButton.setAttribute('aria-selected', String(instantVideoActive))
    instantButton.tabIndex = instantVideoActive ? 0 : -1
    for (const button of [storyboardButton, previewButton]) {
      const selected =
        !instantVideoActive && button.textContent?.trim() === nativeMode
      button.className = selected ? activeTabClass : inactiveTabClass
      button.setAttribute('aria-selected', String(selected))
      button.tabIndex = selected ? 0 : -1
    }
  }

  const installBrand = (tabList) => {
    const header = tabList.parentElement
    const logoArea = header?.firstElementChild
    if (!logoArea || logoArea.querySelector('[data-gravity-frames-logo]')) return
    const hyperframesLogo = logoArea.querySelector('svg')
    if (!hyperframesLogo) return
    hyperframesLogo.setAttribute('data-gravity-frames-original-logo', '')
    const logo = document.createElement('img')
    logo.src = '/gravity-frames-logo.jpg'
    logo.alt = 'Gravity Frames'
    logo.title = 'Gravity Frames'
    logo.setAttribute('data-gravity-frames-logo', '')
    logoArea.insertBefore(logo, hyperframesLogo)
    document.title = 'Gravity Frames Studio'
  }

  const updateProjectDisplay = (tabList) => {
    if (!currentProjectName) return
    const header = tabList.parentElement
    const logoArea = header?.firstElementChild
    if (!logoArea) return
    const projectLabel = [...logoArea.querySelectorAll('*')].find((element) => {
      if (element.children.length > 0) return false
      const value = element.textContent?.trim() || ''
      return (
        /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value) ||
        element.hasAttribute('data-gravity-project-label')
      )
    })
    if (!projectLabel) return
    projectLabel.setAttribute('data-gravity-project-label', '')
    projectLabel.textContent = currentProjectName
    projectLabel.setAttribute('title', currentProjectName)
  }

  const installSettingsButton = (tabList) => {
    if (document.getElementById(SETTINGS_ID)) return
    const header = tabList.parentElement
    const actions = header?.lastElementChild
    if (!actions) return
    const actionButtons = [...actions.querySelectorAll('button')]
    const reference =
      actionButtons.find((button) => button.textContent?.trim() === 'Inspector') ||
      actionButtons[0]
    const button = reference?.cloneNode(false) || document.createElement('button')
    button.id = SETTINGS_ID
    button.type = 'button'
    button.textContent = 'Settings'
    button.title = 'Gravity Frames project settings'
    button.removeAttribute('aria-selected')
    button.removeAttribute('tabindex')
    button.addEventListener('click', () => sendView('settings'))
    const exportButton = actionButtons.find(
      (candidate) => candidate.textContent?.trim() === 'Export'
    )
    const exportContainer = exportButton
      ? [...actions.children].find(
          (child) => child === exportButton || child.contains(exportButton)
        )
      : null
    actions.insertBefore(button, exportContainer || null)
  }

  const bindNativeTab = (button) => {
    if (button.dataset.gravityFramesBound === 'true') return
    button.dataset.gravityFramesBound = 'true'
    button.addEventListener('click', () => {
      setSidebarChatActive(false)
      nativeMode = button.textContent?.trim() || nativeMode
      instantVideoActive = false
      sendView('studio')
      window.setTimeout(updateTabAppearance, 0)
    })
  }

  const installTabs = () => {
    const storyboardButton = buttonByLabel('Storyboard')
    const previewButton = buttonByLabel('Preview')
    const tabList = storyboardButton?.closest('[role="tablist"]')
    if (!storyboardButton || !previewButton || !tabList) return

    bindNativeTab(storyboardButton)
    bindNativeTab(previewButton)
    installBrand(tabList)
    updateProjectDisplay(tabList)
    installSettingsButton(tabList)

    let instantButton = document.getElementById(INSTANT_VIDEO_ID)
    if (!instantButton) {
      instantButton = previewButton.cloneNode(false)
      instantButton.id = INSTANT_VIDEO_ID
      instantButton.textContent = 'Instant Video'
      instantButton.removeAttribute('data-gravity-frames-bound')
      instantButton.addEventListener('click', () => {
        setSidebarChatActive(false)
        instantVideoActive = true
        updateTabAppearance()
        sendView('instant-video')
      })
      instantButton.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        instantVideoActive = false
        const target = event.key === 'ArrowLeft' ? previewButton : storyboardButton
        target.click()
        target.focus()
      })
      tabList.appendChild(instantButton)
    }
    updateTabAppearance()
  }

  const closestPromptBlock = (button) => {
    let current = button.parentElement
    for (let depth = 0; current && depth < 7; depth += 1) {
      const prompt = current.querySelector('pre')
      if (prompt && /Prompt for (?:your agent|Antigravity)/i.test(current.textContent || '')) {
        return prompt.textContent || ''
      }
      current = current.parentElement
    }
    return ''
  }

  const patchAgentModal = () => {
    const dialog = document.querySelector(
      '[role="dialog"][aria-label="Copy prompt to AI agent"], [role="dialog"][data-gravity-agent-dialog]'
    )
    if (!dialog) return
    dialog.setAttribute('data-gravity-agent-dialog', '')
    dialog.setAttribute('aria-label', 'Ask Antigravity about this element')
    const heading = dialog.querySelector('h3')
    if (heading) heading.textContent = 'Ask Antigravity'
    const submitButton = [...dialog.querySelectorAll('button')].find(
      (button) =>
        button.dataset.gravityAgentMode === 'clipboard' ||
        /^(Copy prompt|Send to Antigravity)$/.test(button.textContent?.trim() || '')
    )
    if (submitButton) {
      submitButton.dataset.gravityAgentMode = 'clipboard'
      submitButton.dataset.gravityAgentSurface = 'element'
      submitButton.dataset.gravityAgentLabel = 'the selected element'
      submitButton.textContent = 'Send to Antigravity'
    }
    for (const span of dialog.querySelectorAll('span')) {
      if (span.textContent?.includes('to copy')) {
        span.textContent = span.textContent.replace('to copy', 'to send')
      }
    }
  }

  const patchStoryboardButtons = () => {
    for (const button of document.querySelectorAll('button')) {
      const label = button.textContent?.trim() || ''
      if (button.closest('[data-gravity-agent-dialog]')) continue
      if (label === 'Copy prompt' && closestPromptBlock(button)) {
        button.dataset.gravityAgentMode = 'direct'
        button.dataset.gravityAgentSurface = 'storyboard'
        button.dataset.gravityAgentLabel = 'the storyboard plan'
        button.textContent = 'Run Antigravity'
        continue
      }
      if (/^Save & copy message/.test(label)) {
        button.dataset.gravityAgentMode = 'clipboard'
        button.dataset.gravityAgentSurface = 'storyboard'
        button.dataset.gravityAgentLabel = 'the saved storyboard feedback'
        button.textContent = label.replace(
          'Save & copy message',
          'Save & run Antigravity'
        )
        continue
      }
      if (
        [
          'Copy prompt for agent',
          'Copied — paste in your agent chat',
          'Copy again',
          'Copy failed',
        ].includes(label)
      ) {
        button.dataset.gravityAgentMode = 'clipboard'
        button.dataset.gravityAgentSurface = 'storyboard'
        button.dataset.gravityAgentLabel = 'the storyboard feedback'
        button.textContent = label === 'Copy again' ? 'Run again' : 'Run Antigravity'
        continue
      }
      if (label === 'Copy approval message') {
        button.dataset.gravityAgentMode = 'clipboard'
        button.dataset.gravityAgentSurface = 'storyboard'
        button.dataset.gravityAgentLabel = 'the storyboard approval'
        button.textContent = 'Send approval'
      }
    }
  }

  const patchLintButtons = () => {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter((dialog) =>
      /lint/i.test(dialog.getAttribute('aria-label') || '')
    )
    for (const dialog of dialogs) {
      const button = [...dialog.querySelectorAll('button')].find((candidate) =>
        /^(Copy to Agent|Run Antigravity|Copied!|Run again|Copy failed)/.test(
          candidate.textContent?.trim() || ''
        )
      )
      if (!button) continue
      const label = button.textContent?.trim() || ''
      button.dataset.gravityAgentMode = 'clipboard'
      button.dataset.gravityAgentSurface = 'lint'
      button.dataset.gravityAgentLabel = 'the lint findings'
      button.textContent = /^(Copied!|Run again)/.test(label)
        ? 'Run again'
        : 'Run Antigravity'
    }
  }

  const TEXT_REPLACEMENTS = [
    ['Prompt for your agent', 'Prompt for Antigravity'],
    ['Hand this prompt to your coding agent to scaffold it.', 'Run Antigravity here to scaffold it.'],
    ['Next: return to your agent chat', 'Next: run Antigravity'],
    [
      'Feedback is saved, but the agent has not been notified. Paste this prompt in your terminal or IDE agent chat.',
      'Feedback is saved. Run Antigravity to apply it directly.',
    ],
    [
      'Paste the agent prompt in your terminal or IDE chat.',
      'Run Antigravity to apply the saved feedback.',
    ],
    ['The agent has not been notified yet.', 'Ready to run with Antigravity.'],
    [
      'Save this batch and copy the message for your agent.',
      'Save this batch and run Antigravity directly.',
    ],
  ]

  const patchStudioCopy = () => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      for (const [before, after] of TEXT_REPLACEMENTS) {
        if (node.nodeValue?.includes(before)) {
          node.nodeValue = node.nodeValue.replace(before, after)
        }
      }
      node = walker.nextNode()
    }
  }

  const installAgentActions = () => {
    installClipboardBridge()
    patchAgentModal()
    patchStoryboardButtons()
    patchLintButtons()
    patchStudioCopy()
  }

  const updateCompositionScope = () => {
    const isChildComposition = studioRoute().params.has('comp')
    document.documentElement.toggleAttribute(
      'data-gravity-master-composition-view',
      !isChildComposition
    )
    if (!isChildComposition) {
      void refreshMasterTimeline()
    }
  }

  const applyPendingChildSeek = (attempt = 0) => {
    if (!pendingChildSeek) return
    const { route, params } = studioRoute()
    if (!params.has('comp')) {
      if (attempt < 8) {
        window.setTimeout(() => applyPendingChildSeek(attempt + 1), 25)
      } else {
        pendingChildSeek = null
      }
      return
    }
    const targetTime = pendingChildSeek
    pendingChildSeek = null
    const currentTime = Number.parseFloat(params.get('t') || '0')
    if (Math.abs(currentTime - targetTime) < 0.001) return
    params.set('t', targetTime.toFixed(3))
    location.hash = `${route}?${params.toString()}`
  }

  const installCompositionNavigation = () => {
    if (document.documentElement.dataset.gravityCompositionNavigation === 'true') {
      return
    }
    document.documentElement.dataset.gravityCompositionNavigation = 'true'
    document.addEventListener(
      'dblclick',
      (event) => {
        if (studioRoute().params.has('comp')) return
        const clip = event.target?.closest?.(
          'button[data-clip][data-el-id^="index.html#"]'
        )
        if (!clip || !/Double-click to open/i.test(clip.title || '')) return
        const masterTime = Number.parseFloat(studioRoute().params.get('t') || '0')
        const layerStart = Number.parseFloat(clip.dataset.clipStart || '0')
        pendingChildSeek = Math.max(0, masterTime - layerStart)
        window.setTimeout(() => applyPendingChildSeek(), 0)
      },
      true
    )
  }

  document.addEventListener(
    'click',
    (event) => {
      const button = event.target?.closest?.('button[data-gravity-agent-mode]')
      if (!button) return
      const surface = button.dataset.gravityAgentSurface || 'studio'
      const label = button.dataset.gravityAgentLabel || 'this request'
      if (button.dataset.gravityAgentMode === 'direct') {
        event.preventDefault()
        event.stopImmediatePropagation()
        postAgentRun(closestPromptBlock(button), surface, label)
        return
      }
      armClipboardAction(surface, label)
    },
    true
  )

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return
      if (!event.target?.closest?.('[data-gravity-agent-dialog]')) return
      armClipboardAction('element', 'the selected element')
    },
    true
  )

  const install = () => {
    scheduled = false
    updateCompositionScope()
    installCompositionNavigation()
    installTabs()
    installAgentActions()
    installSidebarChat()
  }

  const scheduleInstall = () => {
    if (scheduled) return
    scheduled = true
    window.requestAnimationFrame(install)
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return
    if (event.data?.source !== SOURCE) return
    if (event.data?.type === 'instant-video-state') {
      instantVideoActive = Boolean(event.data.active)
      updateTabAppearance()
      return
    }
    if (event.data?.type === 'agent-status') {
      showAgentStatus(
        String(event.data.state || 'error'),
        String(event.data.message || 'Antigravity status changed.')
      )
      return
    }
    if (event.data?.type === 'project-context') {
      currentProjectName = String(event.data.name || '').trim().slice(0, 120)
      const storyboardButton = buttonByLabel('Storyboard')
      const tabList = storyboardButton?.closest('[role="tablist"]')
      if (tabList) updateProjectDisplay(tabList)
    }
  })

  window.addEventListener('resize', () => {
    if (sidebarChatActive) sendSidebarChatState()
  })
  window.addEventListener('hashchange', scheduleInstall)

  new MutationObserver(scheduleInstall).observe(document.documentElement, {
    childList: true,
    subtree: true,
  })
  scheduleInstall()
})()
