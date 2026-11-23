import type {DecodedImage} from './image.ts'

import {createId} from '#src/lib/createId.ts'

import {decodeImage} from './image.ts'

/** an immutable decoded image shared by layers, ingredients and undo history */
export type Asset = {
  addedAt: number
  bitmap: ImageBitmap
  blob: Blob
  height: number
  id: string
  /** object URL for display */
  url: string
  width: number
}

type AssetListener = () => void
type ReleaseListener = (id: string) => void
type AssetEntry = {
  blob: Blob
  decoded?: DecodedImage
  id?: string
}

export class AssetRegistry {
  readonly #assets = new Map<string, Asset>
  readonly #listeners = new Set<AssetListener>
  readonly #pins = new Map<string, number>
  readonly #releaseListeners = new Set<ReleaseListener>
  async add(blob: Blob, decoded?: DecodedImage, id?: string) {
    const [asset] = await this.addAll([{
      blob,
      decoded,
      id,
    }])
    return asset
  }

  /**
   * Adds several images at once and notifies listeners a single time, so restoring a project with many images re-renders once instead of once per image.
   * Nothing is added if any image fails to decode.
   */
  async addAll(entries: ReadonlyArray<AssetEntry>) {
    /** the blob each ID stands for, including IDs repeated within this call */
    const blobs = new Map<string, Blob>
    const prepared = entries.map(entry => {
      const id = entry.id ?? createId()
      const blob = this.#assets.get(id)?.blob ?? blobs.get(id)
      if (blob && blob !== entry.blob) {
        throw new Error('Asset identifiers are immutable; import must allocate a fresh ID.')
      }
      const fresh = !blob
      blobs.set(id, entry.blob)
      return {
        ...entry,
        id,
        fresh,
      }
    })
    const settled = await Promise.allSettled(prepared.map(entry => (entry.fresh ? entry.decoded ?? decodeImage(entry.blob) : undefined)))
    const failure = settled.find(outcome => outcome.status === 'rejected')
    if (failure) {
      for (const [index, outcome] of settled.entries()) {
        // Bitmaps handed in by the caller stay the caller’s to close.
        if (outcome.status === 'fulfilled' && outcome.value && !prepared[index].decoded) {
          outcome.value.bitmap.close()
        }
      }
      throw failure.reason
    }
    for (const [index, entry] of prepared.entries()) {
      const image = (settled[index] as PromiseFulfilledResult<DecodedImage | undefined>).value
      if (!image) {
        continue
      }
      this.#assets.set(entry.id, {
        id: entry.id,
        addedAt: performance.now(),
        blob: entry.blob,
        bitmap: image.bitmap,
        width: image.width,
        height: image.height,
        url: URL.createObjectURL(entry.blob),
      })
    }
    if (prepared.some(entry => entry.fresh)) {
      for (const listener of this.#listeners) {
        listener()
      }
    }
    return prepared.map(entry => this.#assets.get(entry.id)!)
  }

  get(id: string) {
    return this.#assets.get(id)
  }

  has(id: string) {
    return this.#assets.has(id)
  }

  pin(ids: Iterable<string>) {
    const values = [...new Set(ids)]
    for (const id of values) {
      this.#pins.set(id, (this.#pins.get(id) ?? 0) + 1)
    }
    let released = false
    return () => {
      if (released) {
        return
      }
      released = true
      for (const id of values) {
        const next = (this.#pins.get(id) ?? 1) - 1
        if (next) {
          this.#pins.set(id, next)
        } else {
          this.#pins.delete(id)
        }
      }
    }
  }

  require(id: string) {
    const asset = this.#assets.get(id)
    if (!asset) {
      throw new Error(`Image ${id} is missing`)
    }
    return asset
  }

  /**
   * Frees every asset that is not in the keep set.
   * Assets younger than the grace period are kept because they may be awaiting their commit into the document.
   */
  retain(keep: ReadonlySet<string>, gracePeriod = 60_000) {
    const now = performance.now()
    for (const [id, asset] of this.#assets) {
      if (keep.has(id) || this.#pins.has(id) || now - asset.addedAt < gracePeriod) {
        continue
      }
      URL.revokeObjectURL(asset.url)
      asset.bitmap.close()
      this.#assets.delete(id)
      for (const listener of this.#releaseListeners) {
        listener(id)
      }
    }
  }

  subscribe(listener: AssetListener) {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /** notifies derived caches that an asset was freed */
  subscribeRelease(listener: ReleaseListener) {
    this.#releaseListeners.add(listener)
    return () => {
      this.#releaseListeners.delete(listener)
    }
  }
}

export const assets = new AssetRegistry
