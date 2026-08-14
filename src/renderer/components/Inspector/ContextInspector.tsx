import React, { KeyboardEvent, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  Captions,
  Check,
  Crop,
  Image as ImageIcon,
  KeyRound,
  Search,
  SlidersHorizontal,
  Trash2,
  Video,
  Youtube,
} from 'lucide-react'
import { ImageSearchResult, YouTubeSearchResult } from '../../../types/editor'
import { useEditorStore } from '../../../store/useEditorStore'
import {
  formatTimecode,
  splitTimecode,
  TimecodePart,
  updateTimecodePart,
} from '../../utils/timecode'

type InspectorTab = 'properties' | 'media' | 'subtitles'
type SearchTab = 'duckduckgo' | 'pexels-image' | 'pexels-video' | 'youtube'

export default function ContextInspector() {
  const {
    scenes,
    videoTracks,
    audioClips,
    subtitles,
    activeSceneId,
    activeAudioClipId,
    activeSubtitleId,
    projectId,
    setActiveSubtitleId,
    addMediaAssets,
    assignMediaToScene,
    updateScene,
    updateAudioClip,
    updateSubtitle,
    splitSubtitle,
    apiKeys,
    subtitleSettings,
    updateSubtitleSettings,
  } = useEditorStore(
    useShallow((state) => ({
      scenes: state.scenes,
      videoTracks: state.videoTracks,
      audioClips: state.audioClips,
      subtitles: state.subtitles,
      activeSceneId: state.activeSceneId,
      activeAudioClipId: state.activeAudioClipId,
      activeSubtitleId: state.activeSubtitleId,
      projectId: state.projectId,
      setActiveSubtitleId: state.setActiveSubtitleId,
      addMediaAssets: state.addMediaAssets,
      assignMediaToScene: state.assignMediaToScene,
      updateScene: state.updateScene,
      updateAudioClip: state.updateAudioClip,
      updateSubtitle: state.updateSubtitle,
      splitSubtitle: state.splitSubtitle,
      apiKeys: state.apiKeys,
      subtitleSettings: state.subtitleSettings,
      updateSubtitleSettings: state.updateSubtitleSettings,
    }))
  )
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('properties')
  const [activeTab, setActiveTab] = useState<SearchTab>('duckduckgo')
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [selectedYoutube, setSelectedYoutube] = useState<YouTubeSearchResult | null>(null)
  const [selectedPexels, setSelectedPexels] = useState<any | null>(null)
  const [ytStart, setYtStart] = useState(0)
  const [isTrimming, setIsTrimming] = useState(false)
  const [trimProgress, setTrimProgress] = useState<number | null>(null)
  const [youtubePreviewTime, setYoutubePreviewTime] = useState<number | null>(null)
  const youtubeFrameRef = useRef<HTMLIFrameElement>(null)

  const activeScene = scenes.find((scene) => scene.id === activeSceneId)
  const activeAudioClip = audioClips.find((clip) => clip.id === activeAudioClipId)
  const activeSubtitle =
    subtitles.find((subtitle) => subtitle.id === activeSubtitleId) ||
    (activeScene
      ? subtitles.find(
          (subtitle) =>
            subtitle.startTimeSec < activeScene.endTimeSec &&
            subtitle.endTimeSec > activeScene.startTimeSec
        )
      : undefined)

  useEffect(() => {
    setSearchQuery(activeScene?.keywords[0] || '')
    setResults([])
    setSearchError(null)
    setHasSearched(false)
    setSelectedYoutube(null)
    setSelectedPexels(null)
    setYtStart(0)
    setTrimProgress(null)
    setYoutubePreviewTime(null)
  }, [activeScene?.id])

  useEffect(() => {
    window.electronAPI.onYouTubeTrimProgress((progress) => {
      setTrimProgress(Math.max(0, Math.min(100, progress)))
    })
  }, [])

  useEffect(() => {
    setTrimProgress(null)
    setYoutubePreviewTime(null)
    if (!selectedYoutube) return

    const requestCurrentTime = () => {
      const target = youtubeFrameRef.current?.contentWindow
      if (!target) return
      target.postMessage(
        JSON.stringify({ event: 'listening', id: 'rhymx-youtube-preview' }),
        'https://www.youtube.com'
      )
      target.postMessage(
        JSON.stringify({
          event: 'command',
          func: 'getCurrentTime',
          args: [],
          id: 'rhymx-youtube-preview',
        }),
        'https://www.youtube.com'
      )
    }
    const handleMessage = (event: MessageEvent) => {
      if (
        event.source !== youtubeFrameRef.current?.contentWindow ||
        !/^https:\/\/www\.youtube(?:-nocookie)?\.com$/.test(event.origin)
      ) {
        return
      }
      try {
        const data =
          typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        const currentTime = Number(data?.info?.currentTime)
        if (data?.event === 'infoDelivery' && Number.isFinite(currentTime)) {
          setYoutubePreviewTime(Math.max(0, currentTime))
        }
      } catch {
        // Ignore unrelated window messages.
      }
    }

    window.addEventListener('message', handleMessage)
    const interval = window.setInterval(requestCurrentTime, 500)
    requestCurrentTime()
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('message', handleMessage)
    }
  }, [selectedYoutube?.id])

  const handleSearch = async () => {
    const query = searchQuery.trim()
    if (!query) return
    setIsSearching(true)
    setSearchError(null)
    setHasSearched(true)
    setSelectedYoutube(null)
    setSelectedPexels(null)

    try {
      if (activeTab === 'duckduckgo') {
        setResults(await window.electronAPI.searchDuckDuckGoImages(query))
      } else if (activeTab === 'pexels-image') {
        setResults(await window.electronAPI.searchImages(query, apiKeys.pexels))
      } else if (activeTab === 'pexels-video') {
        if (!apiKeys.pexels.trim()) {
          throw new Error('Add a Pexels API key in Settings before searching Pexels Video.')
        }
        const response = await fetch(
          `https://api.pexels.com/v1/videos/search?query=${encodeURIComponent(query)}&per_page=12&orientation=landscape&size=medium`,
          { headers: { Authorization: apiKeys.pexels.trim() } }
        )
        if (!response.ok) throw new Error(`Pexels search failed (${response.status}).`)
        const data = await response.json()
        setResults(data.videos || [])
      } else {
        setResults(await window.electronAPI.searchYouTube(query, apiKeys.youtube))
      }
    } catch (error) {
      setResults([])
      setSearchError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsSearching(false)
    }
  }

  const applyImage = (image: ImageSearchResult) => {
    if (!activeSceneId) return
    assignMediaToScene(activeSceneId, {
      id: image.id,
      type: 'duckduckgo_image',
      sourceUrl: image.sourceUrl,
      thumbnailUrl: image.thumbnailUrl,
      title: image.title,
      imageFit: 'cover',
      enableKenBurnsEffect: true,
    })
  }

  const pexelsVideoUrl = (video: any) =>
    video?.video_files?.find(
      (item: any) => item.quality === 'hd' && item.width && item.width <= 1920
    )?.link ||
    video?.video_files?.find((item: any) => item.quality === 'hd')?.link ||
    video?.video_files?.[0]?.link ||
    ''

  const applyPexels = (video: any) => {
    if (!activeSceneId) return
    const sourceUrl = pexelsVideoUrl(video)
    if (!sourceUrl) return
    assignMediaToScene(activeSceneId, {
      id: `pex_${video.id}`,
      type: 'pexels_video',
      sourceUrl,
      thumbnailUrl: video.image,
      title: video.user?.name || video.url,
      sourceStartSec: 0,
      sourceDurationSec: Number(video.duration) || activeScene?.durationSec,
      providerUrl: video.url,
      creatorName: video.user?.name,
      creatorUrl: video.user?.url,
    })
  }

  const handleYoutubeTrim = async () => {
    if (!activeSceneId || !selectedYoutube || !activeScene || !projectId) return
    const start = Math.max(0, ytStart)
    const end = start + activeScene.durationSec
    setIsTrimming(true)
    setTrimProgress(0)
    setSearchError(null)
    try {
      const localPath = await window.electronAPI.trimYouTube(
        selectedYoutube.url,
        start,
        end,
        projectId
      )
      const mediaId = `yt_${Date.now()}`
      addMediaAssets([
        {
          id: mediaId,
          name: selectedYoutube.title,
          path: localPath,
          kind: 'video',
          durationSec: activeScene.durationSec,
          origin: 'youtube',
          thumbnailUrl: selectedYoutube.thumbnailUrl,
          providerUrl: selectedYoutube.url,
          providerStartSec: start,
        },
      ])
      assignMediaToScene(activeSceneId, {
        id: mediaId,
        type: 'youtube_clip',
        kind: 'video',
        sourceUrl: localPath,
        thumbnailUrl: selectedYoutube.thumbnailUrl,
        title: selectedYoutube.title,
        sourceStartSec: 0,
        sourceDurationSec: activeScene.durationSec,
        providerUrl: selectedYoutube.url,
        providerStartSec: start,
        missing: false,
      })
    } catch (error) {
      setTrimProgress(null)
      setSearchError(
        error instanceof Error ? error.message : 'Failed to download the YouTube clip.'
      )
    } finally {
      setIsTrimming(false)
    }
  }

  const setYoutubeTimestampPart = (
    part: TimecodePart,
    rawValue: string
  ) => {
    setYtStart(updateTimecodePart(ytStart, part, rawValue))
  }

  const handleSubtitleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || !activeSubtitle) return
    event.preventDefault()
    splitSubtitle(activeSubtitle.id, event.currentTarget.selectionStart)
  }

  return (
    <div className="flex flex-col h-full bg-[#111319] min-w-0">
      <div className="px-3 pt-3 bg-[#0e1016] border-b border-white/5">
        <h3 className="font-semibold text-sm text-white mb-3">Inspector</h3>
        <div className="flex">
          {([
            ['properties', SlidersHorizontal, 'Properties'],
            ['media', ImageIcon, 'Media'],
            ['subtitles', Captions, 'Subtitles'],
          ] as const).map(([tab, Icon, label]) => (
            <button
              key={tab}
              onClick={() => setInspectorTab(tab)}
              className={`flex-1 py-2.5 text-[10px] flex items-center justify-center gap-1 ${
                inspectorTab === tab
                  ? 'border-b-2 border-violet-500 text-violet-300'
                  : 'text-slate-600 hover:text-slate-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {inspectorTab === 'properties' ? (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4">
          {activeScene ? (
            <SceneProperties
              scene={activeScene}
              videoTracks={videoTracks}
              updateScene={updateScene}
              activeSubtitle={activeSubtitle}
              setActiveSubtitleId={setActiveSubtitleId}
              updateSubtitle={updateSubtitle}
              handleSubtitleKeyDown={handleSubtitleKeyDown}
            />
          ) : activeAudioClip ? (
            <div className="space-y-4">
              <div>
                <h4 className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                  Audio segment
                </h4>
                <div className="text-xs text-slate-200 truncate">{activeAudioClip.name}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberProperty
                  label="Start (seconds)"
                  value={activeAudioClip.startTimeSec}
                  minimum={0}
                  onChange={(startTimeSec) =>
                    updateAudioClip(activeAudioClip.id, { startTimeSec })
                  }
                />
                <NumberProperty
                  label="Duration (seconds)"
                  value={activeAudioClip.durationSec}
                  minimum={1 / 30}
                  maximum={
                    activeAudioClip.sourceDurationSec
                      ? activeAudioClip.sourceDurationSec -
                        (activeAudioClip.sourceStartSec ?? 0)
                      : undefined
                  }
                  onChange={(durationSec) =>
                    updateAudioClip(activeAudioClip.id, { durationSec })
                  }
                />
              </div>
              <PropertySlider
                label="Volume"
                value={activeAudioClip.volume}
                minimum={0}
                maximum={1}
                step={0.05}
                display={`${Math.round(activeAudioClip.volume * 100)}%`}
                onChange={(volume) => updateAudioClip(activeAudioClip.id, { volume })}
              />
            </div>
          ) : (
            <EmptyInspector text="Select a visual or audio segment in the timeline to edit its properties." />
          )}
        </div>
      ) : inspectorTab === 'subtitles' ? (
        <SubtitleSettingsPanel
          settings={subtitleSettings}
          updateSettings={updateSubtitleSettings}
        />
      ) : !activeScene ? (
        <EmptyInspector text="Select a visual segment before attaching searched media." />
      ) : (
        <>
          <div className="p-3 border-b border-white/5 bg-[#0e1016]">
            <div className="flex flex-wrap gap-1.5 mb-3">
              {activeScene.keywords.map((keyword) => (
                <button
                  key={keyword}
                  className="text-[9px] bg-violet-500/10 text-violet-300 px-2 py-1 rounded border border-violet-500/15 hover:bg-violet-500/20"
                  onClick={() => setSearchQuery(keyword)}
                >
                  {keyword}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 min-w-0 bg-[#090b10] border border-white/10 focus:border-violet-500/50 outline-none rounded-lg px-2.5 py-2 text-xs text-white"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
                placeholder={`Search ${tabLabel(activeTab)}…`}
              />
              <button
                onClick={handleSearch}
                disabled={isSearching}
                className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 p-2 rounded-lg text-white"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 border-b border-white/5">
            {([
              ['duckduckgo', ImageIcon, 'DuckDuckGo'],
              ['pexels-image', ImageIcon, 'Pexels Img'],
              ['pexels-video', Video, 'Pexels Vid'],
              ['youtube', Youtube, 'YouTube'],
            ] as const).map(([tab, Icon, label]) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab)
                  setResults([])
                  setHasSearched(false)
                  setSearchError(null)
                  setSelectedPexels(null)
                  setSelectedYoutube(null)
                }}
                className={`min-w-0 py-2 text-[9px] flex flex-col items-center gap-1 ${
                  activeTab === tab
                    ? 'border-b-2 border-violet-500 text-violet-300 bg-white/[0.025]'
                    : 'text-slate-600 hover:text-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="truncate max-w-full px-1">{label}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-3 custom-scrollbar">
            {searchError && (
              <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-[11px] text-red-300">
                {searchError}
                {activeTab === 'youtube' && !apiKeys.youtube && (
                  <div className="mt-2 flex items-center gap-1.5 text-red-200/70">
                    <KeyRound className="h-3 w-3" />
                    Add the required credential in the top-right Settings menu.
                  </div>
                )}
              </div>
            )}

            {isSearching ? (
              <div className="text-center text-xs text-slate-500 mt-10">Searching…</div>
            ) : (
              <div className="space-y-3">
                {activeTab === 'duckduckgo' && results.length > 0 && (
                  <div className="text-[9px] text-slate-600 text-right">
                    DuckDuckGo results · unofficial endpoint
                  </div>
                )}

                {(activeTab === 'duckduckgo' || activeTab === 'pexels-image') &&
                  (results as ImageSearchResult[]).map((image) => (
                    <ImageResult key={image.id} image={image} onUse={applyImage} />
                  ))}

                {activeTab === 'pexels-video' && selectedPexels && (
                  <div className="rounded-lg overflow-hidden border border-violet-500/40 bg-black/30">
                    <video
                      src={pexelsVideoUrl(selectedPexels)}
                      poster={selectedPexels.image}
                      controls
                      className="w-full aspect-video bg-black"
                    />
                    <button
                      onClick={() => applyPexels(selectedPexels)}
                      className="w-full bg-violet-600 hover:bg-violet-500 py-2 text-[10px]"
                    >
                      Use this video
                    </button>
                  </div>
                )}

                {activeTab === 'pexels-video' &&
                  results.map((video) => (
                    <button
                      key={video.id}
                      onClick={() => setSelectedPexels(video)}
                      className={`relative group w-full rounded-lg overflow-hidden border ${
                        selectedPexels?.id === video.id
                          ? 'border-violet-400'
                          : 'border-white/8 hover:border-violet-500/50'
                      }`}
                    >
                      <img src={video.image} alt="" className="w-full h-36 object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 text-transparent group-hover:text-white text-[10px]">
                        Preview
                      </span>
                    </button>
                  ))}

                {activeTab === 'youtube' && selectedYoutube && (
                  <div className="rounded-lg border border-red-500/25 bg-red-500/[0.04] overflow-hidden">
                    <iframe
                      ref={youtubeFrameRef}
                      src={`https://www.youtube.com/embed/${selectedYoutube.id}?playsinline=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`}
                      title={selectedYoutube.title}
                      className="w-full h-[200px] bg-black"
                      allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                    <div className="p-3">
                      <h4 className="text-[11px] font-medium text-slate-200 mb-2 flex items-center gap-2">
                        <Crop className="w-3.5 h-3.5 text-red-400" />
                        Trim selected result
                      </h4>
                      <div className="mb-3">
                        <div className="text-[9px] text-slate-500 mb-1">
                          Start timestamp
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(
                            [
                              ['hours', 'HH'],
                              ['minutes', 'MM'],
                              ['seconds', 'SS'],
                            ] as const
                          ).map(([part, label]) => {
                            const timestamp = splitTimecode(ytStart)
                            return (
                              <label key={part} className="text-[8px] text-slate-600">
                                {label}
                                <input
                                  type="number"
                                  min="0"
                                  step={part === 'seconds' ? '0.01' : '1'}
                                  inputMode="decimal"
                                  value={timestamp[part]}
                                  onChange={(event) =>
                                    setYoutubeTimestampPart(part, event.target.value)
                                  }
                                  className="mt-1 w-full bg-[#090b10] border border-white/10 rounded p-1.5 text-center text-[10px] text-white"
                                />
                              </label>
                            )
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            youtubePreviewTime !== null &&
                            setYtStart(youtubePreviewTime)
                          }
                          disabled={youtubePreviewTime === null}
                          className="mt-2 w-full rounded border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-40 py-1.5 text-[9px] text-slate-300"
                        >
                          {youtubePreviewTime === null
                            ? 'Play the preview to read its timestamp'
                            : `Use current preview time · ${formatTimecode(
                                youtubePreviewTime
                              )}`}
                        </button>
                      </div>
                      <div className="mb-3">
                        <div className="text-[9px] text-slate-500">
                          Segment duration
                          <div className="mt-1 rounded border border-white/10 bg-[#090b10] p-1.5 text-[10px] text-slate-300">
                            {activeScene.durationSec.toFixed(2)} seconds
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={handleYoutubeTrim}
                        disabled={isTrimming}
                        className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 py-2 rounded text-[10px] text-white"
                      >
                        {isTrimming ? 'Downloading clip…' : 'Add clip to segment'}
                      </button>
                      {trimProgress !== null && (
                        <div className="mt-2">
                          <div className="mb-1 flex items-center justify-between text-[8px] text-slate-500">
                            <span>
                              {trimProgress >= 100
                                ? 'Clip downloaded'
                                : 'Downloading and trimming'}
                            </span>
                            <span>{Math.round(trimProgress)}%</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-black/40">
                            <div
                              className={`h-full transition-[width] ${
                                trimProgress >= 100
                                  ? 'bg-emerald-500'
                                  : 'bg-red-500'
                              }`}
                              style={{ width: `${trimProgress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'youtube' &&
                  (results as YouTubeSearchResult[]).map((video) => (
                    <button
                      key={video.id}
                      onClick={() => setSelectedYoutube(video)}
                      className={`w-full text-left rounded-lg overflow-hidden border bg-black/20 ${
                        selectedYoutube?.id === video.id
                          ? 'border-red-500/70 ring-1 ring-red-500/30'
                          : 'border-white/8 hover:border-red-500/40'
                      }`}
                    >
                      <div className="relative">
                        <img
                          src={video.thumbnailUrl}
                          alt=""
                          className="w-full h-32 object-cover"
                        />
                        {selectedYoutube?.id === video.id && (
                          <span className="absolute top-2 right-2 h-6 w-6 rounded-full bg-red-600 flex items-center justify-center">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                      <div className="p-2.5">
                        <div className="text-[10px] text-slate-200 line-clamp-2">
                          {video.title}
                        </div>
                        <div className="text-[9px] text-slate-600 mt-1">
                          {video.channelTitle}
                        </div>
                      </div>
                    </button>
                  ))}

                {hasSearched && results.length === 0 && !searchError && (
                  <div className="text-center text-xs text-slate-600 mt-10">
                    No results for “{searchQuery}”. Try a broader phrase.
                  </div>
                )}
                {!hasSearched && (
                  <div className="text-center text-[11px] text-slate-600 mt-8 px-4">
                    Search for media using the scene keywords above.
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function SceneProperties({
  scene,
  videoTracks,
  updateScene,
  activeSubtitle,
  setActiveSubtitleId,
  updateSubtitle,
  handleSubtitleKeyDown,
}: {
  scene: ReturnType<typeof useEditorStore.getState>['scenes'][number]
  videoTracks: ReturnType<typeof useEditorStore.getState>['videoTracks']
  updateScene: ReturnType<typeof useEditorStore.getState>['updateScene']
  activeSubtitle: ReturnType<typeof useEditorStore.getState>['subtitles'][number] | undefined
  setActiveSubtitleId: ReturnType<typeof useEditorStore.getState>['setActiveSubtitleId']
  updateSubtitle: ReturnType<typeof useEditorStore.getState>['updateSubtitle']
  handleSubtitleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
}) {
  return (
    <div className="space-y-5">
      <section>
        <h4 className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">
          Visual segment
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <NumberProperty
            label="Start (seconds)"
            value={scene.startTimeSec}
            minimum={0}
            onChange={(startTimeSec) =>
              updateScene(scene.id, {
                startTimeSec,
                endTimeSec: startTimeSec + scene.durationSec,
              })
            }
          />
          <NumberProperty
            label="Duration (seconds)"
            value={scene.durationSec}
            minimum={1 / 30}
            maximum={
              scene.media?.sourceDurationSec
                ? scene.media.sourceDurationSec - (scene.media.sourceStartSec ?? 0)
                : undefined
            }
            onChange={(durationSec) =>
              updateScene(scene.id, {
                durationSec,
                endTimeSec: scene.startTimeSec + durationSec,
              })
            }
          />
        </div>
        <label className="block mt-3 text-[9px] text-slate-500">
          Video track
          <select
            value={scene.trackId}
            onChange={(event) => updateScene(scene.id, { trackId: event.target.value })}
            className="mt-1 w-full bg-[#090b10] border border-white/10 rounded p-2 text-[10px] text-white"
          >
            {videoTracks.map((track, index) => (
              <option key={track.id} value={track.id}>
                {index === 0 ? 'Main video' : track.name}
              </option>
            ))}
          </select>
        </label>
      </section>
      {scene.media && (
        <section className="rounded-lg border border-white/10 bg-black/15 p-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[9px] uppercase tracking-wider text-slate-500">
                Attached media
              </div>
              <div className="mt-1 truncate text-[11px] text-slate-300">
                {scene.media.title}
              </div>
              {scene.media.providerUrl && (
                <a
                  href={scene.media.providerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-[9px] text-violet-400 hover:text-violet-300"
                >
                  {scene.media.creatorName
                    ? `Video by ${scene.media.creatorName} on Pexels`
                    : 'View source on Pexels'}
                </a>
              )}
              {scene.media.sourceDurationSec && (
                <div className="mt-0.5 text-[9px] text-slate-600">
                  Source {(scene.media.sourceStartSec ?? 0).toFixed(2)}s –{' '}
                  {scene.media.sourceDurationSec.toFixed(2)}s
                </div>
              )}
            </div>
            <button
              onClick={() => updateScene(scene.id, { media: null })}
              className="h-8 px-2 rounded-md border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20 flex items-center gap-1.5 text-[9px]"
              title="Remove media from this segment"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
        </section>
      )}
      <section className="space-y-3">
        <h4 className="text-[10px] uppercase tracking-wider text-slate-500">
          Transform & audio
        </h4>
        <PropertySlider
          label="Volume"
          value={scene.volume}
          minimum={0}
          maximum={1}
          step={0.05}
          display={`${Math.round(scene.volume * 100)}%`}
          onChange={(volume) => updateScene(scene.id, { volume })}
        />
        <PropertySlider
          label="Scale"
          value={scene.scale}
          minimum={0.25}
          maximum={2}
          step={0.05}
          display={`${Math.round(scene.scale * 100)}%`}
          onChange={(scale) => updateScene(scene.id, { scale })}
        />
        <PropertySlider
          label="Opacity"
          value={scene.opacity}
          minimum={0}
          maximum={1}
          step={0.05}
          display={`${Math.round(scene.opacity * 100)}%`}
          onChange={(opacity) => updateScene(scene.id, { opacity })}
        />
      </section>
      <section>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[10px] uppercase tracking-wider text-slate-500">
            Subtitle segment
          </label>
          <span className="text-[9px] text-slate-600">
            Enter splits · Shift+Enter adds line
          </span>
        </div>
        <textarea
          value={activeSubtitle?.text || ''}
          onFocus={() => activeSubtitle && setActiveSubtitleId(activeSubtitle.id)}
          onChange={(event) =>
            activeSubtitle && updateSubtitle(activeSubtitle.id, event.target.value)
          }
          onKeyDown={handleSubtitleKeyDown}
          className="w-full h-24 resize-none text-xs text-slate-300 bg-[#090b10] p-2.5 rounded-lg border border-white/10 focus:border-violet-500/50 outline-none"
          placeholder="No subtitle at this scene"
        />
      </section>
    </div>
  )
}

function SubtitleSettingsPanel({
  settings,
  updateSettings,
}: {
  settings: ReturnType<typeof useEditorStore.getState>['subtitleSettings']
  updateSettings: ReturnType<typeof useEditorStore.getState>['updateSubtitleSettings']
}) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-5">
      <ToggleRow
        label="Show subtitles"
        enabled={settings.enabled}
        onChange={(enabled) => updateSettings({ enabled })}
      />
      <div className="grid grid-cols-2 gap-3">
        <ColorProperty
          label="Text color"
          value={settings.textColor}
          onChange={(textColor) => updateSettings({ textColor })}
        />
        <label className="text-[9px] text-slate-500">
          Position
          <select
            value={settings.position}
            onChange={(event) =>
              updateSettings({ position: event.target.value as 'bottom' | 'center' })
            }
            className="mt-1 w-full h-8 bg-[#090b10] border border-white/10 rounded px-2 text-[10px]"
          >
            <option value="bottom">Bottom</option>
            <option value="center">Center</option>
          </select>
        </label>
      </div>
      <PropertySlider
        label="Font size"
        value={settings.fontSize}
        minimum={24}
        maximum={96}
        step={1}
        display={`${settings.fontSize}px`}
        onChange={(fontSize) => updateSettings({ fontSize })}
      />
      <label className="block text-[9px] text-slate-500">
        Font family
        <select
          value={settings.fontFamily}
          onChange={(event) => updateSettings({ fontFamily: event.target.value })}
          className="mt-1 w-full h-8 bg-[#090b10] border border-white/10 rounded px-2 text-[10px]"
        >
          <option value="Inter, Arial, sans-serif">Inter</option>
          <option value="Arial, sans-serif">Arial</option>
          <option value="Georgia, serif">Georgia</option>
          <option value="'Trebuchet MS', sans-serif">Trebuchet</option>
          <option value="'Courier New', monospace">Courier</option>
        </select>
      </label>
      <PropertySlider
        label="Font weight"
        value={settings.fontWeight}
        minimum={400}
        maximum={900}
        step={100}
        display={String(settings.fontWeight)}
        onChange={(fontWeight) => updateSettings({ fontWeight })}
      />

      <section className="border-t border-white/5 pt-4 space-y-3">
        <ToggleRow
          label="Subtitle background"
          enabled={settings.backgroundEnabled}
          onChange={(backgroundEnabled) => updateSettings({ backgroundEnabled })}
        />
        {settings.backgroundEnabled && (
          <>
            <ColorProperty
              label="Background color"
              value={settings.backgroundColor}
              onChange={(backgroundColor) => updateSettings({ backgroundColor })}
            />
            <PropertySlider
              label="Background opacity"
              value={settings.backgroundOpacity}
              minimum={0}
              maximum={1}
              step={0.05}
              display={`${Math.round(settings.backgroundOpacity * 100)}%`}
              onChange={(backgroundOpacity) => updateSettings({ backgroundOpacity })}
            />
          </>
        )}
      </section>

      <section className="border-t border-white/5 pt-4 space-y-3">
        <ToggleRow
          label="Text outline"
          enabled={settings.outlineEnabled}
          onChange={(outlineEnabled) => updateSettings({ outlineEnabled })}
        />
        {settings.outlineEnabled && (
          <>
            <ColorProperty
              label="Outline color"
              value={settings.outlineColor}
              onChange={(outlineColor) => updateSettings({ outlineColor })}
            />
            <PropertySlider
              label="Outline width"
              value={settings.outlineWidth}
              minimum={1}
              maximum={8}
              step={1}
              display={`${settings.outlineWidth}px`}
              onChange={(outlineWidth) => updateSettings({ outlineWidth })}
            />
          </>
        )}
      </section>
    </div>
  )
}

function ImageResult({
  image,
  onUse,
}: {
  image: ImageSearchResult
  onUse: (image: ImageSearchResult) => void
}) {
  return (
    <button
      onClick={() => onUse(image)}
      className="relative group w-full text-left rounded-lg overflow-hidden border border-white/8 hover:border-violet-500/50 bg-black/20"
    >
      <img
        src={image.thumbnailUrl}
        alt={image.title}
        className="w-full h-36 object-cover"
        loading="lazy"
      />
      <div className="p-2">
        <div className="text-[10px] text-slate-300 truncate">{image.title}</div>
        <div className="text-[9px] text-slate-600 capitalize mt-0.5">{image.source}</div>
      </div>
      <span className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-violet-600 rounded px-2 py-1 text-[9px]">
        Use image
      </span>
    </button>
  )
}

function EmptyInspector({ text }: { text: string }) {
  return (
    <div className="flex-1 flex items-center justify-center text-slate-500 p-8 text-center text-sm">
      {text}
    </div>
  )
}

function tabLabel(tab: SearchTab) {
  if (tab === 'duckduckgo') return 'DuckDuckGo Images'
  if (tab === 'pexels-image') return 'Pexels Images'
  if (tab === 'pexels-video') return 'Pexels Video'
  return 'YouTube'
}

function NumberProperty({
  label,
  value,
  minimum,
  maximum,
  onChange,
}: {
  label: string
  value: number
  minimum: number
  maximum?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="text-[9px] text-slate-500">
      {label}
      <input
        type="number"
        min={minimum}
        max={maximum}
        step="0.01"
        value={Number(value.toFixed(3))}
        onChange={(event) =>
          onChange(
            Math.min(
              maximum ?? Number.POSITIVE_INFINITY,
              Math.max(minimum, Number(event.target.value))
            )
          )
        }
        className="mt-1 w-full bg-[#090b10] border border-white/10 rounded p-2 text-[10px] text-white"
      />
    </label>
  )
}

function ToggleRow({
  label,
  enabled,
  onChange,
}: {
  label: string
  enabled: boolean
  onChange: (enabled: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-slate-300">{label}</span>
      <button
        onClick={() => onChange(!enabled)}
        className={`h-5 w-9 rounded-full p-0.5 transition-colors ${
          enabled ? 'bg-violet-600' : 'bg-slate-700'
        }`}
      >
        <span
          className={`block h-4 w-4 rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-4' : ''
          }`}
        />
      </button>
    </div>
  )
}

function ColorProperty({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="text-[9px] text-slate-500">
      {label}
      <div className="mt-1 h-8 flex items-center gap-2 rounded border border-white/10 bg-[#090b10] px-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-5 w-6 bg-transparent border-0"
        />
        <span className="text-[9px] text-slate-400 uppercase">{value}</span>
      </div>
    </label>
  )
}

function PropertySlider({
  label,
  value,
  minimum,
  maximum,
  step,
  display,
  onChange,
}: {
  label: string
  value: number
  minimum: number
  maximum: number
  step: number
  display: string
  onChange: (value: number) => void
}) {
  return (
    <label className="block text-[9px] text-slate-500">
      <span className="flex justify-between mb-1">
        <span>{label}</span>
        <span className="text-slate-400">{display}</span>
      </span>
      <input
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-violet-500"
      />
    </label>
  )
}
