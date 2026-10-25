import {describe, expect, test} from 'bun:test'

import {HistoryStore} from '#src/lib/store/index.ts'

describe('history', () => {
  test('undo, redo and coalescing', () => {
    const store = new HistoryStore({value: 0})
    store.commit({value: 1})
    store.commit({value: 2}, {coalesceKey: 'drag'})
    store.commit({value: 3}, {coalesceKey: 'drag'})
    expect(store.meta.state.canUndo).toBe(true)
    store.undo()
    expect(store.state.value).toBe(1)
    store.undo()
    expect(store.state.value).toBe(0)
    expect(store.meta.state.canUndo).toBe(false)
    store.redo()
    store.redo()
    expect(store.state.value).toBe(3)
    store.undo()
    store.commit({value: 9})
    expect(store.meta.state.canRedo).toBe(false)
    expect(store.reachableStates.map(state => state.value)).toEqual([0, 1, 9])
  })
  test('set does not create history', () => {
    const store = new HistoryStore({value: 0})
    store.set({value: 5})
    expect(store.meta.state.canUndo).toBe(false)
  })
})
