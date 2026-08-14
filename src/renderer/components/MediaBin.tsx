import React, { DragEvent, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  AlertTriangle,
  FileAudio,
  Film,
  Music2,
  Plus,
  Trash2,
  Upload,
  Youtube,
} from 'lucide-react'
import { ImportedFile, LibraryAsset, MediaKind } from '../../types/editor'
import { useEditorStore } from '../../store/useEditorStore'
import { localMediaUrl } from '../services/localMedia'

type FileWithPath = File & { path?: string }
type MediaFilter = 'all' | 'video' | 'image' | 'audio' | 'youtube'

const videoExtensions = new Set(['mp4', 'mov', 'mkv', 'webm', 'avi'])
const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])

function classify(name: string): MediaKind {
  const extension = name.split('.').pop()?.toLowerCase() || ''
  if (videoExtensions.has(extension)) return 'video'
  if (imageExtensions.has(extension)) return 'image'
  return 'music'
}

export default function MediaBin({ width = 256 }: { width?: number }) {
  const {
    mediaLibrary,
    activeSceneId,
    addMediaAssets,
    removeMediaAsset,
    assignMediaToScene,
    addAudioClip,
  } = useEditorStore(
    useShallow((state) => ({
      mediaLibrary: state.mediaLibrary,
      activeSceneId: state.activeSceneId,
      addMediaAssets: state.addMediaAssets,
      removeMediaAsset: state.removeMediaAsset,
      assignMediaToScene: state.assignMediaToScene,
      addAudioClip: state.addAudioClip,
    }))
  )
  const [filter, setFilter] = useState<MediaFilter>('all')
  const [isDragging, setIsDragging] = useState(false)

  const addFiles = async (files: ImportedFile[]) => {
    const filesWithDuration = await Promise.all(
      files.map(async (file) => ({
        ...file,
        durationSec:
          file.durationSec ??
          (file.kind === 'image'
            ? undefined
            : (await window.electronAPI.getMediaDuration(file.path)) || undefined),
      }))
    )
    addMediaAssets(
      filesWithDuration.map((file) => ({
        ...file,
        id: crypto.randomUUID(),
      }))
    )
  }

  const importFiles = async () => addFiles(await window.electronAPI.openMediaFiles())

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const files = Array.from(event.dataTransfer.files)
      .map((file) => {
        const fileWithPath = file as FileWithPath
        return fileWithPath.path
          ? { path: fileWithPath.path, name: file.name, kind: classify(file.name) }
          : null
      })
      .filter((file): file is NonNullable<typeof file> => Boolean(file))
    await addFiles(files)
  }

  const visibleAssets = mediaLibrary.filter((asset) => {
    if (filter === 'all') return true
    if (filter === 'youtube') return asset.origin === 'youtube'
    if (filter === 'audio') return asset.kind === 'music' || asset.kind === 'sfx'
    if (filter === 'video') {
      return asset.kind === 'video' && asset.origin !== 'youtube'
    }
    return asset.kind === filter
  })

  const placeVisual = (asset: LibraryAsset) => {
    if (asset.missing) {
      alert(
        asset.missingReason ||
          'This YouTube clip file is missing. Download the clip again.'
      )
      return
    }
    if (!activeSceneId) {
      alert('Select a scene on the timeline first.')
      return
    }
    if (asset.kind !== 'image' && asset.kind !== 'video') return
    assignMediaToScene(activeSceneId, {
      id: asset.id,
      type:
        asset.origin === 'youtube'
          ? 'youtube_clip'
          : asset.kind === 'video'
            ? 'local_video'
            : 'local_image',
      kind: asset.kind,
      sourceUrl: asset.path,
      thumbnailUrl: asset.thumbnailUrl || asset.path,
      title: asset.name,
      sourceStartSec: 0,
      sourceDurationSec: asset.durationSec,
      providerUrl: asset.providerUrl,
      providerStartSec: asset.providerStartSec,
      imageFit: 'cover',
      enableKenBurnsEffect: asset.kind === 'image',
      missing: false,
    })
  }

  return (
    <aside
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      style={{ width }}
      className={`shrink-0 bg-[#111319] flex flex-col min-w-0 ${
        isDragging ? 'ring-2 ring-inset ring-violet-500' : ''
      }`}
    >
      <div className="p-4 border-b border-white/5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold">Media</h2>
            <p className="text-[10px] text-slate-600 mt-0.5">{mediaLibrary.length} imported files</p>
          </div>
          <button
            onClick={importFiles}
            title="Import media"
            className="h-8 w-8 rounded-lg bg-violet-600 hover:bg-violet-500 flex items-center justify-center transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-1 rounded-lg bg-black/20 p-1 overflow-x-auto custom-scrollbar">
          {(['all', 'video', 'image', 'audio'] as MediaFilter[]).map((item) => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              className={`shrink-0 rounded-md px-2 py-1.5 text-[10px] capitalize transition-colors ${
                filter === item ? 'bg-white/10 text-white' : 'text-slate-600 hover:text-slate-300'
              }`}
            >
              {item}
            </button>
          ))}
          <button
            onClick={() => setFilter('youtube')}
            className={`shrink-0 rounded-md px-2 py-1.5 text-[10px] transition-colors ${
              filter === 'youtube'
                ? 'bg-red-500/15 text-red-300'
                : 'text-slate-600 hover:text-slate-300'
            }`}
          >
            YouTube clips
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        {visibleAssets.length === 0 && filter === 'youtube' ? (
          <div className="w-full h-32 rounded-xl border border-dashed border-white/10 flex flex-col items-center justify-center px-4 text-center text-slate-600">
            <Youtube className="h-6 w-6 mb-2" />
            <span className="text-[11px]">No downloaded YouTube clips yet</span>
            <span className="mt-1 text-[9px]">
              Clips downloaded in the Inspector will stay with this project.
            </span>
          </div>
        ) : visibleAssets.length === 0 ? (
          <button
            onClick={importFiles}
            className="w-full h-32 rounded-xl border border-dashed border-white/10 hover:border-violet-500/30 flex flex-col items-center justify-center text-slate-600 hover:text-slate-400 transition-colors"
          >
            <Upload className="h-6 w-6 mb-2" />
            <span className="text-[11px]">Import or drop media</span>
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {visibleAssets.map((asset) => (
              <div
                key={asset.id}
                draggable={!asset.missing}
                onDragStart={(event) => {
                  if (asset.missing) {
                    event.preventDefault()
                    return
                  }
                  event.dataTransfer.effectAllowed = 'copy'
                  event.dataTransfer.setData(
                    'application/x-rhymx-media',
                    JSON.stringify(asset)
                  )
                }}
                className={`group rounded-lg border bg-black/20 overflow-hidden ${
                  asset.missing
                    ? 'border-red-500/20 cursor-not-allowed'
                    : 'border-white/5 cursor-grab active:cursor-grabbing'
                }`}
                title={
                  asset.missing
                    ? asset.missingReason
                    : 'Drag this media onto a timeline track'
                }
              >
                <button
                  onClick={() => {
                    if (asset.kind === 'video' || asset.kind === 'image') placeVisual(asset)
                  }}
                  className="relative w-full aspect-video bg-black/40 flex items-center justify-center overflow-hidden"
                  title={
                    asset.kind === 'video' || asset.kind === 'image'
                      ? 'Add to selected scene'
                      : 'Audio asset'
                  }
                >
                  {asset.origin === 'youtube' && asset.thumbnailUrl ? (
                    <img
                      src={asset.thumbnailUrl}
                      className="w-full h-full object-cover"
                      alt=""
                    />
                  ) : asset.kind === 'image' ? (
                    <img
                      src={localMediaUrl(asset.path)}
                      className="w-full h-full object-cover"
                      alt=""
                    />
                  ) : asset.kind === 'video' ? (
                    <video
                      src={localMediaUrl(asset.path)}
                      className="w-full h-full object-cover"
                      muted
                    />
                  ) : asset.kind === 'sfx' ? (
                    <FileAudio className="h-6 w-6 text-amber-400" />
                  ) : (
                    <Music2 className="h-6 w-6 text-emerald-400" />
                  )}
                  {asset.missing && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-red-300">
                      <AlertTriangle className="h-5 w-5" />
                      <span className="mt-1 text-[8px] uppercase">File missing</span>
                    </div>
                  )}
                </button>
                <div className="p-2">
                  <div className="text-[10px] truncate text-slate-300">{asset.name}</div>
                  {(asset.kind === 'music' || asset.kind === 'sfx') && (
                    <div className="flex gap-1 mt-1.5">
                      <button
                        onClick={() => addAudioClip({ ...asset, kind: 'music' })}
                        className="flex-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 py-1 text-[8px] text-emerald-300"
                      >
                        + Music
                      </button>
                      <button
                        onClick={() => addAudioClip({ ...asset, kind: 'sfx' })}
                        className="flex-1 rounded bg-amber-500/10 hover:bg-amber-500/20 py-1 text-[8px] text-amber-300"
                      >
                        + SFX
                      </button>
                    </div>
                  )}
                  <div className="mt-1 flex items-center justify-between">
                    <span
                      className={`text-[9px] uppercase ${
                        asset.origin === 'youtube' ? 'text-red-400/80' : 'text-slate-600'
                      }`}
                    >
                      {asset.origin === 'youtube' ? 'YouTube' : asset.kind}
                    </span>
                    <button
                      onClick={() => removeMediaAsset(asset.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-white/5 p-3 text-[10px] text-slate-600 flex items-center gap-2">
        <Film className="h-3 w-3" />
        Drag media to a track, or click to replace selected media
      </div>
    </aside>
  )
}
