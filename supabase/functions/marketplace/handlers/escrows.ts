import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { getSolanaConnection } from '../../_shared/solana-connection.ts'
import { toUint8Array } from '../../_shared/binary.ts'
import { PublicKey } from 'npm:@solana/web3.js@1'
import type { Connection } from 'npm:@solana/web3.js@1'
import type { getAdminClient } from '../../_shared/supabase-admin.ts'

type Db = ReturnType<typeof getAdminClient>

interface EscrowApiShape { publicKey: string; account: Record<string, unknown> }

function readPubkey(data: Uint8Array, offset: number): string { return new PublicKey(data.slice(offset, offset + 32)).toBase58() }
function readU64LE(data: Uint8Array, offset: number): string {
  const view = new DataView(data.buffer, data.byteOffset + offset, 8)
  return String((BigInt(view.getUint32(4, true)) << 32n) | BigInt(view.getUint32(0, true)))
}
function readF64LE(data: Uint8Array, offset: number): number { return new DataView(data.buffer, data.byteOffset + offset, 8).getFloat64(0, true) }
function readI16LE(data: Uint8Array, offset: number): number { return new DataView(data.buffer, data.byteOffset + offset, 2).getInt16(0, true) }
function readF32LE(data: Uint8Array, offset: number): number { return new DataView(data.buffer, data.byteOffset + offset, 4).getFloat32(0, true) }
function readI64LE(data: Uint8Array, offset: number): string {
  const view = new DataView(data.buffer, data.byteOffset + offset, 8)
  return String(BigInt.asIntN(64, (BigInt(view.getUint32(4, true)) << 32n) | BigInt(view.getUint32(0, true))))
}

function parseEscrowAccount(data: Uint8Array, pubkey: string): EscrowApiShape | null {
  const DISCRIMINATOR = 8
  const MIN_SIZE = DISCRIMINATOR + 32 + 32 + 32 + 8 + 8 + 8 + 2 + 4 + 8 + 1 + 1 + 1 + 8 + 32 + 1 + 1 + 1 + 32
  if (data.length < MIN_SIZE) return null
  let o = DISCRIMINATOR
  const maker = readPubkey(data, o); o += 32
  const depositToken = readPubkey(data, o); o += 32
  const requestToken = readPubkey(data, o); o += 32
  const tokensDepositInit = readU64LE(data, o); o += 8
  const tokensDepositRemaining = readU64LE(data, o); o += 8
  const price = readF64LE(data, o); o += 8
  const decimals = readI16LE(data, o); o += 2
  const slippage = readF32LE(data, o); o += 4
  const seed = readU64LE(data, o); o += 8
  o += 3 // bumps
  const expireTimestamp = readI64LE(data, o); o += 8
  const recipient = readPubkey(data, o); o += 32
  const onlyRecipient = data[o++] !== 0
  const onlyWhitelist = data[o++] !== 0
  const allowPartialFill = data[o++] !== 0
  const whitelist = readPubkey(data, o)
  return { publicKey: pubkey, account: { maker, depositToken, requestToken, tokensDepositInit, tokensDepositRemaining, price, decimals, slippage, seed, expireTimestamp, recipient, onlyRecipient, onlyWhitelist, allowPartialFill, whitelist } }
}

async function fetchEscrowsInScope(connection: Connection, scopeMints: string[]): Promise<EscrowApiShape[]> {
  const ESCROW_PROGRAM_ID = Deno.env.get('ESCROW_PROGRAM_ID') ?? 'esccxeEDYUXQaeMwq1ZwWAvJaHVYfsXNva13JYb2Chs'
  try {
    const programId = new PublicKey(ESCROW_PROGRAM_ID)
    const accounts = await connection.getProgramAccounts(programId)
    const scopeSet = new Set(scopeMints)
    const result: EscrowApiShape[] = []
    for (const { pubkey, account } of accounts) {
      const data = toUint8Array(account.data)
      const parsed = parseEscrowAccount(data, pubkey.toBase58())
      if (!parsed) continue
      if (!scopeSet.has(parsed.account.depositToken as string) || !scopeSet.has(parsed.account.requestToken as string)) continue
      result.push(parsed)
    }
    return result
  } catch { return [] }
}

export async function handleEscrows(body: Record<string, unknown>, db: Db, _authHeader: string | null, req: Request): Promise<Response> {
  const tenantId = body.tenantId as string
  const wallet = (body.wallet as string)?.trim() || null
  if (!tenantId) return errorResponse('tenantId required', req)

  const { data: scope } = await db.from('marketplace_mint_scope').select('mint, source, collection_mint').eq('tenant_id', tenantId)
  const scopeRows = scope ?? []
  const singleMints = scopeRows.filter((r) => r.source !== 'collection').map((r) => r.mint as string)
  const collectionMints = [...new Set(scopeRows.filter((r) => r.source === 'collection').map((r) => (r.collection_mint ?? r.mint) as string))]
  let scopeMints = [...singleMints]
  if (collectionMints.length > 0) {
    const { data: members } = await db.from('collection_members').select('mint').in('collection_mint', collectionMints)
    scopeMints = [...scopeMints, ...(members ?? []).map((r) => r.mint as string)]
  }
  if (scopeMints.length === 0) return jsonResponse({ escrows: [] }, req)

  const connection = getSolanaConnection()
  let escrows = await fetchEscrowsInScope(connection, scopeMints)
  if (wallet) escrows = escrows.filter((e) => (e.account.maker as string) === wallet)
  return jsonResponse({ escrows }, req)
}

export async function handleEscrow(body: Record<string, unknown>, _db: Db, _authHeader: string | null, req: Request): Promise<Response> {
  const escrowId = (body.escrowId as string)?.trim()
  if (!escrowId) return errorResponse('escrowId required', req)
  try {
    const connection = getSolanaConnection()
    const account = await connection.getAccountInfo(new PublicKey(escrowId))
    if (!account?.data) return jsonResponse({ escrow: null }, req)
    return jsonResponse({ escrow: parseEscrowAccount(toUint8Array(account.data), escrowId) }, req)
  } catch { return jsonResponse({ escrow: null }, req) }
}
