import {describe, expect, test} from 'bun:test'

import {containSize, coverRect, rectIntersection, rectUnion, sizeFromArea} from '#src/lib/geometry.ts'
import {findSnapOffset, moveRectWithSnapping, resizeFrameFromEdge, resizeRectFromCorner} from '#src/lib/interaction.ts'
import {getLayerBounds, layerToWorld, worldToLayer} from '#src/lib/layerGeometry.ts'
import {closestRatio, isRatioString, parseRatio} from '#src/lib/ratio.ts'

import {createLayer, createRect} from './lib/fixtures.ts'

describe('rects', () => {
  test('coverRect covers the target with the requested aspect', () => {
    expect(coverRect(createRect(200, 100), 1)).toEqual(createRect(200, 200, 0, -50))
  })
  test('containSize fits inside bounds', () => {
    const bounds = {
      width: 100,
      height: 100,
    }
    expect(containSize(bounds, 2)).toEqual({
      width: 100,
      height: 50,
    })
    expect(containSize(bounds, 0.5)).toEqual({
      width: 50,
      height: 100,
    })
  })
  test('sizeFromArea keeps area and aspect', () => {
    const size = sizeFromArea(1024 * 1024, 16 / 9)
    expect(size.width / size.height).toBeCloseTo(16 / 9)
    expect(size.width * size.height).toBeCloseTo(1024 * 1024)
  })
  test('intersection and union', () => {
    const a = createRect(10, 10)
    const b = createRect(10, 10, 5, 5)
    expect(rectIntersection(a, b)).toEqual(createRect(5, 5, 5, 5))
    expect(rectIntersection(a, createRect(1, 1, 20, 20))).toBeNull()
    expect(rectUnion([a, b])).toEqual(createRect(15, 15))
    expect(rectUnion([])).toBeNull()
  })
})
describe('ratios', () => {
  test('are parsed including fractional parts', () => {
    expect(parseRatio('16:9')).toBeCloseTo(16 / 9)
    expect(parseRatio('19.5:9')).toBeCloseTo(19.5 / 9)
    expect(() => parseRatio('abc')).toThrow()
    expect(isRatioString('4:3')).toBe(true)
    expect(isRatioString('4x3')).toBe(false)
  })
  test('are compared logarithmically', () => {
    expect(closestRatio(1.7, ['1:1', '16:9', '4:3'])).toBe('16:9')
    expect(closestRatio(0.5, ['1:1', '2:1', '1:2'])).toBe('1:2')
  })
})
describe('interaction', () => {
  test('the snap offset picks the closest target', () => {
    expect(findSnapOffset([10, 50], [12, 49], 5)).toBe(-1)
    expect(findSnapOffset([10], [100], 5)).toBeUndefined()
  })
  test('moving snaps edges', () => {
    const {rect, guides} = moveRectWithSnapping(createRect(10, 10), {
      x: 97,
      y: 0,
    }, {
      x: [100],
      y: [],
    }, 4)
    // The center (102) is closest to the target, so the rect centers on it.
    expect(rect.x).toBe(95)
    expect(guides.x).toBe(100)
  })
  test('corner resizing keeps the aspect ratio and the opposite corner', () => {
    const start = createRect(100, 50)
    const {rect} = resizeRectFromCorner({
      aspect: 2,
      corner: 'se',
      minWidth: 10,
      pointer: {
        x: 300,
        y: 60,
      },
      start,
    })
    expect(rect).toEqual(createRect(300, 150))
    const fromNw = resizeRectFromCorner({
      aspect: 2,
      corner: 'nw',
      minWidth: 10,
      pointer: {
        x: 50,
        y: 0,
      },
      start,
    }).rect
    expect(fromNw.x + fromNw.width).toBe(100)
    expect(fromNw.y + fromNw.height).toBe(50)
  })
  test('resizing respects the minimum width', () => {
    const {rect} = resizeRectFromCorner({
      aspect: 1,
      corner: 'se',
      minWidth: 40,
      pointer: {
        x: -100,
        y: -100,
      },
      start: createRect(),
    })
    expect(rect.width).toBe(40)
  })
  test('edge resizing of the frame snaps ratios and anchors the opposite side', () => {
    const result = resizeFrameFromEdge(createRect(100, 100, 10, 20), 'w', {
      x: -90,
      y: 60,
    }, ['1:1', '2:1', '1:2'])
    expect(result.ratio).toBe('2:1')
    expect(result.rect).toEqual(createRect(200, 100, -90, 20))
  })
})
describe('layer geometry', () => {
  const layer = createLayer('layer', {rect: createRect(100, 50)})
  test('rotated world and local coordinates round trip', () => {
    const rotated = {
      ...layer,
      rotation: 37,
    }
    const point = {
      x: 20,
      y: 35,
    }
    const result = worldToLayer(rotated, layerToWorld(rotated, point))
    expect(result.x).toBeCloseTo(point.x, 8)
    expect(result.y).toBeCloseTo(point.y, 8)
  })
  test('a 90° rotation swaps the bounds', () => {
    const result = getLayerBounds({
      ...layer,
      rotation: 90,
    })
    expect(result.width).toBeCloseTo(50)
    expect(result.height).toBeCloseTo(100)
  })
})
