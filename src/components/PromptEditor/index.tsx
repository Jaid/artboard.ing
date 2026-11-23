import type {Ingredient} from '#src/lib/state.ts'
import type {MonacoApi, MonacoOptions} from 'monacozen'

import Monacozen from 'monacozen'
import {useEffect, useRef, useState} from 'react'

import {setPrompt} from '#src/lib/actions.ts'
import {getDroppedReference, isIngredientDrag, isReferenceDrag} from '#src/lib/collectionDrag.ts'
import {generate} from '#src/lib/generation.ts'
import {findReferences} from '#src/lib/prompt.ts'
import {insertIntoPrompt, padInsertion, registerPromptInserter} from '#src/lib/promptEditor.ts'
import {editorStore, projectStore} from '#src/lib/state.ts'
import {useStore} from '#src/lib/store/index.ts'
import {useDarkMode} from '#src/lib/useDarkMode.ts'

import css from './style.module.sass'

type StandaloneEditor = ReturnType<MonacoApi['editor']['create']>
type DecorationsCollection = ReturnType<StandaloneEditor['createDecorationsCollection']>

const options: MonacoOptions = {
  padding: {
    top: 14,
    bottom: 14,
  },
  fontSize: 14,
  lineHeight: 21,
  scrollBeyondLastLine: false,
  quickSuggestions: false,
  wordBasedSuggestions: 'off',
  suggestOnTriggerCharacters: true,
  unicodeHighlight: {
    ambiguousCharacters: false,
    invisibleCharacters: false,
  },
  renderWhitespace: 'none',
  fixedOverflowWidgets: true,
  hover: {delay: 200},
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  scrollbar: {
    vertical: 'auto',
    horizontal: 'hidden',
    verticalScrollbarSize: 8,
    useShadows: false,
  },
}
let overflowWidgetsDomNode: HTMLDivElement | undefined
/** The panel’s backdrop-filter makes it the containing block of fixed elements, which would clip hovers and suggestions to the left column, so they live in the body instead. */
const getOverflowWidgetsDomNode = () => {
  if (!overflowWidgetsDomNode) {
    overflowWidgetsDomNode = document.createElement('div')
    overflowWidgetsDomNode.className = `monaco-editor ${css.overflowWidgets}`
    document.body.append(overflowWidgetsDomNode)
  }
  return overflowWidgetsDomNode
}
type TextPosition = {
  column: number
  lineNumber: number
}
/** Inserts text at the position (or over the selection), kept apart from the words around it. The cursor ends up right after the insertion. */
const insertAt = (editor: StandaloneEditor, monaco: MonacoApi, text: string, position?: TextPosition) => {
  const model = editor.getModel()
  const selection = position ? new monaco.Selection(position.lineNumber, position.column, position.lineNumber, position.column) : editor.getSelection()
  if (!selection || !model) {
    return
  }
  const before = model.getValueInRange({
    startLineNumber: selection.startLineNumber,
    startColumn: Math.max(1, selection.startColumn - 1),
    endLineNumber: selection.startLineNumber,
    endColumn: selection.startColumn,
  })
  const after = model.getValueInRange({
    startLineNumber: selection.endLineNumber,
    startColumn: selection.endColumn,
    endLineNumber: selection.endLineNumber,
    endColumn: Math.min(model.getLineMaxColumn(selection.endLineNumber), selection.endColumn + 2),
  })
  editor.executeEdits('artboarding', [{
    range: selection,
    text: padInsertion(text, before, after),
    forceMoveMarkers: true,
  }], ([inserted]) => [new monaco.Selection(inserted.range.endLineNumber, inserted.range.endColumn, inserted.range.endLineNumber, inserted.range.endColumn)])
  editor.focus()
}
const getIngredients = () => projectStore.state.ingredients
const findIngredient = (index: number): Ingredient | undefined => getIngredients().find(ingredient => ingredient.index === index)
let providersRegistered = false
/** Completion and hover providers are global per language, so they are registered once and read the live store. */
const registerProviders = (monaco: MonacoApi) => {
  if (providersRegistered) {
    return
  }
  providersRegistered = true
  monaco.languages.registerCompletionItemProvider('markdown', {
    triggerCharacters: ['['],
    provideCompletionItems: (model, position) => {
      const before = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })
      const match = /!\[\d*$/.exec(before)
      if (!match) {
        return {suggestions: []}
      }
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: position.column - match[0].length,
        endColumn: position.column,
      }
      const canvas = {
        label: '![0]',
        kind: monaco.languages.CompletionItemKind.Reference,
        detail: 'canvas content inside the frame',
        insertText: '![0]',
        range,
        sortText: '0',
      }
      const ingredients = getIngredients().map(ingredient => ({
        label: `![${ingredient.index}]`,
        kind: monaco.languages.CompletionItemKind.File,
        detail: ingredient.name,
        documentation: {
          value: `![${ingredient.name}](${ingredient.thumbnail})`,
          supportHtml: false,
        },
        insertText: `![${ingredient.index}]`,
        range,
        sortText: String(ingredient.index).padStart(4, '0'),
      }))
      return {suggestions: [canvas, ...ingredients]}
    },
  })
  monaco.languages.registerHoverProvider('markdown', {
    provideHover: (model, position) => {
      const line = model.getLineContent(position.lineNumber)
      const reference = findReferences(line).find(token => position.column - 1 >= token.start && position.column - 1 <= token.end)
      if (!reference) {
        return
      }
      const range = new monaco.Range(position.lineNumber, reference.start + 1, position.lineNumber, reference.end + 1)
      const described = reference.description ? [{value: `described as “${reference.description}”`}] : []
      if (reference.index === 0) {
        return {
          range,
          contents: [{value: '**canvas** – everything inside the frame'}, ...described],
        }
      }
      const ingredient = findIngredient(reference.index)
      if (!ingredient) {
        return {
          range,
          contents: [{value: `**![${reference.index}]** does not exist – drop an image onto the editor to add it`}],
        }
      }
      return {
        range,
        contents: [{value: `**${ingredient.name}**`}, ...described, {value: `![${ingredient.name}](${ingredient.thumbnail})`}],
      }
    },
  })
}
const PromptEditor = () => {
  const dark = useDarkMode()
  const prompt = useStore(editorStore, state => state.prompt)
  const ingredients = useStore(projectStore, state => state.ingredients)
  const hoveredIndex = useStore(editorStore, state => state.hoveredCollectionIndex)
  const editorRef = useRef<StandaloneEditor | null>(null)
  const decorationsRef = useRef<DecorationsCollection | null>(null)
  const dropTargetRef = useRef<DecorationsCollection | null>(null)
  const monacoRef = useRef<MonacoApi | null>(null)
  const cleanupRef = useRef<(() => void) | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  const [monacoOptions] = useState<MonacoOptions>(() => ({
    ...options,
    overflowWidgetsDomNode: getOverflowWidgetsDomNode(),
  }))
  // Collection tiles, the frame view included, drop as references at the pointer, which a caret marks while dragging. Capturing keeps Monaco’s own text drop and the file dropzone out of it.
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    /** where and in which color the caret is shown, so an unchanged caret is not redecorated on every dragover */
    let shown = ''
    /** where the caret stands, which is where a drop lands */
    let shownPosition: TextPosition | undefined
    const hide = () => {
      shown = ''
      shownPosition = undefined
      dropTargetRef.current?.clear()
    }
    const show = (event: DragEvent) => {
      const editor = editorRef.current
      const monaco = monacoRef.current
      const position = editor?.getTargetAtClientPoint(event.clientX, event.clientY)?.position
      if (!editor || !monaco || !position) {
        hide()
        return
      }
      const className = isIngredientDrag(event.dataTransfer) ? css.dropTarget : `${css.dropTarget} ${css.canvasDropTarget}`
      const key = `${position.lineNumber}:${position.column}:${className}`
      if (key === shown) {
        return
      }
      shown = key
      shownPosition = {
        lineNumber: position.lineNumber,
        column: position.column,
      }
      dropTargetRef.current?.set([{
        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        options: {className},
      }])
      // Near the top or bottom edge, revealing the line scrolls the prompt along.
      editor.revealPosition(position, monaco.editor.ScrollType.Immediate)
    }
    const over = (event: DragEvent) => {
      if (!isReferenceDrag(event.dataTransfer)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer!.dropEffect = 'copy'
      show(event)
    }
    const leave = (event: DragEvent) => {
      const bounds = container.getBoundingClientRect()
      const towardInside = event.relatedTarget instanceof Node ? container.contains(event.relatedTarget) : event.clientX > bounds.left && event.clientX < bounds.right && event.clientY > bounds.top && event.clientY < bounds.bottom
      if (!towardInside) {
        hide()
      }
    }
    const drop = (event: DragEvent) => {
      if (!isReferenceDrag(event.dataTransfer)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const editor = editorRef.current
      const monaco = monacoRef.current
      // The reference lands exactly where the caret stood, not wherever the lines happen to be measured once the caret is gone.
      const position = shownPosition ?? editor?.getTargetAtClientPoint(event.clientX, event.clientY)?.position ?? undefined
      hide()
      const reference = getDroppedReference(event.dataTransfer)
      if (!reference) {
        return
      }
      if (editor && monaco) {
        insertAt(editor, monaco, reference, position)
      } else {
        insertIntoPrompt(reference)
      }
    }
    container.addEventListener('dragenter', over, true)
    container.addEventListener('dragover', over, true)
    container.addEventListener('dragleave', leave, true)
    container.addEventListener('drop', drop, true)
    // A drag that is canceled or dropped elsewhere ends without a drop here.
    addEventListener('dragend', hide)
    return () => {
      container.removeEventListener('dragenter', over, true)
      container.removeEventListener('dragover', over, true)
      container.removeEventListener('dragleave', leave, true)
      container.removeEventListener('drop', drop, true)
      removeEventListener('dragend', hide)
    }
  }, [])
  const updateDecorations = () => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    const model = editor?.getModel()
    if (!editor || !monaco || !model || !decorationsRef.current) {
      return
    }
    const available = new Set(getIngredients().map(ingredient => ingredient.index))
    const hovered = editorStore.state.hoveredCollectionIndex
    const range = (from: number, to: number) => {
      const start = model.getPositionAt(from)
      const end = model.getPositionAt(to)
      return new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column)
    }
    const decorations = findReferences(model.getValue()).flatMap(reference => {
      const className = reference.index === 0 ? css.canvasReference : (available.has(reference.index) ? css.reference : css.missingReference)
      // References to the hovered collection tile light up.
      const token = {
        range: range(reference.start, reference.referenceEnd),
        options: {inlineClassName: reference.index === hovered ? `${className} ${css.hoveredReference}` : className},
      }
      if (reference.end === reference.referenceEnd) {
        return token
      }
      return [token, {
        range: range(reference.referenceEnd, reference.end),
        options: {inlineClassName: css.referenceDescription},
      }]
    })
    decorationsRef.current.set(decorations)
  }
  useEffect(updateDecorations, [ingredients, prompt, hoveredIndex])
  useEffect(() => () => {
    registerPromptInserter(undefined)
    cleanupRef.current?.()
  }, [])
  const handleMount = (editor: StandaloneEditor, monaco: MonacoApi) => {
    editorRef.current = editor
    // Keep Monaco authoritative during typing; synchronize only external state changes.
    editor.setValue(editorStore.state.prompt)
    const content = editor.onDidChangeModelContent(() => setPrompt(editor.getValue()))
    const unsubscribe = editorStore.subscribe(() => {
      const value = editorStore.state.prompt
      if (editor.getValue() !== value) {
        editor.setValue(value)
        updateDecorations()
      }
    })
    cleanupRef.current = () => {
      content.dispose()
      unsubscribe()
    }
    monacoRef.current = monaco
    decorationsRef.current = editor.createDecorationsCollection()
    dropTargetRef.current = editor.createDecorationsCollection()
    registerProviders(monaco)
    editor.addAction({
      id: 'artboarding.generate',
      label: 'Generate',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => {
        void generate()
      },
    })
    registerPromptInserter((text, client) => insertAt(editor, monaco, text, client ? editor.getTargetAtClientPoint(client.x, client.y)?.position ?? undefined : undefined))
    updateDecorations()
  }
  return <div className={css.container} data-testid='prompt-editor' ref={containerRef}>
    <Monacozen
      aria-label='Prompt'
      dark={dark}
      language='markdown'
      monaco={monacoOptions}
      placeholder='Describe what should happen inside the frame…'
      onMount={handleMount}
    />
  </div>
}

export default PromptEditor
