import QuickChart from 'quickchart-js'
import { TimeSeriesData } from './chart.js'
import { getCurrentBlockHeight } from './db.js'

// cache for express responses
type CacheValue =
  | { type: 'blockHeight'; value: number }
  | { type: 'chart'; value: QuickChart }
  | { type: 'count'; value: Record<string, number> }
  | { type: 'timeSeriesData'; value: TimeSeriesData }

const cache = new Map<string, CacheValue>()

// Shared utility function to get block height
async function getBlockHeightFromCache(): Promise<number> {
  let currentBlockHeight = cache.get('currentBlockHeight')?.value as number
  if (!currentBlockHeight) {
    currentBlockHeight = await getCurrentBlockHeight()
    cache.set('currentBlockHeight', {
      type: 'blockHeight',
      value: currentBlockHeight,
    })
  } else {
    console.info('Using cached block height')
  }
  return currentBlockHeight
}

export { cache, getBlockHeightFromCache }