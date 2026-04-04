/**
 * Shipment package – thin layer on Light Protocol for compressed token airdrops.
 * Uses @lightprotocol/compressed-token + @lightprotocol/stateless.js 0.23.x.
 *
 * **Claims** are one compressed **leaf** at a time (matches indexer rows from `getCompressedTokenAccountsByOwner`):
 * `selectAccountsByPreferredTreeType` → `getValidityProofV0` / `getValidityProofV2` → `CompressedTokenProgram.decompress`,
 * lowest SPL pool only, v0 `VersionedTransaction` + state tree LUTs. No proof retries (avoids hammering RPC limits).
 */

import {
  PublicKey,
  SendTransactionError,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js'
import type { Connection } from '@solana/web3.js'
import type { Keypair } from '@solana/web3.js'
import {
  createAssociatedTokenAccountIdempotentInstructionWithDerivation,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token'
import {
  createRpc,
  buildAndSignTx,
  bn,
  selectStateTreeInfo,
  defaultStateTreeLookupTables,
  TreeType,
  DerivationMode,
} from '@lightprotocol/stateless.js'
import type { ValidityProofWithContext } from '@lightprotocol/stateless.js'
import type { CompressedAccount } from '@lightprotocol/stateless.js'
import { ComputeBudgetProgram } from '@solana/web3.js'
import {
  CompressedTokenProgram,
  createTokenPool,
  selectAccountsByPreferredTreeType,
  getSplInterfaceInfos,
} from '@lightprotocol/compressed-token'

const MAX_ADDRESSES_PER_INSTRUCTION = 5
const MAX_COMPRESS_INSTRUCTIONS_PER_TX = 2
const COMPUTE_UNIT_LIMIT = 550_000

export interface ShipmentRecipient {
  address: string
  amount: number
}

export interface CompressAndSendParams {
  connection: Connection
  payer: Keypair
  mint: string
  recipients: ShipmentRecipient[]
  decimals: number
  /** RPC URL string. Light Protocol createRpc needs the URL. Prefer Helius with ZK compression support. */
  rpcUrl?: string
  /** SPL or Token-2022. Defaults to TOKEN_PROGRAM_ID. */
  tokenProgramId?: typeof TOKEN_PROGRAM_ID | typeof TOKEN_2022_PROGRAM_ID
}

export interface RegisterMintParams {
  connection: Connection
  payer: Keypair
  mint: string
  /** RPC URL string. Required for Light Protocol createRpc. */
  rpcUrl?: string
  /** SPL or Token-2022. Defaults to TOKEN_PROGRAM_ID. */
  tokenProgramId?: typeof TOKEN_PROGRAM_ID | typeof TOKEN_2022_PROGRAM_ID
  /** Create payer's ATA for the mint if it doesn't exist. Default true. */
  createPayerAta?: boolean
}

/** Returned when mint is already registered; caller can treat as success and proceed to Ship. */
export const REGISTER_ALREADY_DONE = 'already-registered'

export interface CompressedTokenBalance {
  mint: string
  amount: string
  decimals?: number
}

/** One row per mint: total compressed token amount for that mint (all leaves summed). */
export interface CompressedTokenAccount {
  id: string
  mint: string
  amount: string
  decimals?: number
}

/** One row per compressed token leaf (one claim / signature). `id` is the leaf hash (decimal string). */
export interface CompressedTokenLeaf {
  id: string
  mint: string
  amount: string
}

/**
 * Fetch compressed token balances for an owner via the ZK compression API.
 * Use this instead of DAS getAssetsByOwner for compressed tokens.
 */
export async function fetchCompressedTokenBalances(
  rpcUrl: string,
  ownerAddress: string
): Promise<CompressedTokenBalance[]> {
  const rpc = getRpc(rpcUrl)
  const owner = new PublicKey(ownerAddress)
  const res = await rpc.getCompressedTokenBalancesByOwnerV2(owner, {})
  const items = res.value?.items ?? []
  return items.map((item) => ({
    mint: item.mint.toBase58(),
    amount: item.balance.toString(),
  }))
}

type CompressedTokenAccountRpcItem = {
  parsed: {
    mint: { toBase58: () => string }
    amount: { toString: () => string }
    owner: PublicKey
  }
  compressedAccount: CompressedAccount
}

function aggregateCompressedItemsByMint(
  items: CompressedTokenAccountRpcItem[]
): CompressedTokenAccount[] {
  const sums = new Map<string, ReturnType<typeof bn>>()
  for (const item of items) {
    const amt = bn(item.parsed.amount.toString())
    if (amt.lte(bn(0))) continue
    const mint = item.parsed.mint.toBase58()
    const prev = sums.get(mint) ?? bn(0)
    sums.set(mint, prev.add(amt))
  }
  return [...sums.entries()].map(([mint, total]) => ({
    id: mint,
    mint,
    amount: total.toString(),
  }))
}

function compressedTokenItemsFromRpcResponse(res: unknown): CompressedTokenAccountRpcItem[] {
  const raw = res as {
    items?: CompressedTokenAccountRpcItem[]
    value?: { items?: CompressedTokenAccountRpcItem[] }
  }
  return raw.items ?? raw.value?.items ?? []
}

/**
 * Fetch compressed token balances aggregated by mint (sums all compressed leaves per mint).
 */
export async function fetchCompressedTokenAccounts(
  rpcUrl: string,
  ownerAddress: string
): Promise<CompressedTokenAccount[]> {
  const rpc = getRpc(rpcUrl)
  const owner = new PublicKey(ownerAddress)
  const res = await rpc.getCompressedTokenAccountsByOwner(owner, {})
  return aggregateCompressedItemsByMint(compressedTokenItemsFromRpcResponse(res))
}

/**
 * Per-mint compressed token accounts (Helius/Light `getCompressedTokenAccountsByOwner` with `mint` filter).
 * Avoids scanning the full wallet, which can throw for some owners when the SDK hits an unknown state tree.
 */
export async function fetchCompressedTokenAccountsForMints(
  rpcUrl: string,
  ownerAddress: string,
  mints: string[]
): Promise<CompressedTokenAccount[]> {
  const rpc = getRpc(rpcUrl)
  const owner = new PublicKey(ownerAddress)
  const sums = new Map<string, ReturnType<typeof bn>>()
  const unique = [...new Set(mints.filter((m) => typeof m === 'string' && m.trim()))]
  for (const mint of unique) {
    try {
      const mintPk = new PublicKey(mint)
      const res = await rpc.getCompressedTokenAccountsByOwner(owner, { mint: mintPk })
      const items = compressedTokenItemsFromRpcResponse(res)
      for (const item of items) {
        const amt = bn(item.parsed.amount.toString())
        if (amt.lte(bn(0))) continue
        const m = item.parsed.mint.toBase58()
        const prev = sums.get(m) ?? bn(0)
        sums.set(m, prev.add(amt))
      }
    } catch {
      void 0
    }
  }
  return [...sums.entries()].map(([mint, total]) => ({
    id: mint,
    mint,
    amount: total.toString(),
  }))
}

function compressedLeavesFromRpcItems(
  items: CompressedTokenAccountRpcItem[]
): CompressedTokenLeaf[] {
  const out: CompressedTokenLeaf[] = []
  for (const item of items) {
    const amt = bn(item.parsed.amount.toString())
    if (amt.lte(bn(0))) continue
    const h = item.compressedAccount?.hash
    if (h == null) continue
    out.push({
      id: bn(h).toString(10),
      mint: item.parsed.mint.toBase58(),
      amount: amt.toString(10),
    })
  }
  return out
}

/**
 * All compressed token leaves for an owner (no aggregation). One entry per claimable row.
 */
export async function fetchCompressedTokenLeaves(
  rpcUrl: string,
  ownerAddress: string
): Promise<CompressedTokenLeaf[]> {
  const rpc = getRpc(rpcUrl)
  const owner = new PublicKey(ownerAddress)
  const res = await rpc.getCompressedTokenAccountsByOwner(owner, {})
  return compressedLeavesFromRpcItems(compressedTokenItemsFromRpcResponse(res))
}

/**
 * Compressed leaves for specific mints only (tenant shipment mints). Dedupes by leaf id.
 */
export async function fetchCompressedTokenLeavesForMints(
  rpcUrl: string,
  ownerAddress: string,
  mints: string[]
): Promise<CompressedTokenLeaf[]> {
  const rpc = getRpc(rpcUrl)
  const owner = new PublicKey(ownerAddress)
  const byId = new Map<string, CompressedTokenLeaf>()
  const unique = [...new Set(mints.filter((m) => typeof m === 'string' && m.trim()))]
  for (const mint of unique) {
    try {
      const mintPk = new PublicKey(mint)
      const res = await rpc.getCompressedTokenAccountsByOwner(owner, { mint: mintPk })
      for (const leaf of compressedLeavesFromRpcItems(
        compressedTokenItemsFromRpcResponse(res)
      )) {
        byId.set(leaf.id, leaf)
      }
    } catch {
      void 0
    }
  }
  return [...byId.values()]
}

function getRpc(rpcEndpoint: string): ReturnType<typeof createRpc> {
  return createRpc(rpcEndpoint, rpcEndpoint, undefined, {
    commitment: 'confirmed',
  })
}

function pickLowestInitializedSplInterfaceInfo(
  rows: Awaited<ReturnType<typeof getSplInterfaceInfos>>
) {
  const poolCandidates = rows
    .filter((i) => i.isInitialized)
    .sort((a, b) => a.poolIndex - b.poolIndex)
  if (poolCandidates.length === 0) {
    throw new Error(
      'No initialized SPL compression interface for this mint. Register the mint for compression first.',
    )
  }
  return poolCandidates[0]
}

/**
 * Proof path aligned with bundled `decompress()` in @lightprotocol/compressed-token@0.23.x:
 * StateV1 inputs → `getValidityProofV0` only (no silent V2 fallback — wrong proof class matches on-chain 0x1900-style failures).
 * Otherwise → `getValidityProofV2` (standard, then compressible).
 */
async function fetchValidityProofForDecompress(
  rpc: ReturnType<typeof createRpc>,
  inputAccounts: Array<{ compressedAccount: CompressedAccount }>
): Promise<ValidityProofWithContext> {
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
      [],
    )
  }
  const contexts = inputAccounts.map((a) => a.compressedAccount)
  try {
    return await rpc.getValidityProofV2(
      contexts,
      [],
      DerivationMode.standard
    )
  } catch {
    return rpc.getValidityProofV2(
      contexts,
      [],
      DerivationMode.compressible
    )
  }
}

function stateTreeLookupTablePairsForRpcUrl(rpcUrl: string) {
  const devnet = /devnet/i.test(rpcUrl)
  const pairs = devnet
    ? defaultStateTreeLookupTables().devnet
    : defaultStateTreeLookupTables().mainnet
  if (!pairs?.length) {
    throw new Error('No state tree LUT pair in defaultStateTreeLookupTables')
  }
  return pairs[0]
}

async function fetchStateTreeLookupTableAccounts(
  rpc: ReturnType<typeof createRpc>,
  rpcUrl: string
): Promise<import('@solana/web3.js').AddressLookupTableAccount[]> {
  const { stateTreeLookupTable, nullifyLookupTable } =
    stateTreeLookupTablePairsForRpcUrl(rpcUrl)
  const [stateRes, nullifyRes] = await Promise.all([
    rpc.getAddressLookupTable(stateTreeLookupTable),
    rpc.getAddressLookupTable(nullifyLookupTable),
  ])
  const out: import('@solana/web3.js').AddressLookupTableAccount[] = []
  if (stateRes.value) out.push(stateRes.value)
  if (nullifyRes.value) out.push(nullifyRes.value)
  if (out.length === 0) {
    throw new Error('State tree lookup tables not found on this cluster')
  }
  return out
}

/**
 * Register an existing SPL mint with Light Protocol (create token pool).
 * Call this once per mint before compressAndSend. No mint authority required.
 * Returns REGISTER_ALREADY_DONE if the pool already exists (treat as success).
 */
export async function registerMintForCompression(
  params: RegisterMintParams
): Promise<string> {
  const { connection, payer, mint, rpcUrl, tokenProgramId, createPayerAta = true } = params
  const rpcEndpoint =
    rpcUrl ?? (connection as { rpcEndpoint?: string }).rpcEndpoint
  if (!rpcEndpoint) {
    throw new Error(
      'RPC URL required for ZK compression. Set NUXT_PUBLIC_HELIUS_RPC (Helius with ZK support).'
    )
  }
  const rpc = getRpc(rpcEndpoint)
  const mintPk = new PublicKey(mint)
  const programId = tokenProgramId ?? TOKEN_PROGRAM_ID
  try {
    await createTokenPool(rpc, payer, mintPk, undefined, programId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (
      msg.includes('already in use') ||
      msg.includes('custom program error: 0x0')
    ) {
      if (createPayerAta) {
        await getOrCreateAssociatedTokenAccount(
          rpc,
          payer,
          mintPk,
          payer.publicKey,
          false,
          undefined,
          undefined,
          programId
        )
      }
      return REGISTER_ALREADY_DONE
    }
    throw e
  }
  if (createPayerAta) {
    await getOrCreateAssociatedTokenAccount(
      rpc,
      payer,
      mintPk,
      payer.publicKey,
      false,
      undefined,
      undefined,
      programId
    )
  }
  return 'registered'
}

/**
 * Compress and send tokens to recipients. Ship wallet must hold the tokens in its ATA.
 * Uses createTokenPool, getStateTreeInfos + selectStateTreeInfo, getSplInterfaceInfos +
 * lowest poolIndex (deterministic ship),
 * CompressedTokenProgram.compress with outputStateTreeInfo + tokenPoolInfo,
 * buildAndSignTx with default state-tree LUT pair(s).
 * Large recipient lists are split across multiple transactions (v0 message size limit).
 * The payer keypair signs every partial tx in one batch (same blockhash) before any
 * send—no per-tx wallet popups; only the RPC submit/confirm steps are sequential.
 * Returns one base58 signature, or comma-separated signatures when multiple txs were sent.
 */
export async function compressAndSend(
  params: CompressAndSendParams
): Promise<string> {
  const {
    connection,
    payer,
    mint,
    recipients,
    decimals,
    rpcUrl,
    tokenProgramId,
  } = params
  if (recipients.length === 0) throw new Error('No recipients')
  const multiplier = 10 ** decimals
  const rpcEndpoint =
    rpcUrl ?? (connection as { rpcEndpoint?: string }).rpcEndpoint
  if (!rpcEndpoint) {
    throw new Error(
      'RPC URL required for ZK compression. Set NUXT_PUBLIC_HELIUS_RPC (Helius with ZK support).'
    )
  }
  const rpc = getRpc(rpcEndpoint)
  const mintPk = new PublicKey(mint)
  const programId = tokenProgramId ?? TOKEN_PROGRAM_ID

  try {
    await createTokenPool(rpc, payer, mintPk, undefined, programId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (
      !msg.includes('already in use') &&
      !msg.includes('custom program error: 0x0')
    ) {
      throw e
    }
  }

  const sourceAta = await getOrCreateAssociatedTokenAccount(
    rpc,
    payer,
    mintPk,
    payer.publicKey,
    false,
    undefined,
    undefined,
    programId
  )

  const stateTreeInfos = await rpc.getStateTreeInfos()
  const outputStateTreeInfo = selectStateTreeInfo(stateTreeInfos)

  const splRows = await getSplInterfaceInfos(rpc, mintPk)
  const tokenPoolInfo = pickLowestInitializedSplInterfaceInfo(splRows)

  const lookupTableAccounts = await fetchStateTreeLookupTableAccounts(
    rpc,
    rpcEndpoint
  )

  const toAddresses = recipients.map((r) => new PublicKey(r.address))
  const amountsRaw = recipients.map((r) => Math.round(r.amount * multiplier))
  const amountsBN = amountsRaw.map((a) => bn(a))

  const compressInstructions: import('@solana/web3.js').TransactionInstruction[] =
    []
  for (let i = 0; i < toAddresses.length; i += MAX_ADDRESSES_PER_INSTRUCTION) {
    const batch = toAddresses.slice(i, i + MAX_ADDRESSES_PER_INSTRUCTION)
    const batchAmounts = amountsBN.slice(i, i + MAX_ADDRESSES_PER_INSTRUCTION)
    const compressIx = await CompressedTokenProgram.compress({
      payer: payer.publicKey,
      owner: payer.publicKey,
      source: sourceAta.address,
      toAddress: batch,
      amount: batchAmounts,
      mint: mintPk,
      outputStateTreeInfo,
      tokenPoolInfo,
    })
    compressInstructions.push(compressIx)
  }

  const { blockhash } = await rpc.getLatestBlockhash()

  const signedTxs: VersionedTransaction[] = []
  for (
    let i = 0;
    i < compressInstructions.length;
    i += MAX_COMPRESS_INSTRUCTIONS_PER_TX
  ) {
    const chunk = compressInstructions.slice(
      i,
      i + MAX_COMPRESS_INSTRUCTIONS_PER_TX
    )
    const instructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT }),
      ...chunk,
    ]
    signedTxs.push(
      buildAndSignTx(
        instructions,
        payer,
        blockhash,
        undefined,
        lookupTableAccounts
      )
    )
  }

  const signatures: string[] = []
  for (const signedTx of signedTxs) {
    const sig = await rpc.sendRawTransaction(signedTx.serialize(), {
      skipPreflight: false,
    })
    await rpc.confirmTransaction(sig, 'confirmed')
    signatures.push(sig)
  }

  return signatures.join(',')
}

export interface DecompressParams {
  connection: Connection
  /** Wallet adapter. Use getEscrowWalletFromConnector from @decentraguild/web3. */
  wallet: import('@decentraguild/web3').EscrowWallet
  mint: string
  /** Raw token amount for this leaf (same units as on-chain parsed.amount). */
  amount: bigint | number | string
  decimals: number
  /**
   * Leaf commitment from `CompressedTokenLeaf.id` / indexer (decimal string).
   * Required so each claim signs one decompress for one row from `getCompressedTokenAccountsByOwner`.
   */
  compressedLeafHash: string
  /** RPC URL. Prefer passing this explicitly (e.g. from useRpc) for decompress. */
  rpcUrl?: string
  /** SPL or Token-2022 mint program. Defaults to TOKEN_PROGRAM_ID. */
  tokenProgramId?: typeof TOKEN_PROGRAM_ID | typeof TOKEN_2022_PROGRAM_ID
}

function amountToBn(amount: bigint | number | string) {
  const s =
    typeof amount === 'bigint'
      ? amount.toString()
      : typeof amount === 'string'
        ? amount.trim()
        : Number.isFinite(amount)
          ? String(Math.trunc(amount))
          : ''
  if (!s || !/^\d+$/.test(s)) throw new Error('Invalid token amount')
  return bn(s)
}

async function resolveSplTokenProgramForMint(
  connection: Connection,
  mintPk: PublicKey
): Promise<typeof TOKEN_PROGRAM_ID | typeof TOKEN_2022_PROGRAM_ID> {
  const info = await connection.getAccountInfo(mintPk)
  if (!info) throw new Error('Mint account not found')
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID
  if (info.owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID
  throw new Error(`Unsupported mint owner program: ${info.owner.toBase58()}`)
}

/**
 * Decompress one compressed token leaf to the owner's SPL ATA (one wallet signature for decompress).
 */
export async function decompressToken(params: DecompressParams): Promise<string> {
  const {
    connection,
    wallet,
    mint,
    amount,
    compressedLeafHash,
    rpcUrl: rpcUrlParam,
    tokenProgramId,
  } = params
  const owner = wallet.publicKey
  const mintPk = new PublicKey(mint)
  const requestedBn = amountToBn(amount)
  const leafHashBn = bn(compressedLeafHash.trim())
  const programId =
    tokenProgramId ?? (await resolveSplTokenProgramForMint(connection, mintPk))
  const splAta = getAssociatedTokenAddressSync(mintPk, owner, false, programId)

  const rpcEndpoint =
    rpcUrlParam ??
    (connection as { rpcEndpoint?: string }).rpcEndpoint ??
    (connection as { _rpcEndpoint?: string })._rpcEndpoint
  if (!rpcEndpoint || typeof rpcEndpoint !== 'string') {
    throw new Error(
      'RPC URL required for decompress. Pass rpcUrl from useRpc() or use connection from useSolanaConnection.'
    )
  }
  const rpc = getRpc(rpcEndpoint)

  const ataInfo = await rpc.getAccountInfo(splAta)
  const needsAta = !ataInfo
  const DECOMPRESS_CU_LIMIT = 550_000

  const lookupTableAccounts = await fetchStateTreeLookupTableAccounts(
    rpc,
    rpcEndpoint
  )

  if (needsAta) {
    const { blockhash } = (await rpc.getLatestBlockhashAndContext()).value
    const createAtaTx = new Transaction()
    createAtaTx.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      createAssociatedTokenAccountIdempotentInstructionWithDerivation(
        owner,
        owner,
        mintPk,
        false,
        programId
      )
    )
    createAtaTx.recentBlockhash = blockhash
    createAtaTx.feePayer = owner
    const signedCreate = await wallet.signTransaction(createAtaTx)
    try {
      const createSig = await rpc.sendRawTransaction(signedCreate.serialize(), {
        skipPreflight: false,
      })
      await rpc.confirmTransaction(createSig, 'confirmed')
    } catch (e) {
      if (e instanceof SendTransactionError) {
        const base = e.message
        let logBlock = ''
        try {
          const fetched = await e.getLogs(connection)
          if (Array.isArray(fetched) && fetched.length) {
            logBlock = `\n\nFull logs:\n${fetched.join('\n')}`
          }
        } catch {
          // simulation-only
        }
        throw new Error(`Create token account failed: ${base}${logBlock}`, { cause: e })
      }
      throw e
    }
  }

  const compressedAccounts = await rpc.getCompressedTokenAccountsByOwner(owner, {
    mint: mintPk,
  })
  const items = (compressedAccounts.items ?? []).filter((account) =>
    bn(account.parsed.amount.toString()).gt(bn(0))
  ) as CompressedTokenAccountRpcItem[]

  const row = items.find((a) => bn(a.compressedAccount.hash).eq(leafHashBn))
  if (!row) {
    throw new Error(
      'This shipment row was not found on-chain. Refresh the page if you already claimed it.',
    )
  }
  if (!row.parsed.owner.equals(owner)) {
    throw new Error('Compressed account owner does not match your wallet.')
  }
  if (!bn(row.parsed.amount.toString()).eq(requestedBn)) {
    throw new Error(
      'Amount no longer matches this row. Refresh the page and try again.',
    )
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
    throw new Error(
      'This compressed account does not match the active tree version for this network. Refresh the page and try again.',
    )
  }

  const bal = await rpc.getCompressedTokenAccountBalance(bn(hit.compressedAccount.hash))
  if (!bal.amount.eq(bn(hit.parsed.amount.toString()))) {
    throw new Error(
      'On-chain balance does not match this claim row. Refresh the page and try again.',
    )
  }

  const proof = await fetchValidityProofForDecompress(rpc, [hit])
  if (proof.compressedProof == null) {
    throw new Error(
      'Validity proof unavailable from the compression RPC. Wait a few seconds, refresh the page, and try again.',
    )
  }

  const splRows = await getSplInterfaceInfos(rpc, mintPk)
  const tokenPoolInfos = [pickLowestInitializedSplInterfaceInfo(splRows)]

  const decompressIx = await CompressedTokenProgram.decompress({
    payer: owner,
    inputCompressedTokenAccounts: [hit],
    toAddress: splAta,
    amount: bn(hit.parsed.amount.toString()),
    recentInputStateRootIndices: proof.rootIndices,
    recentValidityProof: proof.compressedProof,
    tokenPoolInfos,
  })

  const latest = await rpc.getLatestBlockhash('confirmed')
  const messageV0 = new TransactionMessage({
    payerKey: owner,
    recentBlockhash: latest.blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: DECOMPRESS_CU_LIMIT }),
      decompressIx,
    ],
  }).compileToV0Message(lookupTableAccounts)

  const vtx = new VersionedTransaction(messageV0)
  const signedTx = await wallet.signTransaction(vtx)
  try {
    const sig = await rpc.sendRawTransaction(signedTx.serialize(), {
      skipPreflight: false,
    })
    await rpc.confirmTransaction(
      {
        signature: sig,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      },
      'confirmed',
    )
    return sig
  } catch (e) {
    if (e instanceof SendTransactionError) {
      const base = e.message
      const existing = e.transactionError?.logs
      let logBlock = ''
      if (Array.isArray(existing) && existing.length) {
        logBlock = `\n\nFull logs:\n${existing.join('\n')}`
      } else {
        try {
          const fetched = await e.getLogs(connection)
          if (Array.isArray(fetched) && fetched.length) {
            logBlock = `\n\nFull logs:\n${fetched.join('\n')}`
          }
        } catch {
          // simulation-only
        }
      }
      throw new Error(`${base}${logBlock}`, { cause: e })
    }
    throw e
  }
}

/** Alias for decompressToken; used by shipment page. */
export { decompressToken as decompress }
