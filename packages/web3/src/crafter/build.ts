/**
 * Crafter: SPL token creation and management.
 * 3-stage flow:
 *   Stage 1: create mint + billing (minimal tx)
 *   Stage 2: add metadata (CreateMetadataAccountV3)
 *   Stage 3: mint, burn, edit
 */

import {
  Transaction,
  PublicKey,
  SystemProgram,
  ComputeBudgetProgram,
  type Connection,
} from '@solana/web3.js'
import {
  createInitializeMint2Instruction,
  createMintToInstruction,
  createBurnInstruction,
  createCloseAccountInstruction,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import {
  createCreateMetadataAccountV3Instruction,
  createUpdateMetadataAccountV2Instruction,
} from '@metaplex-foundation/mpl-token-metadata'
import { buildBillingTransfer } from '../billing/transfer.js'
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')

function getMetadataPda(mint: PublicKey, programId = TOKEN_METADATA_PROGRAM_ID): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), programId.toBuffer(), mint.toBuffer()],
    programId
  )
  return pda
}

const CRAFTER_COMPUTE_UNIT_LIMIT = 400_000

export interface BuildCreateMintAndBillingParams {
  mintKeypair: { publicKey: PublicKey }
  decimals: number
  memo: string
  amountUsdc: number
  recipientAta: PublicKey
  payer: PublicKey
  connection: Connection
  instructionOrder?: 'transferFirst' | 'memoFirst'
}

/**
 * Stage 1: Create mint + billing only. Minimal tx. Call crafter confirm after.
 * Uses the standard SPL pattern: SystemProgram.createAccount + createInitializeMint2Instruction.
 * Both require the mint keypair to sign (createAccount creates the new account).
 */
export async function buildCreateMintAndBillingTransaction(
  params: BuildCreateMintAndBillingParams
): Promise<Transaction> {
  const { mintKeypair, decimals, memo, amountUsdc, recipientAta, payer, connection, instructionOrder = 'transferFirst' } = params
  const mint = mintKeypair.publicKey

  const lamports = await getMinimumBalanceForRentExemptMint(connection)
  const createAccountIx = SystemProgram.createAccount({
    fromPubkey: payer,
    newAccountPubkey: mint,
    space: MINT_SIZE,
    lamports,
    programId: TOKEN_PROGRAM_ID,
  })
  const createMintIx = createInitializeMint2Instruction(mint, decimals, payer, null, TOKEN_PROGRAM_ID)
  const billingTx = buildBillingTransfer({ payer, amountUsdc, recipientAta, memo, connection, instructionOrder })

  const combined = new Transaction()
  combined.feePayer = payer
  combined.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: CRAFTER_COMPUTE_UNIT_LIMIT }),
    createAccountIx,
    createMintIx,
    ...billingTx.instructions,
  )
  return combined
}

export interface BuildCreateMintOnlyParams {
  mintKeypair: { publicKey: PublicKey }
  decimals: number
  payer: PublicKey
  connection: Connection
}

export interface BuildCreateMintWithMemoParams {
  mintKeypair: { publicKey: PublicKey }
  decimals: number
  memo: string
  payer: PublicKey
  connection: Connection
}

/**
 * Create mint + memo (no USDC). For $0 quotes: prepaid entitlement / voucher-backed capacity.
 */
export async function buildCreateMintWithMemoTransaction(
  params: BuildCreateMintWithMemoParams
): Promise<Transaction> {
  const { mintKeypair, decimals, memo, payer, connection } = params
  const mint = mintKeypair.publicKey

  const lamports = await getMinimumBalanceForRentExemptMint(connection)
  const createAccountIx = SystemProgram.createAccount({
    fromPubkey: payer,
    newAccountPubkey: mint,
    space: MINT_SIZE,
    lamports,
    programId: TOKEN_PROGRAM_ID,
  })
  const createMintIx = createInitializeMint2Instruction(mint, decimals, payer, null, TOKEN_PROGRAM_ID)
  const memoIx = createMemoInstruction(memo)

  const combined = new Transaction()
  combined.feePayer = payer
  combined.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: CRAFTER_COMPUTE_UNIT_LIMIT }),
    createAccountIx,
    createMintIx,
    memoIx,
  )
  return combined
}

/**
 * Create mint only (no billing). For voucher creation etc.
 */
export async function buildCreateMintOnlyTransaction(
  params: BuildCreateMintOnlyParams
): Promise<Transaction> {
  const { mintKeypair, decimals, payer, connection } = params
  const mint = mintKeypair.publicKey

  const lamports = await getMinimumBalanceForRentExemptMint(connection)
  const createAccountIx = SystemProgram.createAccount({
    fromPubkey: payer,
    newAccountPubkey: mint,
    space: MINT_SIZE,
    lamports,
    programId: TOKEN_PROGRAM_ID,
  })
  const createMintIx = createInitializeMint2Instruction(mint, decimals, payer, null, TOKEN_PROGRAM_ID)

  const tx = new Transaction()
  tx.feePayer = payer
  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: CRAFTER_COMPUTE_UNIT_LIMIT }),
    createAccountIx,
    createMintIx,
  )
  return tx
}

export interface BuildCreateMetadataParams {
  mint: PublicKey | string
  name: string
  symbol: string
  uri: string
  updateAuthority: PublicKey | string
  payer: PublicKey
  sellerFeeBasisPoints?: number
}

/**
 * Stage 2: Create metadata account (CreateMetadataAccountV3). Call after stage 1.
 */
export function buildCreateMetadataTransaction(params: BuildCreateMetadataParams): Transaction {
  const mint = params.mint instanceof PublicKey ? params.mint : new PublicKey(params.mint)
  const updateAuthority =
    params.updateAuthority instanceof PublicKey ? params.updateAuthority : new PublicKey(params.updateAuthority)
  const metadata = getMetadataPda(mint)

  const ix = createCreateMetadataAccountV3Instruction(
    {
      metadata,
      mint,
      mintAuthority: updateAuthority,
      payer: params.payer,
      updateAuthority,
      systemProgram: SystemProgram.programId,
    },
    {
      createMetadataAccountArgsV3: {
        data: {
          name: params.name,
          symbol: params.symbol,
          uri: params.uri,
          sellerFeeBasisPoints: Math.max(0, Math.min(10000, params.sellerFeeBasisPoints ?? 0)),
          creators: null,
          collection: null,
          uses: null,
        },
        isMutable: true,
        collectionDetails: null,
      },
    },
    TOKEN_METADATA_PROGRAM_ID
  )
  return new Transaction().add(ix)
}

export interface BuildMintTransactionParams {
  mint: PublicKey | string
  destination: PublicKey | string
  authority: PublicKey | string
  amount: bigint
}

export function buildMintTransaction(params: BuildMintTransactionParams): Transaction {
  const mint = params.mint instanceof PublicKey ? params.mint : new PublicKey(params.mint)
  const destination = params.destination instanceof PublicKey ? params.destination : new PublicKey(params.destination)
  const authority = params.authority instanceof PublicKey ? params.authority : new PublicKey(params.authority)

  const ix = createMintToInstruction(mint, destination, authority, params.amount, [], TOKEN_PROGRAM_ID)
  return new Transaction().add(ix)
}

export interface BuildBurnTransactionParams {
  mint: PublicKey | string
  account: PublicKey | string
  authority: PublicKey | string
  amount: bigint
}

export function buildBurnTransaction(params: BuildBurnTransactionParams): Transaction {
  const mint = params.mint instanceof PublicKey ? params.mint : new PublicKey(params.mint)
  const account = params.account instanceof PublicKey ? params.account : new PublicKey(params.account)
  const authority = params.authority instanceof PublicKey ? params.authority : new PublicKey(params.authority)

  const ix = createBurnInstruction(account, mint, authority, params.amount, [], TOKEN_PROGRAM_ID)
  return new Transaction().add(ix)
}

export interface BuildUpdateMetadataTransactionParams {
  mint: PublicKey | string
  updateAuthority: PublicKey | string
  /** New name (required for update) */
  newName: string
  /** New symbol (required for update) */
  newSymbol: string
  /** New metadata URI (required for update) */
  newUri: string
  /** Royalty in basis points (0–10000). Default 0. */
  sellerFeeBasisPoints?: number
}

export function buildUpdateMetadataTransaction(params: BuildUpdateMetadataTransactionParams): Transaction {
  const mint = params.mint instanceof PublicKey ? params.mint : new PublicKey(params.mint)
  const updateAuthority =
    params.updateAuthority instanceof PublicKey
      ? params.updateAuthority
      : new PublicKey(params.updateAuthority)

  const metadata = getMetadataPda(mint)
  const sellerFeeBasisPoints = Math.max(0, Math.min(10000, params.sellerFeeBasisPoints ?? 0))

  const ix = createUpdateMetadataAccountV2Instruction(
    {
      metadata,
      updateAuthority,
    },
    {
      updateMetadataAccountArgsV2: {
        data: {
          name: params.newName,
          symbol: params.newSymbol,
          uri: params.newUri,
          sellerFeeBasisPoints,
          creators: null,
          collection: null,
          uses: null,
        },
        updateAuthority: null,
        primarySaleHappened: null,
        isMutable: null,
      },
    },
    TOKEN_METADATA_PROGRAM_ID
  )

  return new Transaction().add(ix)
}

export interface BuildCloseMintTransactionParams {
  mint: PublicKey | string
  authority: PublicKey | string
  /** Account to close (e.g. empty token account). Must have zero balance. */
  accountToClose: PublicKey | string
  /** Account to receive lamports from closed account */
  destination: PublicKey | string
}

export function buildCloseMintTransaction(params: BuildCloseMintTransactionParams): Transaction {
  const accountToClose = params.accountToClose instanceof PublicKey
    ? params.accountToClose
    : new PublicKey(params.accountToClose)
  const destination = params.destination instanceof PublicKey ? params.destination : new PublicKey(params.destination)
  const authority = params.authority instanceof PublicKey ? params.authority : new PublicKey(params.authority)

  const ix = createCloseAccountInstruction(
    accountToClose,
    destination,
    authority,
    [],
    TOKEN_PROGRAM_ID
  )
  return new Transaction().add(ix)
}
