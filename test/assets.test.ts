import type {DecodedImage} from '#src/lib/image.ts'

import {describe, expect, jest, test} from 'bun:test'

import {AssetRegistry} from '#src/lib/assets.ts'

const createDecoded = (): DecodedImage => ({
  bitmap: {close: jest.fn()} as unknown as ImageBitmap,
  width: 4,
  height: 3,
})
const createBlob = () => new Blob([new Uint8Array(8)], {type: 'image/png'})
describe('asset registry', () => {
  test('adding many images notifies listeners once', async () => {
    const registry = new AssetRegistry
    const listener = jest.fn()
    registry.subscribe(listener)
    const entries = Array.from({length: 64}, (_, index) => ({
      blob: createBlob(),
      decoded: createDecoded(),
      id: `asset-${index}`,
    }))
    const added = await registry.addAll(entries)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(added.map(asset => asset.id)).toEqual(entries.map(entry => entry.id))
    expect(registry.require('asset-63').width).toBe(4)
  })
  test('images that are already there are returned as they are, without another notification', async () => {
    const registry = new AssetRegistry
    const blob = createBlob()
    const [first] = await registry.addAll([{
      blob,
      decoded: createDecoded(),
      id: 'a',
    }])
    const listener = jest.fn()
    registry.subscribe(listener)
    const again = await registry.addAll([{
      blob,
      id: 'a',
    }, {
      blob,
      id: 'a',
    }])
    expect(again).toEqual([first, first])
    expect(listener).not.toHaveBeenCalled()
    expect(await registry.add(blob, undefined, 'a')).toBe(first)
  })
  test('an ID never changes its image, not even within one call', async () => {
    const registry = new AssetRegistry
    await registry.add(createBlob(), createDecoded(), 'a')
    await expect(registry.addAll([{
      blob: createBlob(),
      id: 'a',
    }])).rejects.toThrow('immutable')
    await expect(registry.addAll([{
      blob: createBlob(),
      decoded: createDecoded(),
      id: 'b',
    }, {
      blob: createBlob(),
      decoded: createDecoded(),
      id: 'b',
    }])).rejects.toThrow('immutable')
    expect(registry.has('b')).toBe(false)
  })
  test('nothing is added when one image cannot be decoded', async () => {
    const registry = new AssetRegistry
    const listener = jest.fn()
    registry.subscribe(listener)
    const decoded = createDecoded()
    const oversized = new Blob([new Uint8Array(40_000_001)], {type: 'image/png'})
    await expect(registry.addAll([{
      blob: createBlob(),
      decoded,
      id: 'fine',
    }, {
      blob: oversized,
      id: 'oversized',
    }])).rejects.toThrow('40 mb')
    expect(registry.has('fine')).toBe(false)
    expect(listener).not.toHaveBeenCalled()
    // A bitmap handed in stays the caller’s to close.
    expect(decoded.bitmap.close).not.toHaveBeenCalled()
  })
})
