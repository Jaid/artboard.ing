import {useSyncExternalStore} from 'react'

import {assets} from './assets.ts'

const subscribeAssets = (listener: () => void) => {
  const unsubscribeAdded = assets.subscribe(listener)
  const unsubscribeReleased = assets.subscribeRelease(() => listener())
  return () => {
    unsubscribeAdded()
    unsubscribeReleased()
  }
}

/** a loaded image, kept up to date while it is added or released */
export const useAsset = (id: string | undefined) => useSyncExternalStore(subscribeAssets, () => (id ? assets.get(id) : undefined))
