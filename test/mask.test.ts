import {describe, expect, test} from 'bun:test'

import {getMaskAlpha, getMaskMetrics, isMaskActive} from '#src/lib/mask.ts'

const size = {
  width: 200,
  height: 100,
}
const square = {
  width: 100,
  height: 100,
}
describe('mask shape', () => {
  test('a full area without feather is inactive', () => {
    const settings = {
      area: 1,
      feather: 0,
    }
    expect(isMaskActive(settings)).toBe(false)
    expect(isMaskActive({
      ...settings,
      roundness: 0.1,
    })).toBe(true)
  })
  test('25% area means half the width and height, not a quarter', () => {
    const mask = getMaskMetrics({
      area: 0.25,
      feather: 0,
    }, size)
    expect(mask).toMatchObject({
      x: 50,
      y: 25,
      width: 100,
      height: 50,
    })
  })
  test('the area contracts the visible region', () => {
    const settings = {
      area: 0.5,
      feather: 0,
    }
    expect(getMaskAlpha(settings, size, 100, 50)).toBe(1)
    expect(getMaskAlpha(settings, size, 10, 50)).toBe(0)
    expect(getMaskAlpha(settings, size, 100, 10)).toBe(0)
  })
  test('area zero stays empty', () => {
    expect(getMaskAlpha({
      area: 0,
      feather: 0,
    }, square, 50, 50)).toBe(0)
  })
  test('roundness changes the corners without moving the center', () => {
    const settings = {
      area: 1,
      feather: 0,
      roundness: 1,
    }
    expect(getMaskAlpha(settings, square, 1, 1)).toBe(0)
    expect(getMaskAlpha(settings, square, 50, 50)).toBe(1)
  })
  test('mask translation is independent of image placement', () => {
    expect(getMaskMetrics({
      area: 0.25,
      feather: 0,
      offsetX: 0.1,
    }, square)).toMatchObject({
      x: 35,
      width: 50,
    })
  })
})
describe('feather', () => {
  test('produces a smooth falloff', () => {
    const settings = {
      area: 1,
      feather: 0.5,
    }
    expect(getMaskAlpha(settings, size, 0, 50)).toBe(0)
    const inner = getMaskAlpha(settings, size, 20, 50)
    expect(inner).toBeGreaterThan(0)
    expect(inner).toBeLessThan(1)
    expect(getMaskAlpha(settings, size, 100, 50)).toBe(1)
  })
})
