export function localMediaUrl(source: string) {
  if (!source || /^(https?:|data:|blob:|rhymx-media:)/i.test(source)) return source
  let filePath = source
  if (source.startsWith('file:')) {
    const parsed = new URL(source)
    filePath = decodeURIComponent(parsed.pathname)
    if (/^\/[a-zA-Z]:\//.test(filePath)) filePath = filePath.slice(1)
  }
  return `rhymx-media://local/${encodeURIComponent(filePath)}`
}
