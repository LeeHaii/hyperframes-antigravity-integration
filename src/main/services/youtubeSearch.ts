import axios from 'axios'
import { YouTubeSearchResult } from '../../types/editor'

export async function searchYouTube(
  query: string,
  apiKey: string
): Promise<YouTubeSearchResult[]> {
  if (!apiKey.trim()) {
    throw new Error('Add a YouTube Data API key in Settings before searching YouTube.')
  }

  try {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet',
        q: query.trim(),
        type: 'video',
        videoDuration: 'long',
        maxResults: 12,
        safeSearch: 'moderate',
        videoEmbeddable: true,
        videoSyndicated: true,
        key: apiKey.trim(),
      },
      timeout: 15000,
    })

    return (response.data.items || []).map((item: any) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnailUrl:
        item.snippet.thumbnails?.high?.url ||
        item.snippet.thumbnails?.medium?.url ||
        `https://i.ytimg.com/vi/${item.id.videoId}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    }))
  } catch (error: any) {
    const apiMessage = error?.response?.data?.error?.message
    throw new Error(apiMessage || 'YouTube search failed. Check the API key and your connection.')
  }
}
