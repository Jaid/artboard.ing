import type {GenerationRegion} from './generationRegion.ts'

import {useMemo} from 'react'

import {getGenerationRegion} from './generationRegion.ts'
import {editorStore, projectStore} from './state.ts'
import {useStore} from './store/index.ts'

/** the region `![0]` shows right now: the frame, or all artwork while the frame is off; stable while nothing it depends on changes */
export const useGenerationRegion = (): GenerationRegion => {
  const layers = useStore(projectStore, state => state.layers)
  const frame = useStore(editorStore, state => state.frame)
  const frameEnabled = useStore(editorStore, state => state.frameEnabled)
  const modelId = useStore(editorStore, state => state.modelId)
  const ratio = useStore(editorStore, state => state.ratio)
  return useMemo(() => getGenerationRegion({
    frame,
    frameEnabled,
    modelId,
    ratio,
  }, layers), [frame, frameEnabled, modelId, ratio, layers])
}
