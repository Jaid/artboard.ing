import {projectStore} from './state.ts'
import {Store} from './store/index.ts'

export type CollectionStep = 'first' | 'last' | 'next' | 'previous'

export const collectionDialogStore = new Store<{
  /** collection number of the tile whose details are shown; 0 is the live frame view, null means closed */
  index: number | null
}>({index: null})
/** opens the details of a collection tile, where 0 is the live frame view */
export const openCollectionDialog = (index: number) => collectionDialogStore.set({index})
export const closeCollectionDialog = () => {
  if (collectionDialogStore.state.index !== null) {
    collectionDialogStore.set({index: null})
  }
}
/** Finds the collection number a step leads to, in the order of the tiles. Next and previous wrap around. */
export const stepCollectionIndex = (order: ReadonlyArray<number>, current: number, step: CollectionStep) => {
  if (step === 'first') {
    return order[0]
  }
  if (step === 'last') {
    return order.at(-1)
  }
  const position = order.indexOf(current)
  if (position === -1) {
    return order[0]
  }
  return order[(position + (step === 'next' ? 1 : -1) + order.length) % order.length]
}
/** shows the details of another tile: the frame view first, then the collection items as the collection lists them */
export const stepCollectionDialog = (step: CollectionStep) => {
  const current = collectionDialogStore.state.index
  if (current === null) {
    return
  }
  const order = [0, ...projectStore.state.ingredients.map(item => item.index)]
  const index = stepCollectionIndex(order, current, step)
  if (index !== undefined && index !== current) {
    collectionDialogStore.set({index})
  }
}
