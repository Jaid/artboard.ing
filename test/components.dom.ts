import type {ComponentType} from 'react'

import {afterEach, describe, expect, jest, mock, test} from 'bun:test'

import {act, cleanup, fireEvent, render} from '@testing-library/react'
import {createElement} from 'react'

import {setRatio} from '#src/lib/actions.ts'
import {closeContextMenu, contextMenuStore, openCollectionMenu, openContextMenu} from '#src/lib/contextMenu.ts'
import {closeExportDialog, exportDialogStore, openExportDialog} from '#src/lib/exporting.ts'
import {getModel} from '#src/lib/models/index.ts'
import {createInitialEditorState, defaultGeneratedMask, editorStore, projectStore} from '#src/lib/state.ts'

import {createEvidence, createIngredient, createLayer, createRect, resetProject} from './lib/fixtures.ts'
import testSassModulesPlugin from './lib/sassModulesPlugin.ts'

Bun.plugin(testSassModulesPlugin)
// Monaco cannot run in happy-dom, so the editor is replaced with its native textarea backend.
mock.module('monacozen', () => {
  const DummyEditor = ({value, onChange, placeholder}: {
    onChange?: (value: string) => void
    placeholder?: string
    value?: string
  }) => createElement('textarea', {
    placeholder,
    value,
    onChange: (event: {currentTarget: {value: string}}) => onChange?.(event.currentTarget.value),
  })
  return {
    default: DummyEditor,
    DummyEditor,
  }
})
async function renderComponent(componentSegment: string) {
  const {default: Component} = await import(`#src/components/${componentSegment}/index.tsx`) as {default: ComponentType}
  let result: ReturnType<typeof render> | undefined
  // An async act also settles effects that finish after the first render, like status requests.
  await act(async () => {
    result = render(createElement(Component))
  })
  return result!
}
const menuItems = (container: HTMLElement) => [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
afterEach(() => {
  cleanup()
  jest.useRealTimers()
  act(() => {
    resetProject()
    editorStore.set(createInitialEditorState())
    closeContextMenu()
    closeExportDialog()
  })
})
describe('App', () => {
  test('renders the frame, the generate button and the layers panel', async () => {
    const {container} = await renderComponent('App')
    // The frame carries no text label.
    expect(container.querySelector('[data-testid="frame"]')?.textContent).toBe('')
    expect(container.querySelector('[data-testid="generate"]')?.textContent).toContain('Generate')
    expect(container.querySelector('[data-testid="layers-panel"]')).not.toBeNull()
  })
})
describe('PromptPanel', () => {
  test('lists all models', async () => {
    const {container} = await renderComponent('PromptPanel')
    const options = [...container.querySelectorAll('[data-testid="model-select"] option')].map(option => option.getAttribute('value'))
    expect(options).toHaveLength(9)
    expect(options).toContain('bytedance-seed/seedream-5-0-pro')
  })
  test('switching the model keeps the frame ratio supported', async () => {
    const {container} = await renderComponent('PromptPanel')
    act(() => setRatio('1:8'))
    fireEvent.change(container.querySelector('[data-testid="model-select"]')!, {target: {value: 'x-ai/grok-imagine-image-2.0'}})
    expect(editorStore.state.modelId).toBe('x-ai/grok-imagine-image-2.0')
    expect(getModel(editorStore.state.modelId).supportsRatio(editorStore.state.ratio)).toBe(true)
    expect(editorStore.state.ratio).toBe('9:20')
  })
  test('the frame toggle sits right before the generate button', async () => {
    const {container} = await renderComponent('PromptPanel')
    const toggle = container.querySelector<HTMLButtonElement>('[data-testid="frame-toggle"]')!
    expect(toggle.nextElementSibling?.getAttribute('data-testid')).toBe('generate')
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    act(() => toggle.click())
    expect(editorStore.state.frameEnabled).toBe(false)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    act(() => toggle.click())
    expect(editorStore.state.frameEnabled).toBe(true)
  })
  test('project actions share the title row', async () => {
    const {container} = await renderComponent('PromptPanel')
    const header = container.querySelector('header')!
    expect(header.querySelector('nav[aria-label="Project actions"]')).not.toBeNull()
    expect(header.querySelector('h1')).not.toBeNull()
  })
})
describe('Ingredients', () => {
  test('the collection starts with a live frame view at position 0', async () => {
    const empty = await renderComponent('Ingredients')
    const frameView = empty.container.querySelector<HTMLElement>('[data-index="0"]')!
    expect(frameView.dataset.testid).toBe('frame-view')
    expect(frameView.querySelector('canvas')).not.toBeNull()
    expect(empty.container.querySelectorAll('[data-testid="ingredient"]')).toHaveLength(0)
    expect(empty.container.textContent).toContain('collection')
  })
  test('shows numbered, draggable thumbnails without names', async () => {
    act(() => resetProject({
      ingredients: [3, 1, 2].map(index => createIngredient(index)),
      nextIngredientIndex: 4,
    }))
    const {container} = await renderComponent('Ingredients')
    const tiles = [...container.querySelectorAll<HTMLElement>('[data-testid="ingredient"]')]
    expect(tiles.map(tile => tile.dataset.index ?? '').toSorted((a, b) => a.localeCompare(b))).toEqual(['1', '2', '3'])
    expect(tiles.every(tile => tile.getAttribute('draggable') === 'true')).toBe(true)
    expect(tiles.every(tile => tile.querySelector('img')?.getAttribute('src') === 'data:image/webp;base64,AAAA')).toBe(true)
    // Names only appear in the tooltips.
    const visibleText = [...container.querySelectorAll('[data-index] > button')].map(button => button.textContent).join('')
    expect(visibleText).not.toContain('Image 1')
  })
  test('tiles use rich tooltips instead of title attributes', async () => {
    act(() => resetProject({ingredients: [createIngredient(1, {name: 'Witch'})]}))
    const {container} = await renderComponent('Ingredients')
    for (const tile of container.querySelectorAll<HTMLElement>('[data-index]')) {
      const button = tile.querySelector('button')!
      expect(button.hasAttribute('title')).toBe(false)
      const tooltip = tile.querySelector(`#${CSS.escape(button.getAttribute('interestfor')!)}`)!
      expect(tooltip.getAttribute('popover')).toBe('hint')
      expect(tooltip.getAttribute('role')).toBe('tooltip')
    }
    expect(container.querySelector('[data-testid="ingredient"] [role="tooltip"]')?.textContent).toContain('Witch')
  })
  test('hovering a tile marks it for the prompt, the layers and the canvas', async () => {
    act(() => resetProject({ingredients: [createIngredient(4)]}))
    const {container} = await renderComponent('Ingredients')
    const tile = container.querySelector('[data-testid="ingredient"]')!
    fireEvent.pointerEnter(tile)
    expect(editorStore.state.hoveredCollectionIndex).toBe(4)
    fireEvent.pointerLeave(tile)
    expect(editorStore.state.hoveredCollectionIndex).toBeNull()
    fireEvent.pointerEnter(container.querySelector('[data-testid="frame-view"]')!)
    expect(editorStore.state.hoveredCollectionIndex).toBe(0)
    // Removing a hovered tile clears the highlight.
    cleanup()
    expect(editorStore.state.hoveredCollectionIndex).toBeNull()
  })
})
describe('collection context menu', () => {
  test('offers Export and Delete for items and Export… for the frame view', async () => {
    act(() => resetProject({
      ingredients: [createIngredient(1)],
      nextIngredientIndex: 2,
    }))
    const {container} = await renderComponent('Ingredients')
    const menu = await renderComponent('ContextMenu')
    const labels = () => menuItems(menu.container).map(item => item.textContent)
    fireEvent.contextMenu(container.querySelector('[data-testid="ingredient"]')!, {
      clientX: 20,
      clientY: 20,
    })
    expect(contextMenuStore.state.collectionIndex).toBe(1)
    expect(labels()).toEqual(['Export', 'Delete'])
    act(() => closeContextMenu())
    fireEvent.contextMenu(container.querySelector('[data-testid="frame-view"]')!)
    expect(contextMenuStore.state.collectionIndex).toBe(0)
    expect(labels()).toEqual(['Export…'])
    // Without visible artwork there is nothing to export.
    expect(menuItems(menu.container)[0].disabled).toBe(true)
  })
  test('rotation and flip dropdowns reflect the entry', async () => {
    act(() => resetProject({ingredients: [createIngredient(1, {
      assetId: 'asset-turned',
      sourceAssetId: 'asset-1',
      rotation: 270,
      flip: 'vertical',
    })]}))
    const menu = await renderComponent('ContextMenu')
    act(() => openCollectionMenu(10, 10, 1))
    const rotation = menu.container.querySelector<HTMLSelectElement>('[data-testid="collection-rotation"]')!
    const flip = menu.container.querySelector<HTMLSelectElement>('[data-testid="collection-flip"]')!
    expect(rotation.closest('label')?.textContent).toStartWith('Rotation')
    expect(flip.closest('label')?.textContent).toStartWith('Flip')
    expect([...rotation.options].map(option => option.textContent)).toEqual(['0°', '90° clockwise', '90° counterclockwise', '180°'])
    expect([...flip.options].map(option => option.textContent)).toEqual(['None', 'Horizontal', 'Vertical'])
    expect(rotation.value).toBe('270')
    expect(flip.value).toBe('vertical')
    // Without the original pixels there is nothing to transform.
    expect(rotation.disabled).toBe(true)
    expect(flip.disabled).toBe(true)
    act(() => openCollectionMenu(10, 10, 0))
    expect(menu.container.querySelector('select')).toBeNull()
  })
  test('Delete removes an item without renumbering', async () => {
    act(() => resetProject({
      ingredients: [createIngredient(1), createIngredient(2)],
      nextIngredientIndex: 3,
    }))
    const menu = await renderComponent('ContextMenu')
    act(() => openCollectionMenu(10, 10, 1))
    act(() => menuItems(menu.container).find(item => item.textContent === 'Delete')!.click())
    await act(() => Promise.resolve())
    expect(projectStore.state.ingredients.map(item => item.index)).toEqual([2])
    expect(projectStore.state.nextIngredientIndex).toBe(3)
  })
})
describe('LayersPanel', () => {
  test('shows image controls for the selected layer and mask sliders only while editing its mask', async () => {
    const rect = createRect(10, 10)
    act(() => {
      resetProject({layers: [createLayer('a', {
        name: 'background',
        rect,
      }), createLayer('b', {
        kind: 'generated',
        name: 'edit',
        rect,
        ...defaultGeneratedMask,
      })]})
      editorStore.set({
        selectedLayerId: 'b',
        layersPanelOpen: true,
      })
    })
    const {container} = await renderComponent('LayersPanel')
    expect(container.querySelectorAll('[data-testid="layer-row"]')).toHaveLength(2)
    const adjustmentSliders = () => [...container.querySelectorAll<HTMLInputElement>('input[type="range"][data-adjustment]')].map(input => input.dataset.adjustment)
    expect(adjustmentSliders()).toEqual(['brightness', 'contrast', 'gamma', 'saturation', 'vibrance', 'temperature'])
    // Besides the adjustments, only the opacity slider belongs to the image.
    expect([...container.querySelectorAll<HTMLInputElement>('input[type="range"]:not([data-adjustment])')].map(input => input.dataset.testid)).toEqual(['opacity'])
    fireEvent.change(container.querySelector('[data-testid="opacity"]')!, {target: {value: '35'}})
    expect(projectStore.state.layers[1].opacity).toBe(0.35)
    fireEvent.change(container.querySelector('[data-testid="opacity"]')!, {target: {value: '100'}})
    // Fully opaque layers carry no opacity.
    expect('opacity' in projectStore.state.layers[1]).toBe(false)
    expect(container.textContent).not.toMatch(/Area|Feather/)
    expect(container.textContent).toContain('White balance')
    // Without a captured canvas input there is nothing to align against.
    expect(container.querySelector<HTMLInputElement>('[data-testid="content-aware"]')!.disabled).toBe(true)
    fireEvent.change(container.querySelector('[data-adjustment="saturation"]')!, {target: {value: '40'}})
    expect(projectStore.state.layers[1].adjustments).toEqual({saturation: 0.4})
    fireEvent.change(container.querySelector('[data-adjustment="saturation"]')!, {target: {value: '0'}})
    // A neutral look is stored as no adjustments at all.
    expect('adjustments' in projectStore.state.layers[1]).toBe(false)
    const maskThumbnails = container.querySelectorAll<HTMLButtonElement>('[data-testid="mask-thumbnail"]')
    expect(maskThumbnails).toHaveLength(1)
    act(() => maskThumbnails[0].click())
    expect(editorStore.state.tool).toBe('mask')
    expect(maskThumbnails[0].getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelectorAll('input[type="range"]')).toHaveLength(5)
    expect(adjustmentSliders()).toEqual([])
    expect(container.querySelector('[data-testid="content-aware"]')).toBeNull()
    expect(container.textContent).toContain('Area')
    expect(container.textContent).toContain('Feather')
    act(() => maskThumbnails[0].click())
    expect(editorStore.state.tool).toBe('frame')
    expect(container.querySelectorAll('input[type="range"]:not([data-adjustment])')).toHaveLength(1)
  })
  test('the base layer has adjustments, but no mask, no alignment and a locked placement', async () => {
    act(() => {
      resetProject({layers: [createLayer('base'), createLayer('top')]})
      editorStore.set({
        selectedLayerId: 'base',
        layersPanelOpen: true,
      })
    })
    const {container} = await renderComponent('LayersPanel')
    expect(container.querySelectorAll('input[type="range"]:not([data-adjustment], [data-testid="opacity"])')).toHaveLength(0)
    expect(container.querySelectorAll('input[type="range"][data-adjustment]')).toHaveLength(6)
    expect(container.querySelector('[data-testid="content-aware"]')).toBeNull()
    expect(container.textContent).not.toContain('Move, resize & rotate')
    expect(container.textContent).toContain('Its placement is locked.')
  })
  test('layer rows hide via the context menu, keep a show button for hidden layers and cycle revisions', async () => {
    const revision = (id: string) => ({
      assetId: `out-${id}`,
      evidence: createEvidence(id),
    })
    act(() => {
      resetProject({layers: [createLayer('base'), createLayer('gen', {
        assetId: 'out-b',
        kind: 'generated',
        name: 'Cat',
        evidence: createEvidence('b'),
        revision: 1,
        revisions: [revision('a'), revision('b'), revision('c')],
      })]})
      editorStore.set({layersPanelOpen: true})
    })
    const {container} = await renderComponent('LayersPanel')
    const rows = () => [...container.querySelectorAll<HTMLElement>('[data-testid="layer-row"]')]
    const selector = () => container.querySelector<HTMLElement>('[data-testid="revision-selector"]')!
    // Visible layers have no eye button.
    expect(rows().some(row => row.querySelector('[aria-label="Hide layer"], [aria-label="Show layer"]'))).toBe(false)
    expect(selector().textContent.replaceAll(/[▸◂]/g, '')).toBe('2/3')
    act(() => selector().querySelector<HTMLButtonElement>('[aria-label^="Show the next"]')!.click())
    expect(projectStore.state.layers[1].assetId).toBe('out-c')
    expect(projectStore.state.layers[1].evidence?.id).toBe('c')
    expect(selector().textContent).toContain('3/3')
    expect(selector().querySelector<HTMLButtonElement>('[aria-label^="Show the next"]')!.disabled).toBe(true)
    // Hovering the collection item of a buried revision highlights the selector instead of the thumbnail.
    act(() => projectStore.set(document => ({
      ...document,
      ingredients: [createIngredient(1, {
        assetId: 'out-a',
        kind: 'generated',
      }), createIngredient(2, {
        assetId: 'out-c',
        kind: 'generated',
      })],
    })))
    act(() => editorStore.set({hoveredCollectionIndex: 1}))
    expect(selector().hasAttribute('data-highlighted')).toBe(true)
    expect(container.querySelector('button[data-highlighted]')).toBeNull()
    act(() => editorStore.set({hoveredCollectionIndex: 2}))
    expect(selector().hasAttribute('data-highlighted')).toBe(false)
    expect(container.querySelectorAll('button[data-highlighted]')).toHaveLength(1)
    act(() => editorStore.set({hoveredCollectionIndex: null}))
    // Undo goes back to the previous revision.
    act(() => projectStore.undo())
    expect(projectStore.state.layers[1].assetId).toBe('out-b')
    // The context menu offers Hide and Reroll.
    const menu = await renderComponent('ContextMenu')
    fireEvent.contextMenu(rows()[0])
    expect(contextMenuStore.state.layerId).toBe('gen')
    const items = menuItems(menu.container)
    expect(items.map(item => item.textContent)).toContain('Reroll')
    act(() => items.find(item => item.textContent === 'Hide layer')!.click())
    await act(() => Promise.resolve())
    expect(projectStore.state.layers[1].visible).toBe(false)
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Show layer"]')!.click())
    expect(projectStore.state.layers[1].visible).toBe(true)
    expect(container.querySelector('[aria-label="Show layer"]')).toBeNull()
  })
})
describe('layer context menu', () => {
  test('locks the placement of the base layer', async () => {
    act(() => resetProject({layers: [createLayer('base'), createLayer('top')]}))
    const menu = await renderComponent('ContextMenu')
    const transformItem = (layerId: string) => {
      act(() => openContextMenu(10, 10, layerId))
      const item = menuItems(menu.container).find(button => /Transform|placement is locked/.test(button.textContent))!
      const result = {
        label: item.textContent,
        disabled: item.disabled,
      }
      act(() => closeContextMenu())
      return result
    }
    expect(transformItem('base')).toEqual({
      label: 'Base layer placement is locked',
      disabled: true,
    })
    expect(transformItem('top')).toEqual({
      label: 'Transform imported image',
      disabled: false,
    })
  })
})
describe('ZoomIndicator', () => {
  test('appears briefly whenever the zoom level changes', async () => {
    const {zoomIndicatorDuration} = await import('#src/components/ZoomIndicator/index.tsx')
    const setView = (view: Partial<typeof editorStore.state.view>) => act(() => editorStore.set(state => ({
      ...state,
      view: {
        ...state.view,
        ...view,
      },
    })))
    setView({
      x: 0,
      y: 0,
      scale: 1,
    })
    jest.useFakeTimers()
    const {getByTestId} = await renderComponent('ZoomIndicator')
    const indicator = getByTestId('zoom-indicator')
    expect(indicator.hasAttribute('data-visible')).toBe(false)
    // Panning keeps the scale and must not reveal the indicator.
    setView({
      x: 40,
      y: 20,
    })
    expect(indicator.hasAttribute('data-visible')).toBe(false)
    setView({scale: 1.25})
    expect(indicator.hasAttribute('data-visible')).toBe(true)
    expect(indicator.textContent).toBe('125%')
    // A further change restarts the countdown.
    act(() => jest.advanceTimersByTime(zoomIndicatorDuration / 2))
    setView({scale: 1.5})
    act(() => jest.advanceTimersByTime(zoomIndicatorDuration - 1))
    expect(indicator.hasAttribute('data-visible')).toBe(true)
    expect(indicator.textContent).toBe('150%')
    act(() => jest.advanceTimersByTime(1))
    expect(indicator.hasAttribute('data-visible')).toBe(false)
  })
})
describe('ExportDialog', () => {
  test('only opens on request', async () => {
    const {container} = await renderComponent('ExportDialog')
    const dialog = container.querySelector<HTMLDialogElement>('[data-testid="export-dialog"]')!
    expect(dialog.textContent).toBe('')
    act(() => openExportDialog('frame'))
    expect(dialog.textContent).toContain('Export image')
    expect(container.querySelector<HTMLSelectElement>('[aria-label="Export region"]')?.value).toBe('frame')
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Close export"]')!.click())
    expect(exportDialogStore.state.open).toBe(false)
  })
})
