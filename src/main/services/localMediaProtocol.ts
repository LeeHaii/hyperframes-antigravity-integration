import { net, protocol } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export function registerLocalMediaScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'rhymx-media',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: true,
      },
    },
  ])
}

export async function registerLocalMediaProtocol() {
  await protocol.handle('rhymx-media', (request) => {
    const requestUrl = new URL(request.url)
    if (requestUrl.hostname !== 'local') {
      return new Response('Invalid local media request.', { status: 400 })
    }
    const filePath = decodeURIComponent(requestUrl.pathname.replace(/^\/+/, ''))
    if (!path.isAbsolute(filePath)) {
      return new Response('Invalid local media path.', { status: 400 })
    }
    return net.fetch(pathToFileURL(filePath).toString(), {
      headers: request.headers,
    })
  })
}
