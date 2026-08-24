import React, { DragEvent, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  FileAudio,
  Film,
  Music2,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'
import { ImportedFile, LibraryAsset, MediaKind } from '../../types/editor'
import { useEditorStore } from '../../store/useEditorStore'
import { localMediaUrl } from '../services/localMedia'

type FileWithPath = File & { path?: string }
type MediaFilter = 'all' | 'video' | 'image' | 'audio'

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
    if (filter === 'audio') return asset.kind === 'music' || asset.kind === 'sfx'
    if (filter === 'video') return asset.kind === 'video'
    return asset.kind === filter
  })

  const placeVisual = (asset: LibraryAsset) => {
    if (!activeSceneId) {
      alert('Select a scene on the timeline first.')
      return
    }
    if (asset.kind !== 'image' && asset.kind !== 'video') return
    assignMediaToScene(activeSceneId, {
      id: asset.id,
      type: asset.kind === 'video' ? 'local_video' : 'local_image',
      kind: asset.kind,
      sourceUrl: asset.path,
      thumbnailUrl: asset.path,
      title: asset.name,
      sourceStartSec: 0,
      sourceDurationSec: asset.durationSec,
      imageFit: 'cover',
      enableKenBurnsEffect: asset.kind === 'image',
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
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        {visibleAssets.length === 0 ? (
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
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'copy'
                  event.dataTransfer.setData(
                    'application/x-rhymx-media',
                    JSON.stringify(asset)
                  )
                }}
                className="group cursor-grab overflow-hidden rounded-lg border border-white/5 bg-black/20 active:cursor-grabbing"
                title="Drag this media onto a timeline track"
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
                  {asset.kind === 'image' ? (
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
                    <span className="text-[9px] uppercase text-slate-600">
                      {asset.kind}
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
