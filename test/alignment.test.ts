import type {Layer} from '#src/lib/state.ts'

import {describe, expect, test} from 'bun:test'

import {align, decideAlignment} from '#src/lib/alignment/align.ts'
import {getActiveAlignment, getContentRect} from '#src/lib/layerGeometry.ts'
import {parseProjectDocument} from '#src/lib/projectSchema.ts'

import {createLayer, createRect} from './lib/fixtures.ts'

describe('registration', () => {
  const size = 128
  /** smooth synthetic scene sampled at normalized coordinates */
  const scene = (u: number, v: number) => 128 + 60 * Math.sin(u * 9 + v * 3) + 40 * Math.cos(v * 11 - u * 2) + 30 * Math.exp(-((u - 0.62) ** 2 + (v - 0.4) ** 2) * 40)
  const render = (x: number, y: number, scale: number) => {
    const data = new Float32Array(size * size)
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        data[row * size + column] = scene(x + scale * (column + 0.5) / size, y + scale * (row + 0.5) / size)
      }
    }
    return {
      data,
      width: size,
      height: size,
    }
  }
  test('recovers a shifted and zoomed output', () => {
    const result = align(render(0, 0, 1), render(0.15, -0.05, 0.9))
    expect(result.placement.x).toBeCloseTo(0.15, 1)
    expect(result.placement.y).toBeCloseTo(-0.05, 1)
    expect(result.placement.scale).toBeCloseTo(0.9, 1)
    expect(decideAlignment(result).apply).toBe(true)
  })
  test('keeps an aligned output in place', () => {
    expect(decideAlignment(align(render(0, 0, 1), render(0, 0, 1))).apply).toBe(false)
  })
})
describe('content-aware layers', () => {
  const alignment = {
    x: 0.1,
    y: -0.05,
    scale: 0.9,
    applied: true,
  }
  const generated = (extra: Partial<Layer> = {}) => createLayer('generated', {
    kind: 'generated',
    rect: createRect(200, 100),
    ...extra,
  })
  test('the cached registration only moves content while the layer opts in', () => {
    expect(getContentRect(generated({alignment}))).toEqual(createRect(200, 100))
    expect(getContentRect(generated({
      alignment,
      contentAware: true,
    }))).toEqual(createRect(180, 90, 20, -5))
    expect(getActiveAlignment(generated({
      contentAware: true,
      alignment: {
        ...alignment,
        applied: false,
      },
    }))).toBeUndefined()
  })
  test('projects keep adjustments and cached registrations', () => {
    const document = parseProjectDocument({
      layers: [generated({
        contentAware: true,
        alignment,
        adjustments: {
          saturation: 0.25,
          gamma: 0,
        },
      })],
      ingredients: [],
    })
    expect(document.layers[0]).toMatchObject({
      alignment,
      contentAware: true,
      adjustments: {saturation: 0.25},
    })
    expect(document.layers[0].adjustments).toEqual({saturation: 0.25})
  })
  test('imports cannot carry a registration and adjustments stay in range', () => {
    expect(() => parseProjectDocument({
      layers: [generated({
        kind: 'import',
        contentAware: true,
      })],
      ingredients: [],
    })).toThrow()
    expect(() => parseProjectDocument({
      layers: [generated({adjustments: {contrast: 4}})],
      ingredients: [],
    })).toThrow()
  })
})
