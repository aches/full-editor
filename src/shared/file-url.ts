/** Encode filesystem segments so literal %, # and ? never become URL syntax. */
export function localFileUrl(path: string): string {
  return `editor-file://local${path.split('/').map(encodeURIComponent).join('/')}`
}
