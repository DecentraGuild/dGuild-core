<template>
  <PageSection>
    <div class="ops flex flex-col gap-6">
      <header class="ops__header flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <Button type="button" variant="ghost" size="sm" class="-ml-2 mb-1 text-muted-foreground hover:text-foreground" @click="back">
            ← Back to OPS
          </Button>
          <h1 class="ops__title m-0 text-xl font-semibold text-foreground">
            Voucher: {{ truncateAddress(mint, 8, 6) }}
          </h1>
          <p class="ops__subtitle m-0 text-muted-foreground">
            <span class="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs font-medium">
              {{ detail?.type ?? '—' }}
            </span>
          </p>
        </div>
        <div class="flex flex-col md:flex-row gap-6 shrink-0">
          <div class="min-w-[140px] rounded-lg border border-border bg-card px-4 py-3">
            <span class="block text-xs text-muted-foreground">Our balance</span>
            <span class="text-xl font-semibold">
              {{ ourBalanceLoading ? '…' : formatRawTokenAmount(ourBalanceRaw, 0, 'NFT') }} tokens
            </span>
          </div>
        </div>
      </header>

      <Card v-if="loading" class="p-6">
        <p class="text-muted-foreground text-sm m-0">Loading voucher…</p>
      </Card>
      <Card v-else-if="error" class="p-6">
        <p class="text-destructive text-sm m-0">{{ error }}</p>
      </Card>
      <div v-else-if="detail" class="grid gap-4 grid-cols-1 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
        <Card aria-label="Token info">
          <CardHeader>
            <CardTitle>Token info</CardTitle>
          </CardHeader>
          <CardContent>
            <div v-if="editMetadata?.image" class="mb-4">
              <img
                :src="editMetadata.image"
                alt="Voucher"
                class="h-20 w-20 rounded-lg border border-border object-cover"
                @error="(e) => (e.currentTarget!.style.display = 'none')"
              />
            </div>
            <dl class="grid gap-4">
              <div>
                <dt class="text-xs text-muted-foreground">Mint</dt>
                <dd class="m-0 flex items-center gap-2">
                  <code class="font-mono text-xs break-all">{{ detail.voucher?.mint ?? mint }}</code>
                  <a
                    :href="explorerLinks.accountUrl(detail.voucher?.mint ?? mint)"
                    target="_blank"
                    rel="noopener"
                    class="shrink-0 text-muted-foreground hover:text-primary"
                    aria-label="View on Solscan"
                  >
                    <Icon icon="lucide:external-link" class="text-sm" />
                  </a>
                </dd>
              </div>
              <div v-if="detail.type === 'bundle'">
                <dt class="text-xs text-muted-foreground">Bundle</dt>
                <dd class="m-0">{{ detail.bundle?.label ?? detail.voucher?.bundle_id ?? '—' }}</dd>
              </div>
              <div v-if="detail.type === 'bundle'">
                <dt class="text-xs text-muted-foreground">Tokens required</dt>
                <dd class="m-0">{{ detail.voucher?.tokens_required ?? '—' }}</dd>
              </div>
              <div v-if="detail.type === 'individual'">
                <dt class="text-xs text-muted-foreground">Label</dt>
                <dd class="m-0">{{ detail.voucher?.label ?? '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted-foreground">Max redemptions per tenant</dt>
                <dd class="m-0">{{ detail.voucher?.max_redemptions_per_tenant ?? 'Unlimited' }}</dd>
              </div>
              <div v-if="detail.type === 'individual' && detail.entitlements?.length">
                <dt class="text-xs text-muted-foreground">Entitlements</dt>
                <dd class="m-0">
                  <ul class="list-none p-0 m-0 space-y-1">
                    <li v-for="e in detail.entitlements" :key="e.meter_key" class="text-sm">
                      {{ e.meter_key }}: {{ e.quantity }} × {{ e.duration_days }}d
                    </li>
                  </ul>
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card aria-label="Actions">
          <CardHeader>
            <CardTitle>Actions</CardTitle>
            <CardDescription>Mint, burn, edit, or close voucher token accounts.</CardDescription>
          </CardHeader>
          <CardContent class="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" :disabled="mintLoading" @click="mintDialogOpen = true">
              {{ mintLoading ? 'Minting…' : 'Mint' }}
            </Button>
            <Button
              size="sm"
              variant="outline"
              :disabled="burnLoading || ourBalanceRaw === '0'"
              @click="burnDialogOpen = true"
            >
              {{ burnLoading ? 'Burning…' : 'Burn' }}
            </Button>
            <Button size="sm" variant="outline" @click="editExpanded = !editExpanded">
              {{ editExpanded ? 'Hide edit' : 'Edit' }}
            </Button>
            <Button
              size="sm"
              variant="outline"
              :disabled="closeLoading || ourBalanceRaw !== '0'"
              :title="ourBalanceRaw !== '0' ? 'Close only works for empty token accounts' : 'Close empty token account to reclaim rent'"
              @click="openClose"
            >
              {{ closeLoading ? 'Closing…' : 'Close' }}
            </Button>
          </CardContent>
        </Card>

        <Dialog :open="mintDialogOpen" @update:open="(v: boolean) => (mintDialogOpen = v)">
          <DialogContent class="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Mint tokens</DialogTitle>
              <DialogDescription>Mint voucher tokens to the voucher wallet.</DialogDescription>
            </DialogHeader>
            <form class="space-y-4" @submit.prevent="confirmMint">
              <div class="space-y-2">
                <label for="mint-amount" class="text-sm font-medium">Amount</label>
                <Input
                  id="mint-amount"
                  v-model.number="mintAmount"
                  type="number"
                  min="1"
                  required
                  class="max-w-[8rem]"
                />
              </div>
              <DialogFooter :show-close-button="true">
                <Button type="submit" size="sm" :disabled="mintLoading || !mintAmount || mintAmount < 1">
                  {{ mintLoading ? 'Minting…' : 'Mint' }}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog :open="burnDialogOpen" @update:open="(v: boolean) => (burnDialogOpen = v)">
          <DialogContent class="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Burn tokens</DialogTitle>
              <DialogDescription>Burn tokens from your wallet. Max: {{ formatRawTokenAmount(ourBalanceRaw, 0, 'NFT') }}.</DialogDescription>
            </DialogHeader>
            <form class="space-y-4" @submit.prevent="confirmBurn">
              <div class="space-y-2">
                <label for="burn-amount" class="text-sm font-medium">Amount</label>
                <Input
                  id="burn-amount"
                  v-model.number="burnAmount"
                  type="number"
                  :min="1"
                  :max="parseInt(ourBalanceRaw, 10) || 1"
                  required
                  class="max-w-[8rem]"
                />
              </div>
              <DialogFooter :show-close-button="true">
                <Button type="submit" size="sm" :disabled="burnLoading || !burnAmount || burnAmount < 1 || burnAmount > parseInt(ourBalanceRaw, 10)">
                  {{ burnLoading ? 'Burning…' : 'Burn' }}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Card v-if="editExpanded" class="col-span-full" aria-label="Edit voucher">
          <CardHeader>
            <CardTitle>Edit voucher</CardTitle>
            <CardDescription>
              Name and symbol update on-chain metadata. Config (tokens required, entitlements, max redemptions) updates DB only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OpsVoucherEditForm
              v-if="detail"
              :voucher="{ mint: detail.voucher?.mint ?? mint, type: detail.type, bundleId: detail.voucher?.bundle_id, label: detail.voucher?.label }"
              :bundle-label="detail.type === 'bundle' ? (detail.bundle?.label ?? '') : ''"
              :initial-name="editMetadata?.name ?? ''"
              :initial-symbol="editMetadata?.symbol ?? ''"
              :initial-image-url="editMetadata?.image ?? ''"
              :initial-seller-fee-basis-points="editMetadata?.sellerFeeBasisPoints ?? 0"
              :initial-tokens-required="detail.voucher?.tokens_required ?? 1"
              :initial-label="detail.voucher?.label ?? ''"
              :initial-entitlements="detail.entitlements ?? []"
              :initial-max-redemptions="detail.voucher?.max_redemptions_per_tenant ?? null"
              :meters="meters"
              :saving="editSaving"
              :error="editError"
              @save="saveEdit"
            />
          </CardContent>
        </Card>

        <Card class="col-span-full" aria-label="Redemptions">
          <CardHeader>
            <CardTitle>Redemptions</CardTitle>
            <CardDescription>Who has used this voucher.</CardDescription>
          </CardHeader>
          <CardContent>
            <div v-if="!detail.redemptions?.length" class="text-muted-foreground text-sm">
              No redemptions yet.
            </div>
            <div v-else class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-border">
                    <th class="h-9 px-4 text-left font-medium">Tenant</th>
                    <th class="h-9 px-4 text-left font-medium">Payer</th>
                    <th class="h-9 px-4 text-left font-medium">Quantity</th>
                    <th class="h-9 px-4 text-left font-medium">Redeemed</th>
                    <th class="h-9 px-4 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="r in detail.redemptions"
                    :key="`${r.tenant_id}-${r.redeemed_at}-${r.payer_wallet}`"
                    class="border-b border-border/50"
                  >
                    <td class="p-4 font-mono text-xs">{{ r.tenant_id }}</td>
                    <td class="p-4">
                      <a
                        v-if="r.payer_wallet"
                        :href="explorerLinks.accountUrl(r.payer_wallet)"
                        target="_blank"
                        rel="noopener"
                        class="font-mono text-xs text-primary hover:underline"
                      >
                        {{ truncateAddress(r.payer_wallet, 6, 4) }}
                      </a>
                      <span v-else class="text-muted-foreground">—</span>
                    </td>
                    <td class="p-4">{{ r.quantity }}</td>
                    <td class="p-4">{{ formatDate(r.redeemed_at) }}</td>
                    <td class="p-4">{{ r.status ?? '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card class="col-span-full" aria-label="Current holders">
          <CardHeader>
            <CardTitle>Current holders</CardTitle>
            <CardDescription>On-chain token accounts with balance.</CardDescription>
          </CardHeader>
          <CardContent>
            <div v-if="holdersLoading" class="text-muted-foreground text-sm">Loading holders…</div>
            <div v-else-if="!holders.length" class="text-muted-foreground text-sm">
              No holders.
            </div>
            <div v-else class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-border">
                    <th class="h-9 px-4 text-left font-medium">Wallet</th>
                    <th class="h-9 px-4 text-left font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="h in holders"
                    :key="h.owner"
                    class="border-b border-border/50"
                  >
                    <td class="p-4">
                      <a
                        :href="explorerLinks.accountUrl(h.owner)"
                        target="_blank"
                        rel="noopener"
                        class="font-mono text-xs text-primary hover:underline"
                      >
                        {{ truncateAddress(h.owner, 8, 6) }}
                      </a>
                    </td>
                    <td class="p-4">{{ formatRawTokenAmount(h.amount, 0, 'NFT') }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </PageSection>
</template>

<script setup lang="ts">
definePageMeta({ title: 'Voucher detail' })

import { PublicKey, Transaction } from '@solana/web3.js'
import {
  getAssociatedTokenAddressSync,
  getAccount,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { formatRawTokenAmount, truncateAddress } from '@decentraguild/display'
import { formatDate } from '@decentraguild/core'
import { Icon } from '@iconify/vue'
import {
  createConnection,
  buildMintTransaction,
  buildBurnTransaction,
  buildCloseMintTransaction,
  buildUpdateMetadataTransaction,
  sendAndConfirmTransaction,
  getEscrowWalletFromConnector,
  fetchMintMetadataFromChain,
} from '@decentraguild/web3'
import { useAuth } from '@decentraguild/auth'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { useSupabase } from '~/composables/useSupabase'
import { useRpc } from '~/composables/useRpc'
import { useExplorerLinks } from '~/composables/useExplorerLinks'
import { useTransactionNotificationsStore } from '~/stores/transactionNotifications'
import OpsVoucherEditForm from '~/components/ops/OpsVoucherEditForm.vue'

const VOUCHER_WALLET = '89s4gjt2STRy83XQrxmYrWRkQBH3CL228BRVs6Qbed2Q'

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const explorerLinks = useExplorerLinks()
const toastStore = useTransactionNotificationsStore()

const mint = computed(() => route.params.mint as string)

interface VoucherDetail {
  type: 'bundle' | 'individual'
  voucher: {
    mint: string
    bundle_id?: string
    tokens_required?: number
    label?: string | null
    max_redemptions_per_tenant?: number | null
  }
  bundle?: { id: string; label: string; product_key: string } | null
  entitlements?: Array<{ meter_key: string; quantity: number; duration_days: number }>
  redemptions: Array<{
    tenant_id: string
    voucher_mint: string
    bundle_id?: string
    quantity: number
    redeemed_at: string
    payer_wallet: string | null
    status: string | null
  }>
}

const detail = ref<VoucherDetail | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const ourBalanceRaw = ref<string>('0')
const ourBalanceLoading = ref(true)
const holders = ref<Array<{ owner: string; amount: string }>>([])
const holdersLoading = ref(true)
const editExpanded = ref(false)
const editSaving = ref(false)
const editError = ref<string | null>(null)
const editMetadata = ref<{ name: string; symbol: string; image: string | null; sellerFeeBasisPoints: number | null } | null>(null)
const mintLoading = ref(false)
const burnLoading = ref(false)
const closeLoading = ref(false)
const mintDialogOpen = ref(false)
const burnDialogOpen = ref(false)
const mintAmount = ref(1)
const burnAmount = ref(1)

const meters = ref<Array<{ meter_key: string; product_key: string }>>([])

async function loadDetail() {
  if (!mint.value) return
  loading.value = true
  error.value = null
  try {
    const supabase = useSupabase()
    const { data, err } = await supabase.functions.invoke('platform', {
      body: { action: 'voucher-detail', mint: mint.value },
    })
    if (err) throw new Error(err.message)
    if (!data) throw new Error('No data')
    detail.value = data as VoucherDetail
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load voucher'
  } finally {
    loading.value = false
  }
}

async function loadOurBalance() {
  if (!mint.value) return
  const wallet = auth.wallet.value
  const rpcUrl = useRpc().rpcUrl.value
  if (!wallet || !rpcUrl) {
    ourBalanceRaw.value = '0'
    ourBalanceLoading.value = false
    return
  }
  ourBalanceLoading.value = true
  try {
    const walletAddr = typeof wallet === 'string' ? wallet : (wallet as { toBase58?: () => string })?.toBase58?.()
    if (!walletAddr) {
      ourBalanceRaw.value = '0'
      return
    }
    const connection = createConnection(rpcUrl)
    const mintPk = new PublicKey(mint.value)
    const ownerPk = new PublicKey(walletAddr)
    const ata = getAssociatedTokenAddressSync(mintPk, ownerPk)
    const balance = await connection.getTokenAccountBalance(ata)
    ourBalanceRaw.value = balance.value.amount
  } catch {
    ourBalanceRaw.value = '0'
  } finally {
    ourBalanceLoading.value = false
  }
}

async function loadHolders() {
  if (!mint.value) return
  holdersLoading.value = true
  try {
    const supabase = useSupabase()
    const { data, err } = await supabase.functions.invoke('platform', {
      body: { action: 'voucher-holders', mint: mint.value },
    })
    if (err) throw new Error(err.message)
    holders.value = (data as { holders?: Array<{ owner: string; amount: string }> }).holders ?? []
  } catch {
    holders.value = []
  } finally {
    holdersLoading.value = false
  }
}

async function loadMeters() {
  try {
    const supabase = useSupabase()
    const { data, err } = await supabase.functions.invoke('platform', {
      body: { action: 'meters-list' },
    })
    if (err) return
    meters.value = (data as { meters?: Array<{ meter_key: string; product_key: string }> }).meters ?? []
  } catch {
    meters.value = []
  }
}

async function confirmMint() {
  const amount = Math.max(1, Math.floor(mintAmount.value) || 1)
  if (!mint.value) return
  const wallet = getEscrowWalletFromConnector()
  const rpcUrl = useRpc().rpcUrl.value
  if (!wallet?.publicKey || !rpcUrl) {
    toastStore.add(`voucher-mint-${Date.now()}`, { status: 'error', message: 'Connect wallet and ensure RPC is configured' })
    return
  }
  mintDialogOpen.value = false
  mintLoading.value = true
  const toastId = `voucher-mint-${mint.value}-${Date.now()}`
  toastStore.add(toastId, { status: 'pending', message: 'Minting…' })
  try {
    const connection = createConnection(rpcUrl)
    const mintPk = new PublicKey(mint.value)
    const destOwner = new PublicKey(VOUCHER_WALLET)
    const destAta = getAssociatedTokenAddressSync(mintPk, destOwner)
    const instructions: Parameters<Transaction['add']>[0][] = []
    try {
      await getAccount(connection, destAta)
    } catch {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          destAta,
          destOwner,
          mintPk,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      )
    }
    const mintTx = buildMintTransaction({
      mint: mintPk,
      destination: destAta,
      authority: wallet.publicKey,
      amount: BigInt(amount),
    })
    const tx = new Transaction()
    tx.add(...instructions, ...mintTx.instructions)
    const sig = await sendAndConfirmTransaction(connection, tx, wallet, wallet.publicKey)
    toastStore.add(toastId, { status: 'success', message: `Minted ${amount} token${amount > 1 ? 's' : ''} to voucher wallet`, signature: sig })
    await Promise.all([loadOurBalance(), loadHolders()])
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Mint failed'
    toastStore.add(toastId, { status: 'error', message: msg })
  } finally {
    mintLoading.value = false
  }
}

async function confirmBurn() {
  const amount = Math.max(1, Math.floor(burnAmount.value) || 1)
  if (!mint.value) return
  const wallet = getEscrowWalletFromConnector()
  const rpcUrl = useRpc().rpcUrl.value
  if (!wallet?.publicKey || !rpcUrl) {
    toastStore.add(`voucher-burn-${Date.now()}`, { status: 'error', message: 'Connect wallet and ensure RPC is configured' })
    return
  }
  const bal = BigInt(ourBalanceRaw.value)
  if (bal === 0n) {
    toastStore.add(`voucher-burn-${Date.now()}`, { status: 'error', message: 'No balance to burn' })
    return
  }
  if (BigInt(amount) > bal) {
    toastStore.add(`voucher-burn-${Date.now()}`, { status: 'error', message: 'Amount exceeds balance' })
    return
  }
  burnDialogOpen.value = false
  burnLoading.value = true
  const toastId = `voucher-burn-${mint.value}-${Date.now()}`
  toastStore.add(toastId, { status: 'pending', message: 'Burning…' })
  try {
    const connection = createConnection(rpcUrl)
    const ata = getAssociatedTokenAddressSync(new PublicKey(mint.value), wallet.publicKey)
    const tx = buildBurnTransaction({
      mint: mint.value,
      account: ata,
      authority: wallet.publicKey,
      amount: BigInt(amount),
    })
    const sig = await sendAndConfirmTransaction(connection, tx, wallet, wallet.publicKey)
    toastStore.add(toastId, { status: 'success', message: `Burned ${amount} token${amount > 1 ? 's' : ''}`, signature: sig })
    await Promise.all([loadOurBalance(), loadHolders()])
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Burn failed'
    toastStore.add(toastId, { status: 'error', message: msg })
  } finally {
    burnLoading.value = false
  }
}

async function openClose() {
  if (!mint.value) return
  const wallet = getEscrowWalletFromConnector()
  const rpcUrl = useRpc().rpcUrl.value
  if (!wallet?.publicKey || !rpcUrl) {
    toastStore.add(`voucher-close-${Date.now()}`, { status: 'error', message: 'Connect wallet and ensure RPC is configured' })
    return
  }
  if (BigInt(ourBalanceRaw.value) !== 0n) {
    toastStore.add(`voucher-close-${Date.now()}`, { status: 'error', message: 'Close only works for empty token accounts. Burn or transfer first.' })
    return
  }
  closeLoading.value = true
  const toastId = `voucher-close-${mint.value}-${Date.now()}`
  toastStore.add(toastId, { status: 'pending', message: 'Closing account…' })
  try {
    const connection = createConnection(rpcUrl)
    const ata = getAssociatedTokenAddressSync(new PublicKey(mint.value), wallet.publicKey)
    try {
      await getAccount(connection, ata)
    } catch {
      toastStore.add(toastId, { status: 'error', message: 'No token account to close' })
      closeLoading.value = false
      return
    }
    const tx = buildCloseMintTransaction({
      mint: mint.value,
      authority: wallet.publicKey,
      accountToClose: ata,
      destination: wallet.publicKey,
    })
    const sig = await sendAndConfirmTransaction(connection, tx, wallet, wallet.publicKey)
    toastStore.add(toastId, { status: 'success', message: 'Account closed, rent reclaimed', signature: sig })
    await Promise.all([loadOurBalance(), loadHolders()])
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Close failed'
    toastStore.add(toastId, { status: 'error', message: msg })
  } finally {
    closeLoading.value = false
  }
}

async function saveEdit(payload: {
  name?: string
  symbol?: string
  imageUrl?: string
  sellerFeeBasisPoints?: number | null
  tokensRequired?: number
  label?: string
  maxRedemptionsPerTenant?: number | null
  entitlements?: Array<{ meter_key: string; quantity: number; duration_days: number }>
}) {
  if (!detail.value?.voucher?.mint) return
  editSaving.value = true
  editError.value = null
  try {
    const mintAddr = detail.value.voucher.mint
    const wallet = getEscrowWalletFromConnector()
    const rpcUrl = useRpc().rpcUrl.value
    const supabase = useSupabase()

    const metadataChanged =
      (payload.name !== undefined && payload.name !== (editMetadata.value?.name ?? '')) ||
      (payload.symbol !== undefined && payload.symbol !== (editMetadata.value?.symbol ?? '')) ||
      (payload.imageUrl !== undefined && payload.imageUrl !== (editMetadata.value?.image ?? ''))

    const resolvedName = (payload.name ?? editMetadata.value?.name ?? '').trim()
    const resolvedSymbol = (payload.symbol ?? editMetadata.value?.symbol ?? '').trim()
    if (metadataChanged && resolvedName && resolvedSymbol && wallet?.publicKey && rpcUrl) {
      const sellerFeeBasisPoints = Math.max(
        0,
        Math.min(10000, payload.sellerFeeBasisPoints ?? editMetadata.value?.sellerFeeBasisPoints ?? 0)
      )
      const { data: metaData, error: metaErr } = await supabase.functions.invoke('platform', {
        body: {
          action: 'voucher-prepare-metadata',
          name: resolvedName,
          symbol: resolvedSymbol,
          imageUrl: payload.imageUrl?.trim() || undefined,
          sellerFeeBasisPoints,
          voucherType: detail.value.type,
          bundleId: detail.value.type === 'bundle' ? detail.value?.bundle?.id ?? detail.value.voucher?.bundle_id : undefined,
        },
      })
      if (metaErr) throw new Error(metaErr.message ?? 'Failed to prepare metadata')
      const metadataUri = (metaData as { metadataUri?: string })?.metadataUri
      if (!metadataUri?.trim()) throw new Error('No metadata URI returned')
      const connection = createConnection(rpcUrl)
      const tx = buildUpdateMetadataTransaction({
        mint: mintAddr,
        updateAuthority: wallet.publicKey,
        newName: resolvedName,
        newSymbol: resolvedSymbol,
        newUri: metadataUri.trim(),
        sellerFeeBasisPoints,
      })
      await sendAndConfirmTransaction(connection, tx, wallet, wallet.publicKey)
    }

    if (detail.value.type === 'bundle') {
      const { err } = await supabase.functions.invoke('platform', {
        body: {
          action: 'bundle-voucher-update',
          mint: mintAddr,
          tokensRequired: payload.tokensRequired,
          maxRedemptionsPerTenant: payload.maxRedemptionsPerTenant ?? undefined,
        },
      })
      if (err) throw new Error(err.message)
    } else {
      const { err } = await supabase.functions.invoke('platform', {
        body: {
          action: 'individual-voucher-update',
          mint: mintAddr,
          label: payload.label,
          maxRedemptionsPerTenant: payload.maxRedemptionsPerTenant ?? undefined,
          entitlements: payload.entitlements,
        },
      })
      if (err) throw new Error(err.message)
    }
    editExpanded.value = false
    editMetadata.value = null
    await loadDetail()
  } catch (e) {
    editError.value = e instanceof Error ? e.message : 'Failed to save'
  } finally {
    editSaving.value = false
  }
}

function back() {
  if (history.length > 1) {
    router.back()
  } else {
    router.push('/ops')
  }
}

watch(
  mint,
  async (m) => {
    if (m) {
      await Promise.all([loadDetail(), loadMeters()])
    }
  },
  { immediate: true }
)

watch(mintDialogOpen, (open) => {
  if (open) mintAmount.value = 1
})
watch(burnDialogOpen, (open) => {
  if (open) burnAmount.value = Math.min(1, parseInt(ourBalanceRaw.value, 10) || 1)
})

watch(
  [detail, mint],
  async ([d, m]) => {
    if (d && m) {
      const rpcUrl = useRpc().rpcUrl.value
      if (!rpcUrl) return
      try {
        const connection = createConnection(rpcUrl)
        const meta = await fetchMintMetadataFromChain(connection, m)
        editMetadata.value = {
          name: meta.name ?? '',
          symbol: meta.symbol ?? '',
          image: meta.image ?? null,
          sellerFeeBasisPoints: meta.sellerFeeBasisPoints ?? null,
        }
      } catch {
        editMetadata.value = { name: '', symbol: '', image: null, sellerFeeBasisPoints: null }
      }
    } else {
      editMetadata.value = null
    }
  }
)

watch(
  [detail, () => auth.wallet.value],
  () => {
    if (detail.value && mint.value) {
      loadOurBalance()
      loadHolders()
    }
  },
  { immediate: true }
)
</script>
