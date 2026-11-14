/** a fixed instruction applied to a single collection image, independent of the prompt input */
export type TransformPreset = {
  id: string
  /** sent as is, with the collection image as the only input image */
  prompt: string
  /** short label for menus and the names of results */
  title: string
}

export const transformPresets: ReadonlyArray<TransformPreset> = [
  {
    id: 'extract-subject',
    title: 'Extract subject',
    prompt: 'Extract the subject of this image in high quality on a neutral background',
  },
]

export const findTransformPreset = (id: string) => transformPresets.find(preset => preset.id === id)
