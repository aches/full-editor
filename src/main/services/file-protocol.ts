import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { isPathAllowed } from './fs-service'

export const FILE_SCHEME = 'editor-file'

/** Must run before `app.whenReady()`. */
export function registerFileSchemeAsPrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: FILE_SCHEME, privileges: { secure: true, supportFetchAPI: true, stream: true } }
  ])
}

/** Must run after `app.whenReady()`. Serves project-root-scoped local files (images). */
export function registerFileProtocolHandler(): void {
  protocol.handle(FILE_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const filePath = decodeURIComponent(url.pathname)
      if (!(await isPathAllowed(filePath))) {
        return new Response('forbidden', { status: 403 })
      }
      return net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response('bad request', { status: 400 })
    }
  })
}
