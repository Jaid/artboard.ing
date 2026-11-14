import queryParameters from '#src/queryParameters.ts'

import {openRouterOrigin} from './openRouterAccess.ts'
import {Store} from './store/index.ts'

/** `?openrouter_key=false`: every request goes out without a key, for a host that adds its own, like an OpenRouter proxy */
export const keyless = queryParameters.openrouter_key === false
/** Browser-entered keys remain in memory only. The server key is never returned by /api/status. */
export const apiKeyStore = new Store({
  key: typeof queryParameters.openrouter_key === 'string' ? queryParameters.openrouter_key : '',
  requested: false,
  serverConfigured: false,
  csrfToken: '',
  checked: false,
})
export const getApiKey = () => (keyless ? '' : apiKeyStore.state.key.trim())
/** whether the local gateway can send requests with its protected key; it only talks to OpenRouter itself, never to another `?openrouter_host` */
export const canUseGateway = () => apiKeyStore.state.serverConfigured && queryParameters.openrouter_host === openRouterOrigin
export const hasApiKey = () => keyless || Boolean(getApiKey()) || canUseGateway()
export const setApiKey = (key: string) => {
  if (!keyless) {
    apiKeyStore.set({key: key.trim()})
  }
}
export const requestApiKey = () => apiKeyStore.set({requested: true})
export async function refreshApiStatus() {
  try {
    const response = await fetch('/api/status', {signal: AbortSignal.timeout(5000)})
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('Static deployment')
    }
    const value: unknown = await response.json()
    if (!value || typeof value !== 'object' || !('configured' in value) || typeof value.configured !== 'boolean' || !('csrfToken' in value) || typeof value.csrfToken !== 'string') {
      throw new Error('Invalid status response')
    }
    apiKeyStore.set({
      serverConfigured: value.configured,
      csrfToken: value.csrfToken,
      checked: true,
    })
  } catch {
    apiKeyStore.set({
      serverConfigured: false,
      csrfToken: '',
      checked: true,
    })
  }
}
