import queryParameters from '#src/queryParameters.ts'

import {Store} from './store/index.ts'

/** `?openrouter_key=false`: every request goes out without a key, for a host that adds its own, like an OpenRouter proxy */
export const keyless = queryParameters.openrouter_key === false
/** Browser-entered keys remain in memory only. */
export const apiKeyStore = new Store({
  key: typeof queryParameters.openrouter_key === 'string' ? queryParameters.openrouter_key : '',
  requested: false,
})
export const getApiKey = () => (keyless ? '' : apiKeyStore.state.key.trim())
export const hasApiKey = () => keyless || Boolean(getApiKey())
export const setApiKey = (key: string) => {
  if (!keyless) {
    apiKeyStore.set({key: key.trim()})
  }
}
export const requestApiKey = () => apiKeyStore.set({requested: true})
