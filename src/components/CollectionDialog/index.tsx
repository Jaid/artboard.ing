import type {CollectionStep} from '#src/lib/collectionDialog.ts'
import type {Ingredient, IngredientEvidence} from '#src/lib/state.ts'
import type {CSSProperties, ReactNode} from 'react'

import {Check, Copy, X} from 'lucide-react'
import {useEffect, useRef, useState} from 'react'

import CollectionMenu from '#component/CollectionMenu'
import IconButton from '#component/IconButton'
import {CollectionNumber} from '#component/Ingredients'
import ModelIcon from '#component/ModelIcon'
import {describeUsage, getIngredientEvidence, kindTitles} from '#src/lib/collectionDetails.ts'
import {closeCollectionDialog, collectionDialogStore, stepCollectionDialog} from '#src/lib/collectionDialog.ts'
import {renderRegion} from '#src/lib/composite.ts'
import {editable} from '#src/lib/editable.ts'
import {getIngredientOrientation} from '#src/lib/ingredientOrientation.ts'
import {describeModel} from '#src/lib/models/index.ts'
import {flipTitles, rotationTitles} from '#src/lib/orientation.ts'
import {editorStore, projectStore} from '#src/lib/state.ts'
import {useStore} from '#src/lib/store/index.ts'
import {useAsset} from '#src/lib/useAsset.ts'
import {useGenerationRegion} from '#src/lib/useGenerationRegion.ts'

import css from './style.module.sass'

/** Left and right go through the tiles, up jumps to the frame view and down to the last item. */
const collectionSteps: Record<string, CollectionStep> = {
  ArrowLeft: 'previous',
  ArrowRight: 'next',
  ArrowUp: 'first',
  ArrowDown: 'last',
}
const mediaTypeTitles: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
}
/** pixels per CSS pixel the frame view renders at, so it stays crisp on high-density screens */
const maxDensity = 2
const byteUnits = ['b', 'kb', 'mb', 'gb']
const formatBytes = (bytes: number) => {
  let value = bytes
  let unit = 0
  while (value >= 999.95 && unit < byteUnits.length - 1) {
    value /= 1000
    unit++
  }
  return `${unit ? value.toFixed(1) : value} ${byteUnits[unit]}`
}
const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  return date.toLocaleString('sv', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}
const formatSize = (size: {
  height: number
  width: number
}) => `${Math.round(size.width)} × ${Math.round(size.height)}`

/** Details of a collection tile, opened by clicking it: the large picture, how it came to be and the same actions as its context menu. */
export default function CollectionDialog() {
  const dialog = useRef<HTMLDialogElement>(null)
  const index = useStore(collectionDialogStore, state => state.index)
  const ingredient = useStore(projectStore, state => (index ? state.ingredients.find(item => item.index === index) : undefined))
  // An item removed while its details are open leaves nothing to show.
  const open = index === 0 || Boolean(ingredient)
  useEffect(() => {
    if (index !== null && !open) {
      closeCollectionDialog()
    }
  }, [index, open])
  useEffect(() => {
    const element = dialog.current
    if (!element) {
      return
    }
    if (open && !element.open) {
      element.showModal()
      // The dialog itself takes the focus instead of its first dropdown; Tab leads on to the controls.
      element.focus()
    } else if (!open && element.open) {
      element.close()
    }
  }, [open])
  useEffect(() => {
    if (!open) {
      return
    }
    // Listens on the window, so the keys keep working when the focused control vanished with the previous tile.
    const step = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !Object.hasOwn(collectionSteps, event.key) || editable(event.target)) {
        return
      }
      event.preventDefault()
      stepCollectionDialog(collectionSteps[event.key])
    }
    addEventListener('keydown', step)
    return () => removeEventListener('keydown', step)
  }, [open])
  useEffect(() => {
    const element = dialog.current
    if (element?.open && !element.contains(document.activeElement)) {
      element.focus()
    }
  }, [index])
  return <dialog
    className={css.dialog} aria-label={ingredient ? `![${ingredient.index}] · ${ingredient.name}` : '![0] · live frame view'} data-testid='collection-dialog' tabIndex={-1} ref={dialog} onClick={event => {
      if (event.target === event.currentTarget) {
        closeCollectionDialog()
      }
    }} onClose={closeCollectionDialog}
  >
    {open && index !== null && <>
      {ingredient ? <IngredientDetails ingredient={ingredient} /> : <FrameDetails />}
      <IconButton className={css.close} aria-label='Close details' icon={X} size={18} title='Close · Esc' onClick={closeCollectionDialog} />
    </>}
  </dialog>
}

/** the picture as large as the dialog allows, keeping its aspect ratio */
function Picture({aspect, children}: {
  aspect: number
  children: ReactNode
}) {
  return <figure className={css.picture}><div className={css.pictureFrame} style={{'--aspect': aspect} as CSSProperties}>{children}</div></figure>
}
/** the column next to the picture: the details on top, the actions of the tile’s context menu below them */
function Side({children, index}: {
  children: ReactNode
  index: number
}) {
  return <div className={css.side}>
    <section className={css.details}>{children}</section>
    <div className={css.actions}><CollectionMenu aria-label={`Actions for ![${index}]`} index={index} onClose={closeCollectionDialog} /></div>
  </div>
}
function Title({index, kind, children}: {
  children: ReactNode
  index: number
  kind: string
}) {
  return <h2 className={css.title}><CollectionNumber index={index} kind={kind} /><span>{children}</span></h2>
}
function IngredientDetails({ingredient}: {ingredient: Ingredient}) {
  const asset = useAsset(ingredient.assetId)
  const layers = useStore(projectStore, state => state.layers)
  const evidence = getIngredientEvidence(ingredient, layers)
  const {rotation, flip} = getIngredientOrientation(ingredient)
  const source = asset?.url ?? ingredient.thumbnail
  const facts = [kindTitles[ingredient.kind], asset && `${formatSize(asset)} px`, asset && (mediaTypeTitles[asset.blob.type] ?? asset.blob.type), asset && formatBytes(asset.blob.size)].filter(Boolean)
  const orientation = [rotation && `Rotated ${rotationTitles[rotation]}`, flip !== 'none' && `flipped ${flipTitles[flip].toLowerCase()}`].filter(Boolean).join(', ')
  return <>
    <Picture aspect={asset ? asset.width / asset.height : 1}>
      {source ? <img alt={ingredient.name} data-testid='collection-dialog-image' draggable={false} src={source} /> : <span className={css.unavailable}>The image is not loaded.</span>}
    </Picture>
    <Side index={ingredient.index}>
      <Title index={ingredient.index} kind={ingredient.kind}>{ingredient.name}</Title>
      <p className={css.facts}>{facts.join(' · ')}<br />{describeUsage(layers, ingredient.assetId)}{orientation && <><br />{orientation}</>}</p>
      {evidence && <Capture evidence={evidence} />}
      {!evidence && ingredient.kind === 'generated' && <p className={css.note}>No request capture is stored for this image.</p>}
    </Side>
  </>
}
/** the prompt and the settings a generation was requested with */
function Capture({evidence}: {evidence: IngredientEvidence}) {
  const model = describeModel(evidence.modelId)
  const inputs = [...evidence.canvasAssetId ? [evidence.canvasAssetId] : [], ...evidence.referenceAssetIds]
  return <>
    <div className={css.section}>
      <h3 className={css.sectionTitle}>Prompt<CopyButton text={evidence.prompt} /></h3>
      <pre className={css.prompt} data-testid='collection-dialog-prompt'>{evidence.prompt}</pre>
      {evidence.compiledPrompt !== evidence.prompt && <details className={css.compiled}><summary>Sent to the model</summary><pre className={css.prompt}>{evidence.compiledPrompt}</pre></details>}
    </div>
    <div className={css.section}>
      <h3 className={css.sectionTitle}>Inference</h3>
      <dl className={css.list} data-testid='collection-dialog-inference'>
        <dt>Model</dt>
        <dd className={css.model} title={evidence.modelId}><ModelIcon icon={model.icon} size={13} />{model.title}</dd>
        <dt>Ratio</dt>
        <dd>{evidence.ratio}</dd>
        {evidence.resolution && <><dt>Resolution</dt><dd>{evidence.resolution}</dd></>}
        {evidence.quality && <><dt>Quality</dt><dd>{evidence.quality}</dd></>}
        {evidence.cost !== undefined && <><dt>Cost</dt><dd>$ {evidence.cost.toFixed(4)}</dd></>}
        {evidence.demo && <><dt>Mode</dt><dd>Procedural demo · not AI</dd></>}
        <dt>Requested</dt>
        <dd>{formatTime(evidence.capturedAt)}</dd>
        <dt>Input</dt>
        <dd>{inputs.length ? <span className={css.inputs}>{inputs.map((id, position) => <InputImage key={`${position}:${id}`} id={id} canvas={id === evidence.canvasAssetId} position={position + 1} />)}</span> : 'Prompt only'}</dd>
      </dl>
    </div>
  </>
}
/** an image the request was sent with, labeled like in the prompt the model received */
function InputImage({canvas, id, position}: {
  canvas: boolean
  id: string
  position: number
}) {
  const asset = useAsset(id)
  const ingredient = useStore(projectStore, state => state.ingredients.find(item => item.assetId === id || item.sourceAssetId === id))
  let origin = 'a collection image'
  if (canvas) {
    origin = 'the canvas inside the frame, ![0]'
  } else if (ingredient) {
    origin = `![${ingredient.index}] · ${ingredient.name}`
  }
  return <figure className={css.input} title={`image ${position}: ${origin}`}>
    {asset ? <img alt='' draggable={false} src={asset.url} /> : <span className={css.unavailable}>?</span>}
    <figcaption>{position}</figcaption>
  </figure>
}
function CopyButton({text}: {text: string}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) {
      return
    }
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])
  return <IconButton className={css.copy} icon={copied ? Check : Copy} size={13} title={copied ? 'Copied' : 'Copy the prompt'} onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied(true))} />
}
/** position 0: the live frame view, rendered as large as the dialog shows it */
function FrameDetails() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const layers = useStore(projectStore, state => state.layers)
  const frameEnabled = useStore(editorStore, state => state.frameEnabled)
  const {frame: region, ratio} = useGenerationRegion()
  useEffect(() => {
    const target = canvasRef.current
    if (!target) {
      return
    }
    let id = 0
    const draw = () => {
      cancelAnimationFrame(id)
      id = requestAnimationFrame(() => {
        if (!target.clientWidth || !target.clientHeight || !(region.width > 0 && region.height > 0)) {
          return
        }
        const density = Math.min(devicePixelRatio || 1, maxDensity)
        try {
          const {canvas} = renderRegion({
            layers,
            region,
            size: {
              width: Math.max(1, Math.round(target.clientWidth * density)),
              height: Math.max(1, Math.round(target.clientHeight * density)),
            },
            measureEmpty: false,
          })
          target.width = canvas.width
          target.height = canvas.height
          target.getContext('2d')?.drawImage(canvas, 0, 0)
        } catch {
          // Without a working 2D canvas the picture stays empty; the viewport reports rendering errors.
        }
      })
    }
    const observer = new ResizeObserver(draw)
    observer.observe(target)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(id)
    }
  }, [layers, region])
  const visible = layers.filter(layer => layer.visible).length
  return <>
    <Picture aspect={region.width / region.height}>
      <canvas aria-label='![0]' data-testid='collection-dialog-image' role='img' ref={canvasRef} />
    </Picture>
    <Side index={0}>
      <Title index={0} kind='canvas'>{frameEnabled ? 'Canvas inside the frame' : 'All canvas artwork'}</Title>
      <p className={css.facts}>Live view of the {frameEnabled ? 'canvas inside the frame' : 'generation area spanning all artwork'}<br />{formatSize(region)} canvas units · {ratio}<br />{visible} visible layer{visible === 1 ? '' : 's'}</p>
      <p className={css.note}>Generations send it as the first input image whenever it contains artwork. Drag its tile into the prompt to reference it explicitly.</p>
    </Side>
  </>
}
