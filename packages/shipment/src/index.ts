/**
 * Shipment package – thin layer on Light Protocol for compressed token airdrops.
 * Uses @lightprotocol/compressed-token + @lightprotocol/stateless.js 0.23.x.
 * Compress: getStateTreeInfos + selectStateTreeInfo, getSplInterfaceInfos + selectSplInterfaceInfo,
 * CompressedTokenProgram.compress with outputStateTreeInfo + tokenPoolInfo.
 * Decompress: selectSplInterfaceInfosForDecompression + tokenPoolInfos on CompressedTokenProgram.decompress.
 * Validity proof: stateless.js 0.23 defaults to V2 state trees (see zkcompression migration v1→v2).
 * For StateV2 leaves use getValidityProofV2(merkle contexts); V1 leaves use getValidityProofV0(hash+tree+queue).
 * Wrong proof version / wrong tree disambiguation surfaces as custom program error 0x1900 on decompress.
 */

import {
  PublicKey,
  SendTransactionError,
  Transaction,
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
import type { CompressedAccount, ValidityProofWithContext } from '@lightprotocol/stateless.js'
import { ComputeBudgetProgram } from '@solana/web3.js'
import {
  CompressedTokenProgram,
  createTokenPool,
  selectMinCompressedTokenAccountsForTransfer,
  getSplInterfaceInfos,
  selectSplInterfaceInfo,
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

/** Per-account compressed token (one row per airdrop). Matches AirShip: no aggregation by mint. */
export interface CompressedTokenAccount {
  id: string
  mint: string
  amount: string
  decimals?: number
  /**
   * Merkle leaf hash for this compressed account when available.
   * Pass to decompress as `compressedAccountHash` so the correct account is chosen when multiple exist for the same mint.
   */
  accountHash: string | null
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
  parsed: { mint: { toBase58: () => string }; amount: { toString: () => string } }
  compressedAccount?: { hash?: { toString: () => string } }
}

function mapCompressedAccountsFromRpcResponse(res: unknown): CompressedTokenAccount[] {
  const raw = res as {
    items?: CompressedTokenAccountRpcItem[]
    value?: { items?: CompressedTokenAccountRpcItem[] }
  }
  const items = raw.items ?? raw.value?.items ?? []
  return items.map((item, i) => {
    const hashStr = item.compressedAccount?.hash?.toString() ?? null
    return {
      id: hashStr ?? `${item.parsed.mint.toBase58()}-${i}`,
      mint: item.parsed.mint.toBase58(),
      amount: item.parsed.amount.toString(),
      accountHash: hashStr,
    }
  })
}

/**
 * Fetch compressed token accounts per-account (one per airdrop). Matches AirShip: no aggregation.
 * Use this for decompress so each row = one account = smaller tx (avoids VersionedMessage deserialize issues).
 */
export async function fetchCompressedTokenAccounts(
  rpcUrl: string,
  ownerAddress: string
): Promise<CompressedTokenAccount[]> {
  const rpc = getRpc(rpcUrl)
  const owner = new PublicKey(ownerAddress)
  const res = await rpc.getCompressedTokenAccountsByOwner(owner, {})
  return mapCompressedAccountsFromRpcResponse(res)
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
  const seen = new Set<string>()
  const out: CompressedTokenAccount[] = []
  const unique = [...new Set(mints.filter((m) => typeof m === 'string' && m.trim()))]
  for (const mint of unique) {
    try {
      const mintPk = new PublicKey(mint)
      const res = await rpc.getCompressedTokenAccountsByOwner(owner, { mint: mintPk })
      for (const acc of mapCompressedAccountsFromRpcResponse(res)) {
        const key = `${acc.mint}|${acc.accountHash ?? acc.id}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push(acc)
      }
    } catch {
      void 0
    }
  }
  return out
}

function getRpc(rpcEndpoint: string): ReturnType<typeof createRpc> {
  return createRpc(rpcEndpoint, rpcEndpoint, undefined, {
    commitment: 'confirmed',
  })
}

async function fetchMainnetStateTreeLookupTableAccounts(
  rpc: ReturnType<typeof createRpc>
): Promise<import('@solana/web3.js').AddressLookupTableAccount[]> {
  const pairs = defaultStateTreeLookupTables().mainnet
  if (!pairs?.length) {
    throw new Error('No mainnet state tree LUT pair in defaultStateTreeLookupTables')
  }
  const { stateTreeLookupTable, nullifyLookupTable } = pairs[0]
  const [stateRes, nullifyRes] = await Promise.all([
    rpc.getAddressLookupTable(stateTreeLookupTable),
    rpc.getAddressLookupTable(nullifyLookupTable),
  ])
  const out: import('@solana/web3.js').AddressLookupTableAccount[] = []
  if (stateRes.value) out.push(stateRes.value)
  if (nullifyRes.value) out.push(nullifyRes.value)
  if (out.length === 0) {
    throw new Error('Mainnet state tree lookup tables not found')
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
 * selectSplInterfaceInfo, CompressedTokenProgram.compress with outputStateTreeInfo + tokenPoolInfo,
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

  const splInterfaceInfos = await getSplInterfaceInfos(rpc, mintPk)
  const tokenPoolInfo = selectSplInterfaceInfo(splInterfaceInfos)

  const lookupTableAccounts = await fetchMainnetStateTreeLookupTableAccounts(rpc)

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
  /** Raw token amount (same units as on-chain parsed.amount). Prefer string to avoid float loss. */
  amount: bigint | number | string
  decimals: number
  /** RPC URL. Prefer passing this explicitly (e.g. from useRpc) for decompress. */
  rpcUrl?: string
  /** SPL or Token-2022 mint program. Defaults to TOKEN_PROGRAM_ID. */
  tokenProgramId?: typeof TOKEN_PROGRAM_ID | typeof TOKEN_2022_PROGRAM_ID
  /**
   * When set, decompress only this compressed token account (from `CompressedTokenAccount.accountHash`).
   * Required when multiple compressed accounts exist for the same mint; otherwise `selectMinCompressedTokenAccountsForTransfer`
   * may pick the wrong accounts (largest-first) and fail with custom program error 0x1900.
   */
  compressedAccountHash?: string
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

function u8eq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

type BnInput = Parameters<typeof bn>[0]

/**
 * Decompress proofs must match the state tree version (V1 vs V2).
 * Indexers sometimes omit or mis-tag treeType; 0.23 mainnet defaults to V2, so we only use V0
 * when every input is explicitly StateV1. Otherwise V2 proof (+ compressible fallback).
 * @see https://www.zkcompression.com/resources/migration-v1-to-v2
 */
async function fetchValidityProofForDecompress(
  rpc: ReturnType<typeof createRpc>,
  inputAccounts: Array<{ compressedAccount: CompressedAccount }>
): Promise<ValidityProofWithContext> {
  const v1Only = inputAccounts.every(
    (a) => a.compressedAccount.treeInfo.treeType === TreeType.StateV1
  )
  if (v1Only) {
    const hashesWithTree = inputAccounts.map((account) => {
      const { hash, treeInfo } = account.compressedAccount
      return {
        hash,
        tree: treeInfo.tree,
        queue: treeInfo.queue,
      }
    })
    return rpc.getValidityProofV0(hashesWithTree, [])
  }

  const contexts = inputAccounts.map((a) => a.compressedAccount)
  try {
    return await rpc.getValidityProofV2(contexts, [], DerivationMode.standard)
  } catch {
    return rpc.getValidityProofV2(contexts, [], DerivationMode.compressible)
  }
}

/** Latest merkle context for a leaf; avoids stale treeInfo/hash vs list endpoints. */
async function refreshTokenRowByHash<
  T extends { compressedAccount: CompressedAccount; parsed: { mint: PublicKey } },
>(rpc: ReturnType<typeof createRpc>, row: T, hashNeedle: string, expectedOwner: PublicKey, mintPk: PublicKey): Promise<T> {
  const h = bn(hashNeedle.trim())
  const fresh = await rpc.getCompressedAccount(undefined, h)
  if (!fresh) {
    throw new Error(
      'Could not load this compressed account by hash. Refresh the page and try again.'
    )
  }
  if (!fresh.owner.equals(expectedOwner)) {
    throw new Error('Compressed account owner does not match your wallet.')
  }
  if (!row.parsed.mint.equals(mintPk)) {
    throw new Error('Compressed account mint mismatch.')
  }
  return { ...row, compressedAccount: fresh }
}

function allInitializedSplInterfaces(
  infos: Awaited<ReturnType<typeof getSplInterfaceInfos>>
): typeof infos {
  const init = infos.filter((i) => i.isInitialized).sort((a, b) => a.poolIndex - b.poolIndex)
  if (init.length === 0) {
    throw new Error(
      'No initialized SPL compression interface for this mint. Register the mint for compression first.'
    )
  }
  return init
}

function compressedLeafHashMatches(h: unknown, needle: string): boolean {
  const n = needle.trim()
  if (!n || h == null) return false
  try {
    if (bn(h as BnInput).eq(bn(n))) return true
  } catch {
    void 0
  }
  const hStr =
    typeof h === 'object' && h !== null && 'toString' in h
      ? String((h as { toString: () => string }).toString())
      : String(h)
  if (hStr === n) return true
  try {
    const nBytes = new PublicKey(n).toBytes()
    const hBn = bn(h as BnInput)
    const le32 = new Uint8Array(hBn.toArray('le', 32))
    const be32 = new Uint8Array(hBn.toArray('be', 32))
    if (u8eq(le32, nBytes)) return true
    if (u8eq(be32, nBytes)) return true
  } catch {
    void 0
  }
  return false
}

/**
 * Decompress a compressed token to the owner's SPL ATA.
 * Mirrors `@lightprotocol/compressed-token` account selection, amount semantics, and proof fetch.
 * Uses legacy `Transaction` (not v0) so Solana Connector / embedded wallets can sign; v0 hits
 * "Versioned messages must be deserialized with VersionedMessage.deserialize()".
 */
export async function decompressToken(params: DecompressParams): Promise<string> {
  const {
    connection,
    wallet,
    mint,
    amount,
    rpcUrl: rpcUrlParam,
    tokenProgramId,
    compressedAccountHash,
  } = params
  const owner = wallet.publicKey
  const mintPk = new PublicKey(mint)
  const requestedBn = amountToBn(amount)
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

  const compressedAccounts = await rpc.getCompressedTokenAccountsByOwner(owner, { mint: mintPk })
  const items = (compressedAccounts.items ?? []).filter((account) =>
    bn(account.parsed.amount).gt(bn(0))
  )

  if (items.length === 0) {
    throw new Error('No compressed token balance found for this mint. Refresh and try again.')
  }

  const hashNeedle = compressedAccountHash?.trim()
  if (items.length > 1 && !hashNeedle) {
    throw new Error(
      'More than one compressed balance exists for this mint. Refresh the page so each shipment row includes an account hash, then claim the row you want. Without the hash, the wrong accounts can be selected and the transaction fails with error 0x1900.'
    )
  }

  let inputAccounts: (typeof items)[number][]

  if (hashNeedle) {
    const found = items.find((account) =>
      compressedLeafHashMatches(account.compressedAccount?.hash, hashNeedle),
    )
    if (!found) {
      throw new Error(
        'This compressed token account was not found. Refresh the page and try again.'
      )
    }
    inputAccounts = [
      await refreshTokenRowByHash(rpc, found, hashNeedle, owner, mintPk),
    ]
  } else {
    const [selected] = selectMinCompressedTokenAccountsForTransfer(items, requestedBn)
    inputAccounts = selected
  }

  const tree0 = inputAccounts[0].compressedAccount.treeInfo.tree.toBase58()
  for (let i = 1; i < inputAccounts.length; i++) {
    if (inputAccounts[i].compressedAccount.treeInfo.tree.toBase58() !== tree0) {
      throw new Error(
        'Compressed balances for this mint sit in different state trees. Merge those compressed accounts (Light Protocol) into one, then claim again.'
      )
    }
  }

  let sumParsed = bn(0)
  for (const a of inputAccounts) {
    sumParsed = sumParsed.add(bn(a.parsed.amount))
  }
  for (const a of inputAccounts) {
    const bal = await rpc.getCompressedTokenAccountBalance(bn(a.compressedAccount.hash))
    if (!bal.amount.eq(bn(a.parsed.amount))) {
      throw new Error(
        'On-chain balance does not match this claim row. Refresh the page and try again.',
      )
    }
  }
  const amountForInstruction =
    compressedAccountHash?.trim() || inputAccounts.length === 1
      ? sumParsed
      : requestedBn

  const proof = await fetchValidityProofForDecompress(rpc, inputAccounts)

  const splInterfaceInfos = await getSplInterfaceInfos(rpc, mintPk)
  const tokenPoolInfos = allInitializedSplInterfaces(splInterfaceInfos)

  const decompressIx = await CompressedTokenProgram.decompress({
    payer: owner,
    inputCompressedTokenAccounts: inputAccounts,
    toAddress: splAta,
    amount: amountForInstruction,
    recentInputStateRootIndices: proof.rootIndices,
    recentValidityProof: proof.compressedProof,
    tokenPoolInfos,
  })

  const ataInfo = await rpc.getAccountInfo(splAta)
  const needsAta = !ataInfo
  const cuLimit = 1_000_000

  let blockhashCtx = (await rpc.getLatestBlockhashAndContext()).value

  // Create the SPL ATA in its own transaction when missing. Bundling ATA idempotent + Light
  // decompress in one legacy Transaction has triggered "writable privilege escalated" on the
  // state tree for some wallets (outer ix passes the tree read-only after sign/serialize).
  if (needsAta) {
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
    createAtaTx.recentBlockhash = blockhashCtx.blockhash
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
    blockhashCtx = (await rpc.getLatestBlockhashAndContext()).value
  }

  const tx = new Transaction()
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }))
  tx.add(decompressIx)
  tx.recentBlockhash = blockhashCtx.blockhash
  tx.feePayer = owner

  const signedTx = await wallet.signTransaction(tx)
  try {
    const sig = await rpc.sendRawTransaction(signedTx.serialize(), {
      skipPreflight: false,
    })
    await rpc.confirmTransaction(sig, 'confirmed')
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
          // no signature / simulation-only — message may already include logs
        }
      }
      throw new Error(`${base}${logBlock}`, { cause: e })
    }
    throw e
  }
}

/** Alias for decompressToken; used by shipment page. */
export { decompressToken as decompress }
