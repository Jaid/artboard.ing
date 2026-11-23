import type {Flip, Orientation, Rotation} from '#src/lib/orientation.ts'
import type {Ingredient} from '#src/lib/state.ts'
import type {ComponentProps} from 'react'

import Menu, {MenuGroup, MenuItem, MenuRow} from '#component/Menu'
import {removeIngredient} from '#src/lib/actions.ts'
import {exportIngredient, openExportDialog} from '#src/lib/exporting.ts'
import {transformIngredient} from '#src/lib/generation.ts'
import {getIngredientOrientation, getSourceAssetId, orientationStore, setIngredientOrientation} from '#src/lib/ingredientOrientation.ts'
import {getModel} from '#src/lib/models/index.ts'
import {getErrorMessage, notify} from '#src/lib/notices.ts'
import {flips, flipTitles, rotations, rotationTitles} from '#src/lib/orientation.ts'
import {editorStore, projectStore} from '#src/lib/state.ts'
import {useStore} from '#src/lib/store/index.ts'
import {transformPresets} from '#src/lib/transformPresets.ts'
import {useAsset} from '#src/lib/useAsset.ts'

type Props = Omit<ComponentProps<typeof Menu>, 'children'> & {
  /** collection number of the tile; 0 is the live frame view */
  index: number
}

/** The actions of a collection tile, shared by its context menu and its dialog. Nothing is shown for an entry that no longer exists. */
export default function CollectionMenu({index, ...props}: Props) {
  const ingredient = useStore(projectStore, state => (index ? state.ingredients.find(item => item.index === index) : undefined))
  const hasArtwork = useStore(projectStore, state => state.layers.some(item => item.visible))
  const frameEnabled = useStore(editorStore, state => state.frameEnabled)
  if (index && !ingredient) {
    return null
  }
  return <Menu {...props}>
    <strong>{ingredient ? `![${ingredient.index}] · ${ingredient.name}` : `![0] · ${frameEnabled ? 'canvas inside the frame' : 'all canvas artwork'}`}</strong>
    {ingredient ? <>
      <OrientationRows ingredient={ingredient} />
      <hr />
      <TransformItems ingredient={ingredient} />
      <hr />
      <MenuItem onSelect={() => exportIngredient(ingredient)}>Export</MenuItem>
      <MenuItem onSelect={() => removeIngredient(ingredient.id)}>Delete</MenuItem>
    </> : <MenuItem disabled={!hasArtwork} onSelect={() => openExportDialog()}>Export…</MenuItem>}
  </Menu>
}

/** Transform presets for a collection image. They ignore the prompt input and use the selected model, resolution, quality and ratio; each result becomes a new collection item. */
function TransformItems({ingredient}: {ingredient: Ingredient}) {
  const available = Boolean(useAsset(ingredient.assetId))
  const model = useStore(editorStore, state => getModel(state.modelId))
  const resolution = useStore(editorStore, state => state.resolution)
  const ratio = useStore(editorStore, state => state.ratio)
  const acceptsImages = model.maxReferences > 0
  const settings = [model.title, model.normalizeResolution(resolution), ratio].filter(Boolean).join(' · ')
  return <MenuGroup title='Transform'>
    {transformPresets.map(preset => <MenuItem key={preset.id} data-preset={preset.id} disabled={!available || !acceptsImages} title={acceptsImages ? `${preset.prompt}\n${settings}` : `${model.title} does not accept input images.`} onSelect={() => transformIngredient(ingredient.id, preset.id)}>{preset.title}</MenuItem>)}
  </MenuGroup>
}
/** Rotation and flip of a collection image. The menu stays open, so both can be set one after the other. */
function OrientationRows({ingredient}: {ingredient: Ingredient}) {
  const pending = useStore(orientationStore, state => state.pending.get(ingredient.id))
  const shown = pending ?? getIngredientOrientation(ingredient)
  const available = Boolean(useAsset(getSourceAssetId(ingredient)))
  const apply = async (patch: Partial<Orientation>) => {
    try {
      await setIngredientOrientation(ingredient.id, patch)
    } catch (error) {
      notify('error', getErrorMessage(error))
    }
  }
  return <>
    <MenuRow label='Rotation'>
      <select aria-busy={Boolean(pending)} aria-label='Rotation' data-testid='collection-rotation' disabled={!available} value={shown.rotation} onChange={event => void apply({rotation: Number(event.currentTarget.value) as Rotation})}>
        {rotations.map(rotation => <option key={rotation} value={rotation}>{rotationTitles[rotation]}</option>)}
      </select>
    </MenuRow>
    <MenuRow label='Flip'>
      <select aria-busy={Boolean(pending)} aria-label='Flip' data-testid='collection-flip' disabled={!available} value={shown.flip} onChange={event => void apply({flip: event.currentTarget.value as Flip})}>
        {flips.map(flip => <option key={flip} value={flip}>{flipTitles[flip]}</option>)}
      </select>
    </MenuRow>
  </>
}
