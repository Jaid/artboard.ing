import type {CanvasJob, Job} from '#src/lib/state.ts'
import type {ComponentType} from 'react'

import {afterEach, describe, expect, jest, mock, test} from 'bun:test'

import {act, cleanup, fireEvent, render} from '@testing-library/react'
import {createElement} from 'react'

import {setRatio} from '#src/lib/actions.ts'
import {closeCollectionDialog, collectionDialogStore, openCollectionDialog} from '#src/lib/collectionDialog.ts'
import {closeContextMenu, contextMenuStore, openCollectionMenu, openContextMenu} from '#src/lib/contextMenu.ts'
import {closeExportDialog, exportDialogStore, openExportDialog} from '#src/lib/exporting.ts'
import {getModel} from '#src/lib/models/index.ts'
import {createInitialEditorState, defaultGeneratedMask, editorStore, projectStore} from '#src/lib/state.ts'

import {createEvidence, createIngredient, createLayer, createRect, resetProject} from './lib/fixtures.ts'
import testSassModulesPlugin from './lib/sassModulesPlugin.ts'

// Monaco cannot run in happy-dom, so the editor is replaced with a plain textarea.
const TextareaEditor = ({value, onChange, placeholder}: {
  onChange?: (value: string) => void
  placeholder?: string
  value?: string
}) => createElement('textarea', {
  placeholder,
  value,
  onChange: (event: {currentTarget: {value: string}}) => onChange?.(event.currentTarget.value),
})
await Bun.plugin(testSassModulesPlugin)
await mock.module('monacozen', () => ({default: TextareaEditor}))
async function renderComponent(componentSegment: string) {
  const {default: Component} = await import(`#src/components/${componentSegment}/index.tsx`) as {default: ComponentType}
  let result: ReturnType<typeof render> | undefined
  // An async act also settles effects that finish after the first render, like status requests.
  await act(async () => {
    result = render(createElement(Component))
  })
  return result!
}
const revision = (id: string) => ({
  assetId: `out-${id}`,
  evidence: createEvidence(id),
})
/** a transform of collection item 1 */
const createTransformJob = (id: string, status: Job['status']): Job => ({
  id,
  controller: new AbortController,
  modelId: 'google/gemini-nano-banana-2.1',
  prompt: 'Extract the subject of this image in high quality on a neutral background',
  startedAt: Date.now(),
  status,
  target: 'collection',
  presetId: 'extract-subject',
  ratio: '16:9',
  sourceIngredientId: 'ingredient-1',
  ...status === 'failed' ? {error: 'Image API request failed (HTTP 402).'} : {},
})
const menuItems = (container: HTMLElement) => [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
const getDialog = (container: HTMLElement) => container.querySelector<HTMLDialogElement>('[data-testid="collection-dialog"]')!
afterEach(() => {
  cleanup()
  jest.useRealTimers()
  act(() => {
    resetProject()
    editorStore.set(createInitialEditorState())
    closeContextMenu()
    closeCollectionDialog()
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
  test('the frame toggle and the shots dropdown sit right before the generate button', async () => {
    const {container} = await renderComponent('PromptPanel')
    const toggle = container.querySelector<HTMLButtonElement>('[data-testid="frame-toggle"]')!
    expect(toggle.nextElementSibling?.getAttribute('data-testid')).toBe('shots-select')
    expect(toggle.nextElementSibling?.nextElementSibling?.getAttribute('data-testid')).toBe('generate')
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    act(() => toggle.click())
    expect(editorStore.state.frameEnabled).toBe(false)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    act(() => toggle.click())
    expect(editorStore.state.frameEnabled).toBe(true)
  })
  test('the shots dropdown offers 1 to 8 images per generation', async () => {
    const {container} = await renderComponent('PromptPanel')
    const select = container.querySelector<HTMLSelectElement>('[data-testid="shots-select"]')!
    expect([...select.options].map(option => [option.value, option.textContent])).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map(count => [String(count), `${count}×`]))
    expect(select.value).toBe('1')
    fireEvent.change(select, {target: {value: '6'}})
    expect(editorStore.state.shots).toBe(6)
    expect(select.value).toBe('6')
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
    act(() => resetProject({ingredients: [3, 1, 2].map(index => createIngredient(index))}))
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
  test('running and failed transforms stand in the collection, not on the canvas', async () => {
    act(() => resetProject({ingredients: [createIngredient(1, {name: 'Witch'})]}))
    act(() => editorStore.set({jobs: [createTransformJob('running', 'running'), createTransformJob('failed', 'failed')]}))
    const {container} = await renderComponent('Ingredients')
    const tiles = [...container.querySelectorAll<HTMLElement>('[data-testid="transform-job"]')]
    expect(tiles.map(tile => tile.dataset.status)).toEqual(['running', 'failed'])
    expect(tiles[0].getAttribute('aria-label')).toStartWith('Extract subject of ![1] · Nano Banana 2.1')
    expect(tiles[0].querySelector('[aria-label="Retry"]')).toBeNull()
    expect(tiles[1].getAttribute('aria-label')).toBe('Extract subject of ![1] failed: Image API request failed (HTTP 402).')
    expect(tiles[1].querySelector('[aria-label="Retry"]')).not.toBeNull()
    // They are no collection items: no number, no reference, no menu.
    expect(container.querySelectorAll('[data-testid="ingredient"]')).toHaveLength(1)
    act(() => tiles[0].querySelector<HTMLButtonElement>('[aria-label="Cancel transform"]')!.click())
    expect(editorStore.state.jobs.map(item => item.id)).toEqual(['failed'])
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]')!.click())
    expect(editorStore.state.jobs).toEqual([])
    expect(container.querySelector('[data-testid="transform-job"]')).toBeNull()
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
  test('offers transforms, Export and Delete for items and Export… for the frame view', async () => {
    act(() => resetProject({ingredients: [createIngredient(1)]}))
    const {container} = await renderComponent('Ingredients')
    const menu = await renderComponent('ContextMenu')
    const labels = () => menuItems(menu.container).map(item => item.textContent)
    fireEvent.contextMenu(container.querySelector('[data-testid="ingredient"]')!, {
      clientX: 20,
      clientY: 20,
    })
    expect(contextMenuStore.state.collectionIndex).toBe(1)
    expect(labels()).toEqual(['Extract subject', 'Export', 'Delete'])
    const transform = menu.container.querySelector<HTMLButtonElement>('[role="group"][aria-label="Transform"] [data-preset="extract-subject"]')!
    expect(transform.title).toStartWith('Extract the subject of this image in high quality on a neutral background\n')
    expect(transform.title).toContain(getModel(editorStore.state.modelId).title)
    expect(transform.title).toContain(editorStore.state.ratio)
    // Without the image’s pixels there is nothing to transform.
    expect(transform.disabled).toBe(true)
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
describe('JobOverlay', () => {
  test('the shots of one layer share one overlay that sums them up and cancels or dismisses them together', async () => {
    const shot = (id: string, status: Job['status']): Job => ({
      id,
      controller: new AbortController,
      modelId: 'google/gemini-nano-banana-2.1',
      prompt: 'A witch',
      startedAt: Date.now(),
      status,
      target: 'canvas',
      layerId: 'layer',
      rect: createRect(100, 100),
      ...status === 'failed' ? {error: 'Image API request failed (HTTP 402).'} : {},
    })
    const jobs = [shot('a', 'running'), shot('b', 'running'), shot('c', 'running'), shot('d', 'failed'), shot('e', 'failed')]
    act(() => editorStore.set({jobs}))
    const {default: JobOverlay} = await import('#src/components/JobOverlay/index.tsx')
    const {container} = render(createElement(JobOverlay, {
      jobs: jobs as Array<CanvasJob>,
      rect: createRect(100, 100),
    }))
    expect(container.querySelectorAll('[data-testid="job-overlay"]')).toHaveLength(1)
    expect(container.textContent).toContain('3 shots · Nano Banana 2.1 · 0 s')
    expect(container.textContent).toContain('2 shots failed: Image API request failed (HTTP 402).')
    act(() => container.querySelector<HTMLButtonElement>('[title="Cancel 3 generations"]')!.click())
    expect(jobs.slice(0, 3).every(job => job.controller.signal.aborted)).toBe(true)
    expect(editorStore.state.jobs.map(job => job.id)).toEqual(['d', 'e'])
    act(() => container.querySelector<HTMLButtonElement>('[title="Dismiss"]')!.click())
    expect(editorStore.state.jobs).toEqual([])
  })
})
describe('collection dialog', () => {
  test('clicking a tile shows its details with the very menu of its context menu and leaves the prompt alone', async () => {
    act(() => {
      resetProject({ingredients: [createIngredient(1, {name: 'Witch'})]})
      editorStore.set({prompt: 'Keep me'})
    })
    const {container} = await renderComponent('Ingredients')
    const details = await renderComponent('CollectionDialog')
    const menu = await renderComponent('ContextMenu')
    const tile = container.querySelector<HTMLElement>('[data-testid="ingredient"]')!
    expect(tile.querySelector('button')?.getAttribute('aria-haspopup')).toBe('dialog')
    act(() => tile.querySelector('button')!.click())
    expect(collectionDialogStore.state.index).toBe(1)
    expect(editorStore.state.prompt).toBe('Keep me')
    const dialog = getDialog(details.container)
    expect(dialog.open).toBe(true)
    expect(dialog.querySelector('[data-testid="collection-dialog-image"]')?.getAttribute('src')).toBe('data:image/webp;base64,AAAA')
    expect(dialog.querySelector('h2')?.textContent).toBe('1Witch')
    // An import has no request capture.
    expect(dialog.querySelector('[data-testid="collection-dialog-prompt"]')).toBeNull()
    const dialogMenu = dialog.querySelector<HTMLElement>('[role="menu"]')!
    expect(menuItems(dialogMenu).map(item => item.textContent)).toEqual(['Extract subject', 'Export', 'Delete'])
    act(() => closeCollectionDialog())
    expect(dialog.open).toBe(false)
    expect(dialog.textContent).toBe('')
    fireEvent.contextMenu(tile)
    expect(menu.container.querySelector('[role="menu"]')!.innerHTML).toBe(dialogMenu.innerHTML)
  })
  test('a generation shows its prompt and inference details, found in its layer for entries without their own capture', async () => {
    act(() => resetProject({
      layers: [createLayer('generated', {
        assetId: 'out-a',
        kind: 'generated',
        evidence: createEvidence('a', {
          prompt: 'A witch on a broom',
          compiledPrompt: 'A witch [image 2] on a broom',
          canvasAssetId: 'canvas-a',
          referenceAssetIds: ['reference-a'],
          resolution: '2K',
          quality: 'high',
          cost: 0.025,
        }),
      })],
      ingredients: [createIngredient(1, {
        assetId: 'out-a',
        kind: 'generated',
        name: 'A witch on a broom',
      })],
    }))
    const {container} = await renderComponent('CollectionDialog')
    act(() => openCollectionDialog(1))
    const dialog = getDialog(container)
    expect(dialog.querySelector('[data-testid="collection-dialog-prompt"]')?.textContent).toBe('A witch on a broom')
    expect(dialog.querySelector('details')?.textContent).toBe('Sent to the modelA witch [image 2] on a broom')
    const inference = Object.fromEntries([...dialog.querySelectorAll('[data-testid="collection-dialog-inference"] dt')].map(term => [term.textContent, term.nextElementSibling?.textContent]))
    expect(inference).toMatchObject({
      Model: 'Nano Banana 2.1',
      Ratio: '1:1',
      Resolution: '2K',
      Quality: 'high',
      Cost: '$ 0.0250',
    })
    // The captured canvas comes first, like in the prompt the model received.
    expect([...dialog.querySelectorAll('figcaption')].map(caption => caption.parentElement!.title)).toEqual(['image 1: the canvas inside the frame, ![0]', 'image 2: a collection image'])
  })
  test('the frame view shows a large live view and offers Export…', async () => {
    const {container} = await renderComponent('CollectionDialog')
    act(() => openCollectionDialog(0))
    const dialog = getDialog(container)
    expect(dialog.open).toBe(true)
    expect(dialog.querySelector('canvas[data-testid="collection-dialog-image"]')).not.toBeNull()
    const items = menuItems(dialog)
    expect(items.map(item => item.textContent)).toEqual(['Export…'])
    expect(items[0].disabled).toBe(true)
  })
  test('arrow keys go through the tiles: left and right step, up jumps to the frame view and down to the last item', async () => {
    act(() => resetProject({
      ingredients: [createIngredient(2), createIngredient(5), createIngredient(9)],
      nextIngredientIndex: 10,
    }))
    const {container} = await renderComponent('CollectionDialog')
    const dialog = getDialog(container)
    const press = (key: string, target: Element = dialog, init: KeyboardEventInit = {}) => act(() => {
      target.dispatchEvent(new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...init,
      }))
    })
    act(() => openCollectionDialog(5))
    press('ArrowRight')
    expect(collectionDialogStore.state.index).toBe(9)
    press('ArrowRight')
    expect(collectionDialogStore.state.index).toBe(0)
    expect(dialog.querySelector('canvas[data-testid="collection-dialog-image"]')).not.toBeNull()
    press('ArrowLeft')
    expect(collectionDialogStore.state.index).toBe(9)
    press('ArrowUp')
    expect(collectionDialogStore.state.index).toBe(0)
    press('ArrowDown')
    expect(collectionDialogStore.state.index).toBe(9)
    press('ArrowLeft', dialog, {shiftKey: true})
    expect(collectionDialogStore.state.index).toBe(9)
    // Dropdowns keep their arrow keys, and so does the menu for moving between its items.
    press('ArrowLeft', dialog.querySelector('select')!)
    expect(collectionDialogStore.state.index).toBe(9)
    const item = menuItems(dialog)[0]
    act(() => item.focus())
    press('ArrowDown', item)
    expect(collectionDialogStore.state.index).toBe(9)
    expect(document.activeElement).toBe(menuItems(dialog)[1])
    press('ArrowLeft', item)
    expect(collectionDialogStore.state.index).toBe(5)
  })
  test('actions close the dialog, and so does a removed entry', async () => {
    act(() => resetProject({
      ingredients: [createIngredient(1), createIngredient(2)],
      nextIngredientIndex: 3,
    }))
    const {container} = await renderComponent('CollectionDialog')
    act(() => openCollectionDialog(1))
    act(() => menuItems(getDialog(container)).find(item => item.textContent === 'Delete')!.click())
    await act(() => Promise.resolve())
    expect(projectStore.state.ingredients.map(item => item.index)).toEqual([2])
    expect(collectionDialogStore.state.index).toBeNull()
    expect(getDialog(container).open).toBe(false)
    act(() => openCollectionDialog(2))
    expect(getDialog(container).open).toBe(true)
    act(() => resetProject())
    expect(collectionDialogStore.state.index).toBeNull()
    expect(getDialog(container).open).toBe(false)
    act(() => openCollectionDialog(0))
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Close details"]')!.click())
    expect(collectionDialogStore.state.index).toBeNull()
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
    await act(() => projectStore.undo())
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
    await act(() => jest.advanceTimersByTime(zoomIndicatorDuration / 2))
    setView({scale: 1.5})
    await act(() => jest.advanceTimersByTime(zoomIndicatorDuration - 1))
    expect(indicator.hasAttribute('data-visible')).toBe(true)
    expect(indicator.textContent).toBe('150%')
    await act(() => jest.advanceTimersByTime(1))
    expect(indicator.hasAttribute('data-visible')).toBe(false)
  })
})
describe('ExportDialog', () => {
  test('only opens on request', async () => {
    const {container} = await renderComponent('ExportDialog')
    const dialog = container.querySelector<HTMLDialogElement>('[data-testid="export-dialog"]')!
    expect(dialog.textContent).toBe('')
    act(() => openExportDialog())
    expect(dialog.textContent).toContain('Export image')
    expect(container.querySelector<HTMLSelectElement>('[aria-label="Export region"]')?.value).toBe('frame')
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Close export"]')!.click())
    expect(exportDialogStore.state.open).toBe(false)
  })
})
