import type {Point} from './geometry.ts'

import {setPrompt} from './actions.ts'
import {editorStore} from './state.ts'

/** receives text and, for drops, the client point it should land at instead of the cursor */
type Inserter = (text: string, client?: Point) => void

let inserter: Inserter | undefined

/** lets the mounted prompt editor receive insertions at its cursor */
export const registerPromptInserter = (callback: Inserter | undefined) => {
  inserter = callback
}

/** characters an inserted reference may directly follow */
const openingCharacters = /^[([{‘“]/u
/** characters that may directly follow an inserted reference; an opening parenthesis is left out, because it would turn the text after it into the reference’s description */
const closingCharacters = /^[!"'),.:;?\]}’”…]/u

/**
 * The text with the spaces that keep it apart from the text around the insertion point, so a reference dropped in the middle of a sentence leaves the words intact.
 *
 * @param before the character right before the insertion point, empty at the start of a line
 * @param after the characters right after the insertion point, empty at the end of a line
 */
export const padInsertion = (text: string, before: string, after: string) => {
  const leading = before && !/\s/u.test(before) && !openingCharacters.test(before) ? ' ' : ''
  // “![” starts another reference, which keeps its distance like a word.
  const trailing = after && !/^\s/u.test(after) && (!closingCharacters.test(after) || after.startsWith('![')) ? ' ' : ''
  return `${leading}${text}${trailing}`
}

/** Inserts text at the editor cursor (or the given client point), or appends it when the editor is not mounted yet. */
export const insertIntoPrompt = (text: string, client?: Point) => {
  if (inserter) {
    inserter(text, client)
    return
  }
  const {prompt} = editorStore.state
  const separator = prompt && !/\s$/.test(prompt) ? ' ' : ''
  setPrompt(`${prompt}${separator}${text}`)
}
