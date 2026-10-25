import {afterEach, describe, expect, test} from 'bun:test'

import {isLayerTransformable, moveLayerInStack, removeLayer, updateLayer} from '#src/lib/actions.ts'
import {projectStore} from '#src/lib/state.ts'

import {createLayer, createRect, resetProject} from './lib/fixtures.ts'

const rect = createRect(200, 100, 10, 20)
const layer = (id: string, kind: 'generated' | 'import' = 'import') => createLayer(id, {
  kind,
  rect,
})
const getLayer = (id: string) => projectStore.state.layers.find(item => item.id === id)!
const moved = {
  ...rect,
  x: rect.x + 50,
}
afterEach(() => resetProject())
describe('layer transforms', () => {
  test('only imported layers above the base are transformable', () => {
    const layers = [layer('base'), layer('import'), layer('generated', 'generated')]
    expect(isLayerTransformable(layers[0], layers)).toBe(false)
    expect(isLayerTransformable(layers[1], layers)).toBe(true)
    expect(isLayerTransformable(layers[2], layers)).toBe(false)
  })
  test('the base layer cannot be moved, resized or rotated', () => {
    resetProject({layers: [layer('base'), layer('import')]})
    updateLayer('base', {rect: moved})
    updateLayer('base', {rect: {
      ...rect,
      width: 400,
      height: 200,
    }})
    updateLayer('base', {rotation: 45})
    expect(getLayer('base').rect).toEqual(rect)
    expect(getLayer('base').rotation).toBeUndefined()
    expect(projectStore.meta.state.canUndo).toBe(false)
    // Everything that is not placement remains editable.
    updateLayer('base', {
      opacity: 0.5,
      name: 'renamed',
    })
    expect(getLayer('base').opacity).toBe(0.5)
    expect(getLayer('base').name).toBe('renamed')
    // A patch that mixes placement with other properties is rejected as a whole.
    updateLayer('base', {
      rect: moved,
      visible: false,
    })
    expect(getLayer('base').visible).toBe(true)
  })
  test('imported layers above the base still transform', () => {
    resetProject({layers: [layer('base'), layer('import')]})
    updateLayer('import', {
      rect: moved,
      rotation: 30,
    })
    expect(getLayer('import').rect).toEqual(moved)
    expect(getLayer('import').rotation).toBe(30)
  })
  test('the lock follows whichever layer is at the bottom of the stack', () => {
    resetProject({layers: [layer('base'), layer('import')]})
    moveLayerInStack('import', -1)
    expect(projectStore.state.layers.map(item => item.id)).toEqual(['import', 'base'])
    updateLayer('import', {rect: moved})
    expect(getLayer('import').rect).toEqual(rect)
    updateLayer('base', {rect: moved})
    expect(getLayer('base').rect).toEqual(moved)
    removeLayer('import')
    updateLayer('base', {rect})
    expect(getLayer('base').rect).toEqual(moved)
  })
})
