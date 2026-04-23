/**
 * Thin wrapper around Tauri 2 IPC.
 *
 * Uses window.__TAURI_INTERNALS__ (injected by Tauri's WebView) so we don't
 * need to bundle @tauri-apps/api. Safe to call from a browser — returns null
 * when not running inside a Tauri WebView.
 */

type TauriInternals = {
  invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>
}

function getTauri(): TauriInternals | null {
  if (typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = (window as any).__TAURI_INTERNALS__ as TauriInternals | undefined
  return t?.invoke ? t : null
}

export const isTauri = (): boolean => getTauri() !== null

/**
 * Invoke a Tauri command. Silently returns null if not in Tauri or on error.
 */
export async function tauriInvoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T | null> {
  const tauri = getTauri()
  if (!tauri) return null
  try {
    return await tauri.invoke<T>(cmd, args)
  } catch {
    return null
  }
}

/**
 * Save the JWT token so the queue worker sidecar can authenticate.
 * Called immediately after a successful login.
 */
export async function saveTauriToken(token: string): Promise<void> {
  await tauriInvoke('save_auth_token', { token })
}

/**
 * Save a custom API URL so the worker uses it on next app launch.
 * Called when the user configures a non-default server URL.
 */
export async function saveTauriApiUrl(url: string): Promise<void> {
  await tauriInvoke('save_api_url', { url })
}
