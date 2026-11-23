import type {Layer} from '#src/lib/state.ts'

import {useEffect, useRef} from 'react'

import CollectionMenu from '#component/CollectionMenu'
import Menu, {focusableSelector, MenuItem} from '#component/Menu'
import {addIngredients, fitFrameToContent, fitFrameToRect, fitViewToContent, fitViewToFrame, importLayers, isLayerTransformable, moveLayerInStack, redo, removeLayer, selectLayer, undo, updateLayer} from '#src/lib/actions.ts'
import {closeContextMenu, contextMenuStore} from '#src/lib/contextMenu.ts'
import {pickImageFiles} from '#src/lib/filePicker.ts'
import {reroll} from '#src/lib/generation.ts'
import {getLayerBounds} from '#src/lib/layerGeometry.ts'
import {insertIntoPrompt} from '#src/lib/promptEditor.ts'
import {editorStore, projectStore} from '#src/lib/state.ts'
import {useStore} from '#src/lib/store/index.ts'
import {zoomBy} from '#src/lib/viewport.ts'
import {captureCanvasSnapshot, referenceAsset} from '#src/lib/workspaceIO.ts'

import css from './style.module.sass'

const getTransformLabel = (layer: Layer) => {
  if (layer.kind === 'generated') {
    return 'Generated placement is locked'
  }
  return isLayerTransformable(layer) ? 'Transform imported image' : 'Base layer placement is locked'
}
const button = (label: string, action: () => unknown, disabled = false) => <MenuItem disabled={disabled} onSelect={action}>{label}</MenuItem>
export default function ContextMenu() {
  const menu = useStore(contextMenuStore)
  const ref = useRef<HTMLDivElement>(null)
  const layer = useStore(projectStore, state => state.layers.find(item => item.id === menu.layerId))
  const collectionItemExists = useStore(projectStore, state => state.ingredients.some(item => item.index === menu.collectionIndex))
  const shots = useStore(editorStore, state => state.shots)
  useEffect(() => {
    if (!menu.open) {
      return
    }
    const previous = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>(focusableSelector)?.focus()
    const dismiss = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        closeContextMenu()
      }
    }
    addEventListener('pointerdown', dismiss)
    return () => {
      removeEventListener('pointerdown', dismiss)
      if (previous?.isConnected) {
        previous.focus({preventScroll: true})
      }
    }
  }, [menu.open])
  // An item removed while its menu is open leaves nothing to act on.
  const collection = menu.collectionIndex !== null
  const stale = collection && menu.collectionIndex !== 0 && !collectionItemExists
  useEffect(() => {
    if (menu.open && stale) {
      closeContextMenu()
    }
  }, [menu.open, stale])
  if (!menu.open || stale) {
    return null
  }
  const estimatedHeight = collection ? 300 : (layer ? 650 : 420)
  const style = {
    top: Math.max(8, Math.min(menu.y, innerHeight - estimatedHeight)),
    left: Math.max(8, Math.min(menu.x, innerWidth - 252)),
  }
  if (menu.collectionIndex !== null) {
    return <CollectionMenu className={css.popup} aria-label='Collection context menu' index={menu.collectionIndex} style={style} ref={ref} onClose={closeContextMenu} />
  }
  return <Menu className={css.popup} aria-label='Canvas context menu' style={style} ref={ref} onClose={closeContextMenu}>
    {layer && <>
      <strong>{layer.name}</strong>
      {button('Frame it', () => {
        fitFrameToRect(getLayerBounds(layer))
        editorStore.set({
          tool: 'frame',
          frameEnabled: true,
        })
      })}
      {layer.kind === 'generated' && layer.evidence && button(shots > 1 ? `Reroll ${shots}×` : 'Reroll', () => reroll(layer.id))}
      {button('Use as prompt reference', async () => {
        const ingredient = await referenceAsset(layer.assetId, layer.name, layer.kind)
        insertIntoPrompt(`![${ingredient.index}]`)
      })}
      {button(getTransformLabel(layer), () => {
        selectLayer(layer.id)
        editorStore.set({tool: 'image'})
      }, !isLayerTransformable(layer))}
      {button('Edit mask', () => {
        selectLayer(layer.id)
        editorStore.set({tool: 'mask'})
      }, projectStore.state.layers[0]?.id === layer.id)}
      {button(layer.visible ? 'Hide layer' : 'Show layer', () => updateLayer(layer.id, {visible: !layer.visible}))}
      {button('Move up', () => moveLayerInStack(layer.id, 1))}
      {button('Move down', () => moveLayerInStack(layer.id, -1))}
      {button('Delete layer', () => removeLayer(layer.id))}
      <hr />
    </>}
    {button('Frame all artwork', () => {
      fitFrameToContent()
      editorStore.set({
        tool: 'frame',
        frameEnabled: true,
      })
    })}
    {button(editorStore.state.frameEnabled ? 'Show the frame · F' : 'Show the generation area · F', fitViewToFrame)}
    {button('Show all artwork · Shift+F', fitViewToContent)}
    {button('Zoom in · +', () => zoomBy(1.25))}
    {button('Zoom out · −', () => zoomBy(0.8))}
    <hr />
    {button('Import images to canvas…', async () => importLayers(await pickImageFiles(), menu.world ?? undefined))}
    {button('Add images to collection…', async () => {
      for (const ingredient of await addIngredients(await pickImageFiles())) {
        insertIntoPrompt(`![${ingredient.index}]`)
      }
    })}
    {button('Snapshot the frame into collection', async () => {
      const ingredient = await captureCanvasSnapshot()
      insertIntoPrompt(`![${ingredient.index}]`)
    }, !projectStore.state.layers.some(item => item.visible))}
    <hr />
    {button('Undo · Ctrl+Z', undo, !projectStore.meta.state.canUndo)}
    {button('Redo · Ctrl+Shift+Z', redo, !projectStore.meta.state.canRedo)}
  </Menu>
}
