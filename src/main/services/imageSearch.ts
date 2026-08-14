import axios from 'axios'
import { ImageSearchResult } from '../../types/editor'

export async function searchPexelsImages(
  query: string,
  apiKey: string
): Promise<ImageSearchResult[]> {
  if (!apiKey.trim()) {
    throw new Error('Add a Pexels API key in Settings before searching Pexels Images.')
  }

  const response = await axios.get('https://api.pexels.com/v1/search', {
    headers: { Authorization: apiKey.trim() },
    params: { query, per_page: 18, orientation: 'landscape' },
    timeout: 15000,
  })

  return (response.data.photos || []).map((photo: any) => ({
    id: `pexels_image_${photo.id}`,
    sourceUrl: photo.src?.large2x || photo.src?.original,
    thumbnailUrl: photo.src?.medium || photo.src?.small,
    title: photo.alt || `Photo by ${photo.photographer}`,
    source: 'pexels' as const,
  }))
}

export async function searchDuckDuckGoImages(
  query: string
): Promise<ImageSearchResult[]> {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return []
  try {
    const landing = await axios.get('https://duckduckgo.com/', {
      params: { q: trimmedQuery, iax: 'images', ia: 'images' },
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      },
      timeout: 15000,
    })
    const html = String(landing.data || '')
    const vqd =
      html.match(/vqd=["']([\d-]+)["']/)?.[1] ||
      html.match(/vqd=([\d-]+)&/)?.[1] ||
      html.match(/"vqd":"([\d-]+)"/)?.[1]
    if (!vqd) {
      throw new Error('DuckDuckGo did not return an image-search token.')
    }

    const cookie = (landing.headers['set-cookie'] || [])
      .map((value: string) => value.split(';')[0])
      .join('; ')
    const response = await axios.get('https://duckduckgo.com/i.js', {
      params: {
        l: 'us-en',
        o: 'json',
        q: trimmedQuery,
        vqd,
        f: ',,,',
        p: '1',
      },
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        Referer: `https://duckduckgo.com/?q=${encodeURIComponent(trimmedQuery)}&iax=images&ia=images`,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      timeout: 15000,
    })

    return (response.data.results || []).slice(0, 24).map((item: any, index: number) => ({
      id: `duckduckgo_image_${index}_${encodeURIComponent(item.image || item.url || '')}`,
      sourceUrl: item.image || item.url,
      thumbnailUrl: item.thumbnail || item.image || item.url,
      title: item.title || item.source || 'DuckDuckGo image',
      source: 'duckduckgo' as const,
    }))
  } catch (error: any) {
    const apiMessage =
      error?.response?.data?.error?.message ||
      (typeof error?.response?.data === 'string' &&
      error.response.data.length < 300
        ? error.response.data
        : null)
    throw new Error(
      apiMessage ||
        error?.message ||
        'DuckDuckGo image search was blocked. Its unofficial image endpoint may have changed.'
    )
  }
}

export async function searchImages(query: string, pexelsKey?: string): Promise<ImageSearchResult[]> {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return []

  try {
    return await searchPexelsImages(trimmedQuery, pexelsKey || '')
  } catch (error: any) {
    const apiMessage = error?.response?.data?.error?.message
    throw new Error(apiMessage || error?.message || 'Pexels image search failed.')
  }
}

export async function searchWikimediaImages(query: string): Promise<ImageSearchResult[]> {
  const response = await axios.get('https://commons.wikimedia.org/w/api.php', {
    params: {
      action: 'query',
      format: 'json',
      origin: '*',
      generator: 'search',
      gsrsearch: query,
      gsrnamespace: 6,
      gsrlimit: 20,
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: 640,
    },
    timeout: 15000,
  })

  const pages = Object.values(response.data.query?.pages || {}) as any[]
  return pages
    .map((page) => {
      const image = page.imageinfo?.[0]
      if (!image?.url) return null
      return {
        id: `commons_${page.pageid}`,
        sourceUrl: image.url,
        thumbnailUrl: image.thumburl || image.url,
        title: String(page.title || '').replace(/^File:/, ''),
        source: 'wikimedia' as const,
      }
    })
    .filter((result): result is NonNullable<typeof result> => Boolean(result))
}
