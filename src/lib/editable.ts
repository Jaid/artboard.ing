/** whether keys pressed at the target belong to it, like in a text field, a dropdown or the prompt */
export const editable = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || Boolean(target.closest('input, textarea, select, .monaco-editor')))
