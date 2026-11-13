import type {RatioString} from '../ratio.ts'

import {minimatch} from 'minimatch'

/**
 * aspect ratios that models behind ai_endpoint are documented or tested to honor, keyed by minimatch patterns of the model ID
 *
 * They replace the catalog ratios while ai_endpoint is set, because CLIProxyAPI silently answers some catalog ratios with a square.
 */
export const endpointRatios: ReadonlyArray<{
  pattern: string
  ratios: ReadonlyArray<RatioString>
}> = [
  {
    // Tested through CLIProxyAPI on 2026-11-13 at 1K: 13 ratios returned images; 16:9 hit quota. 1:8 and 8:1 differ by ~4%.
    pattern: '{,*/}gemini-3.1-flash-image',
    ratios: ['1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9'],
  },
  {
    // Supported ratios documented for GPT Image 2.6 Sunburst; CLIProxyAPI behavior has not been tested.
    pattern: '{,*/}gpt-image-2.6-sunburst',
    ratios: ['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '4:5', '5:4', '1:2', '2:1', '9:21', '21:9', '1:3', '3:1'],
  },
  {
    // Rechecked on 2026-11-13 against CLIProxyAPI: these nine ratios match exactly; 9:19.5, 19.5:9, 1:2 and 2:1 return 1024×1024.
    pattern: '{,*/}grok-imagine-image-2.0',
    ratios: ['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '9:20', '20:9'],
  },
]

export const findEndpointRatios = (modelId: string) => endpointRatios.find(entry => minimatch(modelId, entry.pattern))?.ratios
