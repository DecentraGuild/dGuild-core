/**
 * Shipment package – thin layer on Light Protocol for compressed token airdrops.
 * Uses @lightprotocol/compressed-token + @lightprotocol/stateless.js 0.20.3.
 * Follows Helius AirShip pattern: createTokenPool, CompressedTokenProgram.compress with outputStateTree.
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
  pickRandomTreeAndQueue,
  bn,
} from '@lightprotocol/stateless.js'
import { ComputeBudgetProgram } from '@solana/web3.js'
import {
  CompressedTokenProgram,
  createTokenPool,
  selectMinCompressedTokenAccountsForTransfer,
} from '@lightprotocol/compressed-token'

const LOOKUP_TABLE_MAINNET = new PublicKey(
  '9NYFyEqPkyXUhkerbGHXUXkvb4qpzeEdHuGpgbgpH1NJ'
)
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
  const items = (res as { value?: { items?: Array<{ mint: PublicKey; balance: { toString: () => string } }> } })
    .value?.items ?? []
  return items.map((item) => ({
    mint: item.mint.toBase58(),
    amount: item.balance.toString(),
  }))
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
  type Item = { parsed: { mint: { toBase58: () => string }; amount: { toString: () => string } }; compressedAccount?: { hash?: { toString: () => string } } }
  const raw = res as { items?: Item[]; value?: { items?: Item[] } }
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

function getRpc(rpcEndpoint: string): ReturnType<typeof createRpc> {
  return createRpc(rpcEndpoint, rpcEndpoint, undefined, {
    commitment: 'confirmed',
  })
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
 * Uses AirShip flow: createTokenPool, getCachedActiveStateTreeInfo, pickRandomTreeAndQueue,
 * CompressedTokenProgram.compress with outputStateTree, buildAndSignTx.
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

  const activeStateTrees = await rpc.getCachedActiveStateTreeInfo()
  const { tree } = pickRandomTreeAndQueue(activeStateTrees)

  const lookupTableResult = await rpc.getAddressLookupTable(LOOKUP_TABLE_MAINNET)
  const lookupTableAccount = lookupTableResult.value
  if (!lookupTableAccount) {
    throw new Error('Mainnet lookup table not found')
  }

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
      tokenProgramId: programId,
      outputStateTree: tree,
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
        [lookupTableAccount]
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
  const programId = tokenProgramId ?? TOKEN_PROGRAM_ID
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
    const found = items.find((account) => {
      const h = account.compressedAccount?.hash
      if (h == null) return false
      try {
        return bn(h).eq(bn(hashNeedle))
      } catch {
        return h.toString() === hashNeedle
      }
    })
    if (!found) {
      throw new Error(
        'This compressed token account was not found. Refresh the page and try again.'
      )
    }
    inputAccounts = [found]
  } else {
    const [selected] = selectMinCompressedTokenAccountsForTransfer(items, requestedBn)
    inputAccounts = selected
  }

  const tree0 = inputAccounts[0].compressedAccount.merkleTree.toBase58()
  for (let i = 1; i < inputAccounts.length; i++) {
    if (inputAccounts[i].compressedAccount.merkleTree.toBase58() !== tree0) {
      throw new Error(
        'Compressed balances for this mint sit in different state trees. Merge those compressed accounts (Light Protocol) into one, then claim again.'
      )
    }
  }

  // Amount field must match the official SDK `decompress(rpc, payer, mint, amount, owner, toAddress, ...)`:
  // `W(items, amount)` selects inputs, then the instruction uses that same `amount` (not necessarily sum(inputs)).
  // Passing sum(inputs) while the program computes remainder vs that amount causes 0x1900 (Some(remainder)==Some(0)).
  let amountForInstruction: ReturnType<typeof bn>
  if (hashNeedle) {
    const hashBn = bn(inputAccounts[0].compressedAccount.hash)
    try {
      const bal = await rpc.getCompressedTokenAccountBalance(hashBn)
      amountForInstruction = bal.amount
    } catch {
      amountForInstruction = bn(inputAccounts[0].parsed.amount)
    }
  } else {
    amountForInstruction = requestedBn
  }

  const proof = await rpc.getValidityProof(
    inputAccounts.map((account) => bn(account.compressedAccount.hash)),
  )

  const outputStateTree = inputAccounts[0].compressedAccount.merkleTree

  const decompressIx = await CompressedTokenProgram.decompress({
    payer: owner,
    inputCompressedTokenAccounts: inputAccounts,
    toAddress: splAta,
    amount: amountForInstruction,
    recentInputStateRootIndices: proof.rootIndices,
    recentValidityProof: proof.compressedProof,
    outputStateTree,
    tokenProgramId: programId,
  })

  const ataInfo = await rpc.getAccountInfo(splAta)
  const needsAta = !ataInfo
  const cuLimit = 1_000_000

  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
  ]
  if (needsAta) {
    instructions.push(
      createAssociatedTokenAccountIdempotentInstructionWithDerivation(
        owner,
        owner,
        mintPk,
        false,
        programId
      )
    )
  }
  instructions.push(decompressIx)

  const { value: blockhashCtx } = await rpc.getLatestBlockhashAndContext()

  const tx = new Transaction()
  for (const ix of instructions) {
    tx.add(ix)
  }
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
