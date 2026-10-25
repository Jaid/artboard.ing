import {afterEach, describe, expect, test} from 'bun:test'

import {getExportRegion} from '#src/lib/exporting.ts'
import {getContentRegion, getGenerationMode, getGenerationRegion, hasContentOutside} from '#src/lib/generationRegion.ts'
import {editorStore} from '#src/lib/state.ts'

import {createLayer, createRect, resetProject} from './lib/fixtures.ts'

const base = createLayer('base', {rect: createRect(200, 100)})
const settings = {
  modelId: 'google/gemini-nano-banana-2.1',
  ratio: '1:1',
} as const
afterEach(() => {
  resetProject()
  editorStore.set({frameEnabled: true})
})
describe('generation region', () => {
  test('the frame is used while it is on', () => {
    const frame = createRect(10, 10, 5, 5)
    expect(getGenerationRegion({
      ...settings,
      frame,
      frameEnabled: true,
    }, [base])).toEqual({
      frame,
      ratio: '1:1',
    })
  })
  test('a switched-off frame spans all artwork with the closest supported ratio', () => {
    const region = getGenerationRegion({
      ...settings,
      frame: createRect(1, 1),
      frameEnabled: false,
    }, [base, createLayer('top', {rect: createRect(100, 100, 150, 50)})])
    // Artwork spans 250 × 150; the frame must cover it completely at a supported ratio.
    expect(region.ratio).toBe('16:9')
    expect(region.frame.width).toBeGreaterThanOrEqual(250)
    expect(region.frame.height).toBeGreaterThanOrEqual(150 - 1e-9)
    expect(region.frame.width / region.frame.height).toBeCloseTo(16 / 9)
    expect(region.frame.x + region.frame.width / 2).toBeCloseTo(125)
    expect(region.frame.y + region.frame.height / 2).toBeCloseTo(75)
  })
  test('without artwork a switched-off frame falls back to the frame', () => {
    const frame = createRect(3, 3, 1, 2)
    expect(getContentRegion([], ['1:1'])).toBeUndefined()
    expect(getGenerationRegion({
      ...settings,
      frame,
      frameEnabled: false,
    }, []).frame).toEqual(frame)
  })
  test('content outside the frame is detected with a rounding tolerance', () => {
    expect(hasContentOutside([base], createRect(200, 100))).toBe(false)
    expect(hasContentOutside([base], createRect(199.9, 100, 0.1))).toBe(false)
    expect(hasContentOutside([base], createRect(100, 100, 20))).toBe(true)
    expect(hasContentOutside([{
      ...base,
      visible: false,
    }], createRect(100, 100, 20))).toBe(false)
  })
  test('a frame without artwork generates', () => {
    expect(getGenerationMode([base], createRect(100, 100, 500, 500))).toBe('generate')
  })
  test('the frame export region is what ![0] shows, also while the frame is off', () => {
    const frame = createRect(100, 100)
    resetProject({layers: [createLayer('wide', {rect: createRect(300, 100)})]})
    editorStore.set({
      frame,
      frameEnabled: true,
    })
    expect(getExportRegion('frame')).toEqual(frame)
    editorStore.set({frameEnabled: false})
    const region = getExportRegion('frame')!
    expect(region.width / region.height).toBeGreaterThan(2)
    expect(region.width).toBeGreaterThanOrEqual(300)
  })
})
