/**
 * Diagnostic script for ZK compression state trees.
 * Run: pnpm exec tsx packages/shipment/scripts/diagnose-zk.ts
 * Or: NUXT_PUBLIC_HELIUS_RPC="https://mainnet.helius-rpc.com/?api-key=YOUR_KEY" pnpm exec tsx packages/shipment/scripts/diagnose-zk.ts
 *
 * Reads RPC URL from env NUXT_PUBLIC_HELIUS_RPC or first arg.
 */

import { Connection, PublicKey } from '@solana/web3.js'
import {
  createRpc,
  getAllStateTreeInfos,
  defaultStateTreeLookupTables,
  selectStateTreeInfo,
  TreeType,
} from '@lightprotocol/stateless.js'

const RPC_URL =
  process.env.NUXT_PUBLIC_HELIUS_RPC ||
  process.argv[2] ||
  'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY'

async function main() {
  console.log('RPC URL:', RPC_URL.replace(/api-key=[^&]+/, 'api-key=***'))
  const connection = new Connection(RPC_URL, 'confirmed')

  const lutPairs = defaultStateTreeLookupTables()
  console.log('\nState tree LUT pairs:')
  for (const [net, pairs] of Object.entries(lutPairs)) {
    console.log(`  ${net}:`, pairs.length, 'pair(s)')
    for (const p of pairs) {
      console.log(`    stateTree: ${p.stateTreeLookupTable.toBase58()}`)
      console.log(`    nullify:  ${p.nullifyLookupTable.toBase58()}`)
    }
  }

  console.log('\n--- Fetching raw Address Lookup tables ---')
  const mainnetPair = lutPairs.mainnet[0]
  if (!mainnetPair) {
    console.error('No mainnet LUT pair')
    process.exit(1)
  }

  try {
    const stateLut = await connection.getAddressLookupTable(
      mainnetPair.stateTreeLookupTable
    )
    const nullifyLut = await connection.getAddressLookupTable(
      mainnetPair.nullifyLookupTable
    )

    console.log('State tree LUT found:', !!stateLut.value)
    if (stateLut.value) {
      const addrs = stateLut.value.state.addresses
      console.log('  Address count:', addrs.length, '(must be % 3 === 0)')
      const prefixes = addrs.slice(0, 12).map((a) => a.toBase58().slice(0, 4))
      console.log('  First 12 address prefixes:', prefixes.join(', '))
      const typeCounts: Record<string, number> = {}
      for (const a of addrs) {
        const p = a.toBase58()
        const t = p.startsWith('bmt')
          ? 'StateV2'
          : p.startsWith('amt2')
            ? 'AddressV2'
            : p.startsWith('amt')
              ? 'AddressV1'
              : 'StateV1'
        typeCounts[t] = (typeCounts[t] || 0) + 1
      }
      console.log('  Tree types in LUT:', typeCounts)
    } else {
      console.log('  Error: State tree lookup table not found')
    }

    console.log('Nullify LUT found:', !!nullifyLut.value)
    if (nullifyLut.value) {
      const addrs = nullifyLut.value.state.addresses
      console.log('  Address count:', addrs.length)
    }
  } catch (e) {
    console.error('Error fetching LUTs:', e)
  }

  console.log('\n--- getAllStateTreeInfos (using Connection) ---')
  try {
    const infos = await getAllStateTreeInfos({
      connection,
      stateTreeLUTPairs: lutPairs.mainnet,
    })
    console.log('TreeInfo count:', infos.length)
    const active = infos.filter((i) => !i.nextTreeInfo)
    const stateV2 = active.filter((i) => i.treeType === TreeType.StateV2)
    console.log('  Active (no nextTreeInfo):', active.length)
    console.log('  StateV2 active:', stateV2.length)
    if (infos.length > 0) {
      console.log('  Sample tree:', infos[0].tree.toBase58().slice(0, 8) + '...')
      console.log('  Sample treeType:', infos[0].treeType)
    }
  } catch (e) {
    console.error('getAllStateTreeInfos error:', e)
  }

  console.log('\n--- getAllStateTreeInfos (using createRpc) ---')
  try {
    const rpc = createRpc(RPC_URL, RPC_URL, undefined, {
      commitment: 'confirmed',
    })
    const infos = await getAllStateTreeInfos({
      connection: rpc,
      stateTreeLUTPairs: lutPairs.mainnet,
    })
    console.log('TreeInfo count:', infos.length)
    const active = infos.filter((i) => !i.nextTreeInfo)
    const stateV2 = active.filter((i) => i.treeType === TreeType.StateV2)
    console.log('  Active (no nextTreeInfo):', active.length)
    console.log('  StateV2 active:', stateV2.length)
  } catch (e) {
    console.error('getAllStateTreeInfos (rpc) error:', e)
  }

  console.log('\n--- selectStateTreeInfo (default StateV2) ---')
  try {
    const infos = await getAllStateTreeInfos({
      connection,
      stateTreeLUTPairs: lutPairs.mainnet,
    })
    const selected = selectStateTreeInfo(infos)
    console.log('Selected:', selected.tree.toBase58().slice(0, 12) + '...')
  } catch (e) {
    console.error('selectStateTreeInfo error:', e)
  }

  console.log('\n--- selectStateTreeInfo with TreeType.StateV1 ---')
  try {
    const infos = await getAllStateTreeInfos({
      connection,
      stateTreeLUTPairs: lutPairs.mainnet,
    })
    const selected = selectStateTreeInfo(infos, TreeType.StateV1)
    console.log('Selected (StateV1):', selected.tree.toBase58().slice(0, 12) + '...')
  } catch (e) {
    console.error('selectStateTreeInfo StateV1 error:', e)
  }

  // Check if tx LUT 9NYFyEqPkyXUhkerbGHXUXkvb4qpzeEdHuGpgbgpH1NJ has bmt addresses
  console.log('\n--- Tx LUT 9NYFyEqPkyXUhkerbGHXUXkvb4qpzeEdHuGpgbgpH1NJ ---')
  try {
    const txLut = await connection.getAddressLookupTable(
      new PublicKey('9NYFyEqPkyXUhkerbGHXUXkvb4qpzeEdHuGpgbgpH1NJ')
    )
    if (txLut.value) {
      const addrs = txLut.value.state.addresses
      const prefixes = addrs.slice(0, 20).map((a) => a.toBase58().slice(0, 4))
      console.log('First 20 prefixes:', prefixes.join(', '))
      const bmtCount = addrs.filter((a) => a.toBase58().startsWith('bmt')).length
      console.log('bmt* count:', bmtCount)
    } else {
      console.log('Tx LUT not found')
    }
  } catch (e) {
    console.error('Tx LUT error:', e)
  }
}

main().catch(console.error)
