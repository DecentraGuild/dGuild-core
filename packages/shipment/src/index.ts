/**
 * Shipment package – thin layer on Light Protocol for compressed token airdrops.
 * Uses @lightprotocol/compressed-token + @lightprotocol/stateless.js 0.20.3.
 * Follows Helius AirShip pattern: createTokenPool, CompressedTokenProgram.compress with outputStateTree.
 */

import { PublicKey, Transaction } from '@solana/web3.js'
import type { Connection } from '@solana/web3.js'
import type { Keypair } from '@solana/web3.js'
import {
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
  return items.map((item, i) => ({
    id: item.compressedAccount?.hash?.toString() ?? `${item.parsed.mint.toBase58()}-${i}`,
    mint: item.parsed.mint.toBase58(),
    amount: item.parsed.amount.toString(),
  }))
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

  const instructions: import('@solana/web3.js').TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT }),
  ]

  const toAddresses = recipients.map((r) => new PublicKey(r.address))
  const amountsRaw = recipients.map((r) => Math.round(r.amount * multiplier))
  const amountsBN = amountsRaw.map((a) => bn(a))

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
    instructions.push(compressIx)
  }

  const { blockhash } = await rpc.getLatestBlockhash()
  const signedTx = buildAndSignTx(
    instructions,
    payer,
    blockhash,
    undefined,
    [lookupTableAccount]
  )

  const sig = await rpc.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
  })
  await rpc.confirmTransaction(sig, 'confirmed')
  return sig
}

export interface DecompressParams {
  connection: Connection
  /** Wallet adapter. Use getEscrowWalletFromConnector from @decentraguild/web3. */
  wallet: import('@decentraguild/web3').EscrowWallet
  mint: string
  amount: bigint | number
  decimals: number
  /** RPC URL. Prefer passing this explicitly (e.g. from useRpc) for decompress. */
  rpcUrl?: string
}

/**
 * Decompress a compressed token to the owner's SPL ATA.
 * Uses AirShip flow: getCompressedTokenAccountsByOwner → selectMinCompressedTokenAccountsForTransfer
 * → getValidityProofV0 (per-account merkleTree + nullifierQueue from RPC) → decompress → legacy Transaction.
 * Avoids the high-level decompress() which can hit "slice" errors with Helius proof format.
 */
export async function decompressToken(params: DecompressParams): Promise<string> {
  const { connection, wallet, mint, amount, rpcUrl: rpcUrlParam } = params
  const owner = wallet.publicKey
  const mintPk = new PublicKey(mint)
  const amountRaw = typeof amount === 'bigint' ? Number(amount) : amount
  const splAta = getAssociatedTokenAddressSync(mintPk, owner)

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
  const [inputAccounts] = selectMinCompressedTokenAccountsForTransfer(
    compressedAccounts.items,
    bn(amountRaw)
  )

  // Proof must use each leaf's actual state tree + queue (from RPC). Using
  // pickRandomTreeAndQueue here produces proofs for the wrong tree; on-chain
  // Light + Lighthouse asserts then fail (e.g. custom 0x1900, "Some(x)==Some(0)").
  const proof = await rpc.getValidityProofV0(
    inputAccounts.map((account) => ({
      hash: bn(account.compressedAccount.hash),
      tree: account.compressedAccount.merkleTree,
      queue: account.compressedAccount.nullifierQueue,
    }))
  )

  const outputStateTree = inputAccounts[0].compressedAccount.merkleTree

  const decompressIx = await CompressedTokenProgram.decompress({
    payer: owner,
    inputCompressedTokenAccounts: inputAccounts,
    toAddress: splAta,
    amount: bn(amountRaw),
    recentInputStateRootIndices: proof.rootIndices,
    recentValidityProof: proof.compressedProof,
    outputStateTree,
  })

  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
    decompressIx,
  ]

  const { value: blockhashCtx } = await rpc.getLatestBlockhashAndContext()

  // Use legacy Transaction instead of VersionedTransaction for connector compatibility.
  // Some wallets (e.g. via Solana Connector) fail with "Versioned messages must be deserialized
  // with VersionedMessage.deserialize()" when signing VersionedTransaction.
  const tx = new Transaction()

  // Add instructions
  for (const ix of instructions) {
    tx.add(ix)
  }
  tx.recentBlockhash = blockhashCtx.blockhash
  tx.feePayer = owner

  const signedTx = await wallet.signTransaction(tx)
  const sig = await rpc.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
  })
  await rpc.confirmTransaction(sig, 'confirmed')
  return sig
}

/** Alias for decompressToken; used by shipment page. */
export { decompressToken as decompress }
