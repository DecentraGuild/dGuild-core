/**
 * Diagnose validity proof for one compressed token leaf (same path as tenant claim).
 *
 * Loads NUXT_PUBLIC_HELIUS_RPC / HELIUS_RPC from `.env` in cwd, `apps/tenant/.env`, or `apps/tenant/.env.local`
 * if not set in the shell (so `pnpm exec tsx ...` works without exporting the URL).
 *
 * List leaves:
 *   pnpm exec tsx packages/shipment/scripts/diagnose-decompress-leaf.ts <owner> <mint>
 *
 * Diagnose one leaf (hash = "Claim id" on the shipment card, or from list output):
 *   pnpm exec tsx packages/shipment/scripts/diagnose-decompress-leaf.ts <owner> <mint> <leafHashDecimal>
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { PublicKey } from '@solana/web3.js'
import {
  createRpc,
  bn,
  TreeType,
  DerivationMode,
} from '@lightprotocol/stateless.js'
import type { CompressedAccount } from '@lightprotocol/stateless.js'
import { selectAccountsByPreferredTreeType } from '@lightprotocol/compressed-token'

function maskUrl(u: string) {
  return u.replace(/api-key=[^&]+/i, 'api-key=***')
}

function readHeliusRpcFromEnvFiles(): string {
  const keys = ['NUXT_PUBLIC_HELIUS_RPC', 'HELIUS_RPC', 'PUBLIC_HELIUS_RPC'] as const
  const roots = new Set<string>()
  let dir = process.cwd()
  for (let i = 0; i < 8; i++) {
    roots.add(dir)
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  const files: string[] = []
  for (const r of roots) {
    files.push(
      resolve(r, '.env'),
      resolve(r, 'apps/tenant/.env'),
      resolve(r, 'apps/tenant/.env.local'),
    )
  }
  const seenPath = new Set<string>()
  for (const file of files) {
    if (seenPath.has(file)) continue
    seenPath.add(file)
    if (!existsSync(file)) continue
    let raw: string
    try {
      raw = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const lines = raw.split(/\r?\n/)
    for (const key of keys) {
      const line = lines.find(
        (l) => {
          const t = l.trim()
          return t.startsWith(`${key}=`) && !t.startsWith('#')
        },
      )
      if (!line) continue
      const eq = line.indexOf('=')
      const v = line
        .slice(eq + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '')
      if (v.length > 0) return v
    }
  }
  return ''
}

function parseArgs() {
  const args = process.argv.slice(2).filter(Boolean)
  let rpcUrl =
    process.env.NUXT_PUBLIC_HELIUS_RPC?.trim() ||
    process.env.HELIUS_RPC?.trim() ||
    readHeliusRpcFromEnvFiles()
  let i = 0
  if (args[0]?.startsWith('http')) {
    rpcUrl = args[0]!
    i = 1
  }
  return {
    rpcUrl,
    owner: args[i],
    mint: args[i + 1],
    leafHash: args[i + 2],
  }
}

async function fetchValidityProofLikeProduction(
  rpc: ReturnType<typeof createRpc>,
  inputAccounts: Array<{ compressedAccount: CompressedAccount }>
) {
  const v1Only = inputAccounts.every(
    (a) => a.compressedAccount.treeInfo.treeType === TreeType.StateV1
  )
  if (v1Only) {
    return rpc.getValidityProofV0(
      inputAccounts.map((account) => ({
        hash: account.compressedAccount.hash,
        tree: account.compressedAccount.treeInfo.tree,
        queue: account.compressedAccount.treeInfo.queue,
      })),
      []
    )
  }
  const contexts = inputAccounts.map((a) => a.compressedAccount)
  try {
    return await rpc.getValidityProofV2(contexts, [], DerivationMode.standard)
  } catch (e) {
    console.warn('getValidityProofV2(standard) failed, trying compressible:', e)
    return rpc.getValidityProofV2(contexts, [], DerivationMode.compressible)
  }
}

async function listLeaves(
  rpc: ReturnType<typeof createRpc>,
  owner: PublicKey,
  mintPk: PublicKey
) {
  const res = await rpc.getCompressedTokenAccountsByOwner(owner, { mint: mintPk })
  const items = (res.items ?? []).filter((a) =>
    bn(a.parsed.amount.toString()).gt(bn(0))
  )
  console.log('\nCompressed token leaves (use leafHashDecimal in the last column for the diagnostic):\n')
  let n = 0
  for (const a of items) {
    n++
    const hDec = bn(a.compressedAccount.hash).toString(10)
    const amt = a.parsed.amount.toString()
    const tree = a.compressedAccount.treeInfo.tree.toBase58()
    console.log(
      `#${n} amount(raw)=${amt} tree=${tree.slice(0, 8)}…\n    leafHashDecimal=${hDec}\n`
    )
  }
  if (items.length === 0) {
    console.log('(none — nothing to claim for this owner + mint on this indexer)')
  }
}

async function main() {
  const { rpcUrl, owner: ownerStr, mint: mintStr, leafHash: hashStr } = parseArgs()
  if (!rpcUrl || !ownerStr || !mintStr) {
    console.error(
      'Usage:\n' +
        '  List leaves (no 4th arg):\n' +
        '    NUXT_PUBLIC_HELIUS_RPC=<url> pnpm exec tsx packages/shipment/scripts/diagnose-decompress-leaf.ts <owner> <mint>\n' +
        '  Diagnose one leaf:\n' +
        '    ... diagnose-decompress-leaf.ts <owner> <mint> <leafHashDecimal>\n' +
        '  Optional: first arg can be <rpcUrl> if not in env.',
    )
    process.exit(1)
  }

  console.log('RPC:', maskUrl(rpcUrl))
  console.log('Owner:', ownerStr)
  console.log('Mint:', mintStr)

  const rpc = createRpc(rpcUrl, rpcUrl, rpcUrl, { commitment: 'confirmed' })
  const owner = new PublicKey(ownerStr)
  const mintPk = new PublicKey(mintStr)

  if (!hashStr?.trim()) {
    await listLeaves(rpc, owner, mintPk)
    console.log(
      'Re-run with the same owner, mint, and one leafHashDecimal above to test the validity proof.',
    )
    return
  }

  console.log('Leaf hash (decimal):', hashStr.slice(0, 24) + (hashStr.length > 24 ? '…' : ''))

  const res = await rpc.getCompressedTokenAccountsByOwner(owner, { mint: mintPk })
  const items = (res.items ?? []).filter((a) =>
    bn(a.parsed.amount.toString()).gt(bn(0))
  )

  console.log('\nLeaves with balance for mint:', items.length)

  const leafHashBn = bn(hashStr.trim())

  const row = items.find((a) => bn(a.compressedAccount.hash).eq(leafHashBn))
  if (!row) {
    console.error(
      '\nFAIL: No leaf with this hash in indexer response. Either already claimed/spent, or UI id is stale/wrong.',
    )
    if (items.length) {
      console.log('Sample other leaf hash (decimal):', bn(items[0]!.compressedAccount.hash).toString(10))
    }
    process.exit(2)
  }

  console.log('Leaf amount (raw):', row.parsed.amount.toString())
  console.log('Tree:', row.compressedAccount.treeInfo.tree.toBase58())
  console.log('TreeType:', row.compressedAccount.treeInfo.treeType, '(StateV1=', TreeType.StateV1, ')')

  try {
    const bal = await rpc.getCompressedTokenAccountBalance(bn(row.compressedAccount.hash))
    console.log('getCompressedTokenAccountBalance:', bal.amount.toString(10))
    if (!bal.amount.eq(bn(row.parsed.amount.toString()))) {
      console.warn('WARN: balance RPC != parsed.amount (indexer inconsistency)')
    }
  } catch (e) {
    console.warn('getCompressedTokenAccountBalance error:', e)
  }

  const totalAllBn = items.reduce(
    (s, a) => s.add(bn(a.parsed.amount.toString())),
    bn(0)
  )
  const { accounts: preferred } = selectAccountsByPreferredTreeType(
    items as Parameters<typeof selectAccountsByPreferredTreeType>[0],
    totalAllBn
  )
  const hit = preferred.find((a) => bn(a.compressedAccount.hash).eq(leafHashBn))
  if (!hit) {
    console.error(
      '\nFAIL: selectAccountsByPreferredTreeType dropped this leaf (wrong StateV1/V2 era for current network defaults).',
    )
    process.exit(3)
  }

  console.log('\nCalling validity proof (same as app)...')
  const proof = await fetchValidityProofLikeProduction(rpc, [hit])

  const cp = proof.compressedProof
  console.log('compressedProof:', cp == null ? 'null' : 'present')
  console.log('rootIndices length:', proof.rootIndices?.length ?? 0)
  console.log('roots length:', proof.roots?.length ?? 0)

  if (cp == null) {
    const isV2 = row.compressedAccount.treeInfo.treeType === TreeType.StateV2
    console.error(
      '\nFAIL: compressedProof is null. Common causes:\n' +
        '  - Helius URL is not ZK-compression enabled (use mainnet.helius-rpc.com?api-key=… as in Helius dashboard).\n' +
        '  - Leaf is not in the merkle tree the prover uses (spent / reorg / indexer lag).\n' +
        '  - Rate limits or transient prover errors (retry later).\n' +
        (isV2 ?
          '  - TreeType is StateV2: Helius has been observed returning null proofs while the indexer still lists the leaf. Contact Helius support; for new sends, prefer compress output to State V1 trees.\n'
        : '') +
        'A bad unrelated transaction yesterday does not break all compression; it only affects leaves it touched.',
    )
    process.exit(4)
  }

  console.log('\nOK: Proof generated; decompress instruction should be buildable.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
