import {minimatch} from 'minimatch'

export type PromptPart<Image> = {
  image: Image
  type: 'image'
} | {
  text: string
  type: 'text'
}
export type PromptPartsFactory = <Image>(text: string, images: ReadonlyArray<Image>) => Array<PromptPart<Image>>

/** minimatch patterns of endpoint model IDs that accept text and images interleaved in any order */
export const interleavedModelPatterns: ReadonlyArray<string> = ['gemini-*', '*/gemini-*']

/** all text first, then all images */
export const createSequentialPromptParts: PromptPartsFactory = (text, images) => [
  {
    type: 'text',
    text,
  },
  ...images.map(image => ({
    type: 'image' as const,
    image,
  })),
]

/** Puts the nth image right after the first “[image n]” of the text and the images without such a label at its end. */
export const createInterleavedPromptParts: PromptPartsFactory = <Image>(text: string, images: ReadonlyArray<Image>) => {
  const placed = new Set<number>
  const parts: Array<PromptPart<Image>> = []
  let position = 0
  for (const match of text.matchAll(/\[image (?<number>\d+)\]/gu)) {
    const index = Number(match.groups!.number) - 1
    if (index >= images.length || placed.has(index)) {
      continue
    }
    placed.add(index)
    const end = match.index + match[0].length
    parts.push({
      type: 'text',
      text: text.slice(position, end),
    }, {
      type: 'image',
      image: images[index],
    })
    position = end
  }
  if (position < text.length || !parts.length) {
    parts.push({
      type: 'text',
      text: text.slice(position),
    })
  }
  for (const [index, image] of images.entries()) {
    if (!placed.has(index)) {
      parts.push({
        type: 'image',
        image,
      })
    }
  }
  return parts
}

export const getPromptPartsFactory = (modelId: string): PromptPartsFactory => (interleavedModelPatterns.some(pattern => minimatch(modelId, pattern)) ? createInterleavedPromptParts : createSequentialPromptParts)
