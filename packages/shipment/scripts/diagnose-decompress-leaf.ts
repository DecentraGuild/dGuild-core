/**
 * Diagnose compressed-token decompress proof path (aligned with @lightprotocol/compressed-token `decompress`).
 *
 * Loads NUXT_PUBLIC_HELIUS_RPC / HELIUS_RPC from `.env` in cwd, `apps/tenant/.env`, or `apps/tenant/.env.local`
 * if not set in the shell.
 *
 * List leaves:
 *   pnpm exec tsx packages/shipment/scripts/diagnose-decompress-leaf.ts <owner> <mint>
 *
 * Test validity proof for a raw amount (same selection + proof path as production claim):
 *   pnpm exec tsx packages/shipment/scripts/diagnose-decompress-leaf.ts <owner> <mint> <amountRaw>
 *
 * Optional: first arg can be <rpcUrl> if not in env.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { PublicKey } from '@solana/web3.js'
import { createRpc, bn, TreeType } from '@lightprotocol/stateless.js'
import {
  selectAccountsByPreferredTreeType,
  selectMinCompressedTokenAccountsForTransfer,
} from '@lightprotocol/compressed-token'
import { fetchDecompressValidityProof } from '../src/decompress-proof.ts'

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
    amountRaw: args[i + 2],
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
  console.log('\nCompressed token leaves:\n')
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
  const { rpcUrl, owner: ownerStr, mint: mintStr, amountRaw } = parseArgs()
  if (!rpcUrl || !ownerStr || !mintStr) {
    console.error(
      'Usage:\n' +
        '  List leaves:\n' +
        '    NUXT_PUBLIC_HELIUS_RPC=<url> pnpm exec tsx packages/shipment/scripts/diagnose-decompress-leaf.ts <owner> <mint>\n' +
        '  Test getValidityProofV0 for amount (same as @decentraguild/shipment decompress):\n' +
        '    ... diagnose-decompress-leaf.ts <owner> <mint> <amountRaw>\n' +
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

  if (!amountRaw?.trim()) {
    await listLeaves(rpc, owner, mintPk)
    console.log(
      '\nRe-run with the same owner, mint, and amountRaw (token base units) to test getValidityProofV0.',
    )
    return
  }

  const amountStr = amountRaw.trim()
  if (!/^\d+$/.test(amountStr) || amountStr === '0') {
    console.error('FAIL: amountRaw must be a positive decimal integer (token raw units).')
    process.exit(1)
  }
  const amountBn = bn(amountStr)

  const res = await rpc.getCompressedTokenAccountsByOwner(owner, { mint: mintPk })
  const items = (res.items ?? []).filter((a) =>
    bn(a.parsed.amount.toString()).gt(bn(0))
  )

  console.log('\nLeaves with balance for mint:', items.length)

  const walletTotalBn = items.reduce(
    (s, a) => s.add(bn(a.parsed.amount.toString())),
    bn(0),
  )
  if (walletTotalBn.lt(amountBn)) {
    console.error('\nFAIL: Insufficient compressed balance for this amount.')
    process.exit(2)
  }

  const { accounts: accountsToUse } = selectAccountsByPreferredTreeType(
    items as Parameters<typeof selectAccountsByPreferredTreeType>[0],
    amountBn,
  )

  const [inputAccounts, selectedTotalBn] =
    selectMinCompressedTokenAccountsForTransfer(
      accountsToUse as Parameters<
        typeof selectMinCompressedTokenAccountsForTransfer
      >[0],
      amountBn,
    )

  if (selectedTotalBn.lt(amountBn)) {
    console.error(
      '\nFAIL: selectMinCompressedTokenAccountsForTransfer could not cover amount on preferred tree.',
    )
    process.exit(3)
  }

  console.log('Input accounts selected:', inputAccounts.length)
  for (const acc of inputAccounts) {
    console.log(
      '  amount(raw)=',
      acc.parsed.amount.toString(),
      ' TreeType=',
      acc.compressedAccount.treeInfo.treeType,
      '(StateV1=',
      TreeType.StateV1,
      ', StateV2=',
      TreeType.StateV2,
      ')',
    )
  }

  console.log(
    '\nCalling fetchDecompressValidityProof (V0 if all StateV1, else V2 + fallbacks — same as app)...',
  )
  const proof = await fetchDecompressValidityProof(rpc, inputAccounts)

  const cp = proof.compressedProof
  console.log('compressedProof:', cp == null ? 'null' : 'present')
  console.log('rootIndices length:', proof.rootIndices?.length ?? 0)
  console.log('roots length:', proof.roots?.length ?? 0)

  if (cp == null) {
    const isV2 = inputAccounts.some(
      (a) => a.compressedAccount.treeInfo.treeType === TreeType.StateV2,
    )
    console.error(
      '\nFAIL: compressedProof is null. Common causes:\n' +
        '  - Helius URL is not ZK-compression enabled.\n' +
        '  - Rate limits / prover errors.\n' +
        (isV2 ?
          '  - State V2: app tries V2 + legacy proof RPCs; if still null, escalate to Helius.\n'
        : '') +
        'Use amountRaw from a listed row when testing a specific shipment line.',
    )
    process.exit(4)
  }

  console.log('\nOK: Proof generated; decompress instruction should be buildable.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
