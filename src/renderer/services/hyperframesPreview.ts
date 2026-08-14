import gsapSource from '../../../node_modules/gsap/dist/gsap.min.js?raw'

const previewBridgeSource = String.raw`(() => {
  const SOURCE = 'gravity-hyperframes-preview'
  let timeline = null
  let duration = 0
  let paused = true
  let raf = 0

  const send = (type, detail = {}) => {
    parent.postMessage({ source: SOURCE, type, ...detail }, '*')
  }

  const numberAttr = (element, name) => {
    const value = Number(element && element.getAttribute(name))
    return Number.isFinite(value) ? value : 0
  }

  const updateTimedElements = (time, playing) => {
    document.querySelectorAll('[data-start]').forEach((element) => {
      const start = numberAttr(element, 'data-start')
      const clipDuration = numberAttr(element, 'data-duration')
      const active = time >= start && (clipDuration <= 0 || time < start + clipDuration)
      if (element instanceof HTMLElement) element.style.visibility = active ? 'visible' : 'hidden'
      if (!(element instanceof HTMLMediaElement)) return
      const mediaTime = Math.max(0, time - start)
      if (active && Math.abs(element.currentTime - mediaTime) > 0.2) {
        try { element.currentTime = mediaTime } catch {}
      }
      if (active && playing) void element.play().catch(() => {})
      else element.pause()
    })
  }

  const currentTime = () => {
    try {
      const value = Number(timeline && timeline.time())
      return Number.isFinite(value) ? Math.max(0, Math.min(duration, value)) : 0
    } catch {
      return 0
    }
  }

  const stopClock = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }

  const postState = () => {
    const time = currentTime()
    updateTimedElements(time, !paused)
    send('state', { currentTime: time, isPlaying: !paused, duration })
    return time
  }

  const tick = () => {
    if (paused) return
    const time = postState()
    if (time >= duration - 1 / 120) {
      paused = true
      try { timeline.pause() } catch {}
      stopClock()
      send('ended', { currentTime: duration, duration })
      return
    }
    raf = requestAnimationFrame(tick)
  }

  const seek = (requestedTime) => {
    const time = Math.max(0, Math.min(duration, Number(requestedTime) || 0))
    paused = true
    stopClock()
    try {
      timeline.pause()
      timeline.seek(time, false)
    } catch (error) {
      send('error', { message: error instanceof Error ? error.message : String(error) })
      return
    }
    postState()
  }

  const play = () => {
    if (!timeline) return
    if (currentTime() >= duration - 1 / 120) seek(0)
    paused = false
    try { timeline.play() } catch (error) {
      send('error', { message: error instanceof Error ? error.message : String(error) })
      return
    }
    stopClock()
    send('play', { currentTime: currentTime(), duration })
    raf = requestAnimationFrame(tick)
  }

  const pause = () => {
    paused = true
    stopClock()
    try { timeline && timeline.pause() } catch {}
    updateTimedElements(currentTime(), false)
    send('pause', { currentTime: currentTime(), duration })
  }

  window.addEventListener('message', (event) => {
    if (event.source !== parent) return
    const message = event.data
    if (!message || message.source !== 'hf-parent' || message.type !== 'control') return
    if (message.action === 'play') play()
    else if (message.action === 'pause') pause()
    else if (message.action === 'seek') seek(message.timeSeconds ?? Number(message.frame || 0) / 30)
    else if (message.action === 'set-playback-rate') {
      try { timeline && timeline.timeScale(Number(message.playbackRate) || 1) } catch {}
    }
  })

  const findTimeline = () => {
    const timelines = window.__timelines || {}
    const keys = Object.keys(timelines)
    const root = document.querySelector('[data-composition-id]')
    const compositionId = root && root.getAttribute('data-composition-id')
    timeline = (compositionId && timelines[compositionId]) || timelines[keys[keys.length - 1]] || null
    if (!timeline || typeof timeline.seek !== 'function' || typeof timeline.time !== 'function') return false

    const declared = numberAttr(root, 'data-duration')
    const timelineDuration = typeof timeline.duration === 'function' ? Number(timeline.duration()) : 0
    duration = declared > 0 ? declared : timelineDuration
    if (!(duration > 0)) return false
    try { timeline.pause() } catch {}
    updateTimedElements(0, false)
    send('ready', { duration, currentTime: 0 })
    return true
  }

  let attempts = 0
  const discover = () => {
    if (findTimeline()) return
    attempts += 1
    if (attempts >= 80) {
      send('error', { message: 'No seekable window.__timelines composition was found.' })
      return
    }
    setTimeout(discover, 100)
  }

  window.addEventListener('error', (event) => {
    send('error', { message: event.message || 'The composition script failed.' })
  })
  discover()
})()`

/**
 * The player normally discovers same-origin GSAP timelines and injects its
 * runtime. Generated scene HTML deliberately runs in an opaque-origin iframe,
 * so add a tiny host bridge up front and drive its registered timeline over
 * postMessage. The rendered source HTML remains unchanged for the CLI.
 */
export function prepareHyperframesPreviewHtml(html: string) {
  if (!html.trim()) return html

  let prepared = html.replace(
    /<script\b[^>]*\bsrc=["'][^"']*\bgsap(?:\.min)?\.js(?:\?[^"']*)?["'][^>]*>\s*<\/script>/gi,
    ''
  )
  const safeGsapSource = gsapSource.replace(/<\/script/gi, '<\\/script')
  const gsap = `<script data-gravity-gsap>${safeGsapSource}</script>`
  if (/<\/head>/i.test(prepared)) prepared = prepared.replace(/<\/head>/i, `${gsap}\n</head>`)
  else prepared = `${gsap}\n${prepared}`

  const safeBridgeSource = previewBridgeSource.replace(/<\/script/gi, '<\\/script')
  const bridge = `<script data-gravity-hyperframes-preview>${safeBridgeSource}</script>`
  if (/<\/body>/i.test(prepared)) return prepared.replace(/<\/body>/i, `${bridge}\n</body>`)
  return `${prepared}\n${bridge}`
}
