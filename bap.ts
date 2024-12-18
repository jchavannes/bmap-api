// {
//       "rootAddress": "13ZNtS7f3Yb5QiYsJgNpXq7S994hcPLaKv",
//       "currentAddress": "1HjTer9VgkfeNaFibPB8EWUGJLEg8yAHfY",
//       "addresses": [
//           {
//               "address": "1HjTer9VgkfeNaFibPB8EWUGJLEg8yAHfY",
//               "txId": "f39575e7ac17f8590f42aa2d9f17b743d816985e85632303281fe7c84c3186b3"
//           }
//       ],
//       "identity": "{\"@context\":\"https://schema.org\",\"@type\":\"Person\",\"alternateName\":\"WildSatchmo\",\"logo\":\"bitfs://a53276421d2063a330ebbf003ab5b8d453d81781c6c8440e2df83368862082c5.out.1.1\",\"image\":\"\",\"homeLocation\":{\"@type\":\"Place\",\"name\":\"Bitcoin\"},\"url\":\"https://tonicpow.com\",\"paymail\":\"satchmo@moneybutton.com\"}",
//       "identityTxId": "e7becb2968a6afe0f690cbe345fba94b8e4a7da6a014a5d52b080a7d6913c281",
//       "idKey": "Go8vCHAa4S6AhXKTABGpANiz35J",
//       "block": 594320,
//       "timestamp": 1699391776,
//       "valid": false
//   }

import type { BmapTx } from 'bmapjs/types/common'
import _ from 'lodash'
import { normalize } from './bmap.js'
import { type CacheSigner, readFromRedis, saveToRedis } from './cache.js'
const { uniq, uniqBy } = _

export type BapIdentity = {
  rootAddress: string
  currentAddress: string
  addresses: {
    address: string
    txId: string
  }[]
  identity: string
  identityTxId: string
  idKey: string
  block: number
  timestamp: number
  valid: boolean
}

const bapApiUrl = "https://api.sigmaidentity.com/v1/"

type Payload = {
  address: string
  block?: number
  timestamp?: number
}

export const getBAPIdByAddress = async (
  address: string,
  block?: number,
  timestamp?: number
): Promise<BapIdentity | undefined> => {
  try {
    const payload: Payload = {
      address,
    }
    if (block) {
      payload.block = block
    }
    if (timestamp) {
      payload.timestamp = timestamp
    }
    console.log('payload', payload)
    const result = await fetch(`${bapApiUrl}identity/validByAddress`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const data = await result.json()
    console.log('identity data', { data })
    if (data && data.status === 'OK' && data.result) {
      try {
        // already parsed now
        // if (data.result.identity) {
        //   data.result.identity = data.result.identity
        // }
        return data.result
      } catch (e) {
        console.log('Failed to parse BAP identity', e, data.result)
      }
    }
    return undefined
  } catch (e) {
    console.log(e)
    throw e
  }
}

// This function takes an array of transactions and resolves their signers from AIP and SIGMA
export const resolveSigners = async (txs: BmapTx[]) => {
  // Helper function to resolve a signer from cache or fetch if not present
  const resolveSigner = async (
    address: string
  ): Promise<BapIdentity | undefined> => {
    const cacheKey = `signer-${address}`
    let cacheValue = await readFromRedis(cacheKey)
    let identity = {}
    if (
      !cacheValue ||
      (cacheValue && 'error' in cacheValue && cacheValue.error === 404)
    ) {
      // If not found in cache, look it up and save
      try {
        identity = await getBAPIdByAddress(address)
        if (identity) {
          cacheValue = { type: 'signer', value: identity } as CacheSigner
          await saveToRedis(cacheKey, cacheValue)
          console.log('BAP saved to cache:', identity)
        } else {
          console.log('No BAP found for address:', address)
        }
      } catch (e) {
        console.log('Failed to get BAP ID by Address:', e)
      }
    } else {
      console.log('BAP already in cache for address:', address)
    }
    return cacheValue ? (cacheValue.value as BapIdentity | undefined) : null
  }

  // Function to process signers for a single transaction
  const processSigners = async (tx: BmapTx) => {
    const signerAddresses = [...(tx.AIP || []), ...(tx.SIGMA || [])].map(
      (signer) => signer.address
    )
    const uniqueAddresses = uniq(signerAddresses.filter((a) => !!a))
    const signerPromises = uniqueAddresses.map((address) =>
      resolveSigner(address)
    )
    const resolvedSigners = await Promise.all(signerPromises)
    return resolvedSigners.filter((signer) => signer !== null)
  }

  // Process all transactions and flatten the list of signers

  const signerLists = await Promise.all(
    txs
      .filter((t) => !!t.AIP || !!t.SIGMA)
      .sort((a, b) => (a.blk?.t > b.blk?.t ? -1 : 1))
      .map((tx) => processSigners(normalize(tx)))
  )
  return uniqBy(signerLists.flat(), (b) => b.idKey)
}
