import type {RatioString} from '../ratio.ts'

import {minimatch} from 'minimatch'

/**
 * aspect ratios that models behind ai_endpoint verifiably honor, keyed by minimatch patterns of the model ID
 *
 * They replace the catalog ratios while ai_endpoint is set, because CLIProxyAPI silently answers some catalog ratios with a square.
 */
export const endpointRatios: ReadonlyArray<{
  pattern: string
  ratios: ReadonlyArray<RatioString>
}> = [
  {
    // checked against CLIProxyAPI on 2026-10-25; 9:19.5, 19.5:9, 1:2 and 2:1 came back as 1024×1024
    pattern: '{,*/}grok-imagine-image-2.0',
    ratios: ['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '9:20', '20:9'],
  },
]

export const findEndpointRatios = (modelId: string) => endpointRatios.find(entry => minimatch(modelId, entry.pattern))?.ratios
