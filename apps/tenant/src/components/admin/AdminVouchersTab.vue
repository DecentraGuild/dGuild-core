<template>
  <div class="admin__split">
    <div class="admin__panel">
      <Card>
        <h3>Redeem Vouchers</h3>
        <p v-if="!hasRpc" class="admin__vouchers-rpc-hint">
          Add NUXT_PUBLIC_HELIUS_RPC to your .env to redeem vouchers.
        </p>
        <p v-else-if="!walletAddress" class="admin__vouchers-wallet-hint">
          Connect your wallet to see and redeem vouchers.
        </p>
        <div v-else-if="loading" class="admin__billing-loading">
          <Icon icon="lucide:loader-2" class="admin__spinner" />
          <span>Loading vouchers...</span>
        </div>
        <div v-else-if="redeemableVouchers.length === 0" class="admin__billing-empty">
          No vouchers to redeem. You need to hold voucher tokens in your wallet.
        </div>
        <div v-else class="admin__vouchers-grid">
          <div
            v-for="v in redeemableVouchers"
            :key="v.mint"
            class="admin__voucher-card"
          >
            <div class="admin__voucher-card-body">
              <div class="admin__voucher-label">
                {{ v.label || truncateMint(v.mint) }}
              </div>
              <ul class="admin__voucher-entitlements">
                <li v-for="(e, i) in v.entitlements" :key="i">
                  {{ formatEntitlement(e) }}
                </li>
              </ul>
              <div class="admin__voucher-balance">
                Balance: {{ formatRawTokenAmount(String(v.balance), 0, 'NFT') }} ({{ formatRawTokenAmount(String(v.tokensRequired), 0, 'NFT') }} required)
              </div>
              <div
                v-if="hasSlugEntitlement(v) && !tenantSlug"
                class="admin__voucher-slug-claim"
              >
                <label class="admin__voucher-slug-label">Claim slug with this voucher</label>
                <div class="admin__voucher-slug-row">
                  <input
                    :value="desiredSlugByMint[v.mint] ?? ''"
                    type="text"
                    class="admin__voucher-slug-input"
                    placeholder="e.g. my-community"
                    @input="(e) => setDesiredSlug(v.mint, (e.target as HTMLInputElement).value)"
                    @blur="checkSlugForMint(v.mint)"
                  >
                  <Button
                    variant="secondary"
                    size="sm"
                    :disabled="slugCheckingMint === v.mint || !(desiredSlugByMint[v.mint] ?? '').trim()"
                    class="admin__slug-check-btn"
                    :title="slugStatusByMint[v.mint] === 'available' ? 'Available' : (slugStatusByMint[v.mint] === 'taken' ? 'Taken' : 'Check availability')"
                    @click="checkSlugForMint(v.mint)"
                  >
                    <Icon v-if="slugCheckingMint === v.mint" icon="lucide:loader-2" class="admin__spinner admin__spinner--inline" />
                    <Icon v-else-if="slugStatusByMint[v.mint] === 'available'" icon="lucide:check-circle" class="admin__slug-check-icon admin__slug-check-icon--success" />
                    <Icon v-else-if="slugStatusByMint[v.mint] === 'taken'" icon="lucide:x-circle" class="admin__slug-check-icon admin__slug-check-icon--taken" />
                    <Icon v-else icon="lucide:check" />
                  </Button>
                </div>
                <p v-if="(desiredSlugByMint[v.mint] ?? '').trim() && slugStatusByMint[v.mint] === 'available'" class="admin__slug-available-hint">
                  Available. Redeem to claim.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              :disabled="redeemingMint === v.mint || (hasSlugEntitlement(v) && !tenantSlug && slugStatusByMint[v.mint] !== 'available')"
              @click="redeem(v)"
            >
              <Icon v-if="redeemingMint === v.mint" icon="lucide:loader-2" class="admin__spinner admin__spinner--inline" />
              <span v-else>Redeem</span>
            </Button>
          </div>
        </div>
      </Card>
    </div>
    <div aria-hidden="true" />
  </div>
</template>

<script setup lang="ts">
import { Card } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { Icon } from '@iconify/vue'
import { useTenantStore } from '~/stores/tenant'
import { useSupabase } from '~/composables/core/useSupabase'
import { useAuth } from '@decentraguild/auth'
import { useRpc } from '@decentraguild/nuxt-composables'
import { useSolanaConnection } from '~/composables/core/useSolanaConnection'
import { fetchWalletTokenBalances } from '~/composables/core/useWalletTokenBalances'
import {
  buildVoucherTransfer,
  sendAndConfirmTransaction,
  getEscrowWalletFromConnector,
  getConnectorState,
  isBackpackConnector,
} from '@decentraguild/web3'
import { useTransactionNotificationsStore } from '~/stores/transactionNotifications'
import { getEdgeFunctionErrorMessageAsync } from '~/utils/edgeFunctionError'
import { formatRawTokenAmount } from '@decentraguild/display'

const tenantStore = useTenantStore()
const tenantSlug = computed(() => tenantStore.tenant?.slug ?? null)
const tenantId = computed(() => tenantStore.tenantId)
const supabase = useSupabase()
const auth = useAuth()
const { rpcUrl, hasRpc } = useRpc()
const { connection } = useSolanaConnection()
const txNotifications = useTransactionNotificationsStore()

const walletAddress = computed(() => auth.wallet.value ?? null)

interface VoucherEntitlement {
  meter_key: string
  quantity: number
  duration_days: number
}

interface VoucherDef {
  mint: string
  type: 'bundle' | 'individual'
  bundleId?: string
  label?: string | null
  tokensRequired: number
  entitlements: VoucherEntitlement[]
}

interface RedeemableVoucher extends VoucherDef {
  balance: number
}

const vouchers = ref<VoucherDef[]>([])
const balancesByMint = ref<Map<string, number>>(new Map())
const loading = ref(false)
const redeemingMint = ref<string | null>(null)
const desiredSlugByMint = ref<Record<string, string>>({})
const slugStatusByMint = ref<Record<string, 'idle' | 'checking' | 'available' | 'taken'>>({})
const slugCheckingMint = ref<string | null>(null)

function hasSlugEntitlement(v: VoucherDef): boolean {
  return v.entitlements.some((e) => e.meter_key === 'slug')
}

function setDesiredSlug(mint: string, value: string) {
  desiredSlugByMint.value = { ...desiredSlugByMint.value, [mint]: value }
}

async function checkSlugForMint(mint: string) {
  const s = (desiredSlugByMint.value[mint] ?? '').trim().toLowerCase()
  if (!s) return
  slugCheckingMint.value = mint
  slugStatusByMint.value[mint] = 'checking'
  try {
    const { data } = await supabase
      .from('tenant_config')
      .select('id')
      .eq('slug', s)
      .maybeSingle()
    slugStatusByMint.value = { ...slugStatusByMint.value, [mint]: data ? 'taken' : 'available' }
  } catch {
    slugStatusByMint.value = { ...slugStatusByMint.value, [mint]: 'idle' }
  } finally {
    slugCheckingMint.value = null
  }
}

const redeemableVouchers = computed((): RedeemableVoucher[] => {
  return vouchers.value
    .map((v) => {
      const bal = balancesByMint.value.get(v.mint) ?? 0
      return { ...v, balance: bal }
    })
    .filter((v) => v.balance >= v.tokensRequired)
})

const METER_LABELS: Record<string, string> = {
  mints_current: 'Current holders',
  mints_snapshot: 'Snapshot',
  mints_transactions: 'Transactions',
  mints_count: 'Mints',
  custom_currencies: 'Currencies',
  monetize_storefront: 'Storefront',
  raffle_slots: 'Raffle slots',
  raffle_hosting: 'Raffle hosting',
  gate_lists: 'Gate lists',
  crafter_tokens: 'Crafter tokens',
  registration: 'Registration',
  slug: 'Custom slug',
  recipients_count: 'Recipients',
}

function formatEntitlement(e: VoucherEntitlement): string {
  const label = METER_LABELS[e.meter_key] ?? e.meter_key
  const duration = e.duration_days > 0 ? `, ${e.duration_days} days` : ''
  return `${e.quantity} ${label}${duration}`
}

function truncateMint(mint: string): string {
  if (mint.length <= 12) return mint
  return `${mint.slice(0, 6)}...${mint.slice(-6)}`
}

async function load() {
  loading.value = true
  try {
    const { data, error } = await supabase.functions.invoke('billing', {
      body: { action: 'list-voucher-mints' },
    })
    if (error) throw new Error(error.message ?? 'Failed to list vouchers')
    const list = (data as { vouchers?: VoucherDef[] })?.vouchers ?? []
    vouchers.value = list

    if (walletAddress.value && rpcUrl.value && list.length > 0) {
      const mints = new Set(list.map((v) => v.mint))
      const balances = await fetchWalletTokenBalances(
        rpcUrl.value,
        walletAddress.value,
        mints,
        { skipCache: true },
      )
      const map = new Map<string, number>()
      for (const b of balances) {
        const ui = b.uiAmount ?? 0
        map.set(b.mint, ui)
      }
      balancesByMint.value = map
    } else {
      balancesByMint.value = new Map()
    }
  } catch {
    vouchers.value = []
    balancesByMint.value = new Map()
  } finally {
    loading.value = false
  }
}

const TX_STATUS_LABELS: Record<string, string> = {
  signing: 'Signing...',
  sending: 'Sending...',
  confirming: 'Confirming...',
}

async function redeem(v: RedeemableVoucher) {
  const id = tenantId.value
  if (!id) return
  const wallet = getEscrowWalletFromConnector()
  if (!wallet?.publicKey) {
    return
  }
  if (!connection.value || !rpcUrl.value) return

  redeemingMint.value = v.mint
  const notificationId = `voucher-${Date.now()}`
  try {
    const { data: quoteData, error: quoteErr } = await supabase.functions.invoke('billing', {
      body: {
        action: 'voucher-quote',
        tenantId: id,
        voucherMint: v.mint,
      },
    })
    if (quoteErr) throw new Error(await getEdgeFunctionErrorMessageAsync(quoteErr, 'Quote failed'))
    const quote = quoteData as {
      quoteId?: string
      memo?: string
      voucherRecipientAta?: string
      voucherWallet?: string
      tokensRequired?: number
    }
    if (!quote?.quoteId || !quote?.memo || !quote?.voucherRecipientAta) {
      throw new Error('Invalid quote response')
    }
    const tokensRequired = quote.tokensRequired ?? v.tokensRequired
    const voucherWallet = quote.voucherWallet ?? '89s4gjt2STRy83XQrxmYrWRkQBH3CL228BRVs6Qbed2Q'

    const { data: chargeData, error: chargeErr } = await supabase.functions.invoke('billing', {
      body: {
        action: 'charge',
        quoteId: quote.quoteId,
        payerWallet: wallet.publicKey.toBase58(),
        paymentMethod: 'voucher',
        voucherMint: v.mint,
      },
    })
    if (chargeErr) throw new Error(await getEdgeFunctionErrorMessageAsync(chargeErr, 'Charge failed'))
    const charge = chargeData as { paymentId?: string }
    if (!charge?.paymentId) throw new Error('Invalid charge response')

    txNotifications.add(notificationId, {
      status: 'pending',
      message: 'Redeem voucher. Confirm the transaction in your wallet.',
      signature: null,
    })

    const connectorId = getConnectorState().connectorId
    const tx = await buildVoucherTransfer({
      payer: wallet.publicKey,
      mint: v.mint,
      amount: tokensRequired,
      decimals: 0,
      recipientAta: quote.voucherRecipientAta,
      recipientOwner: voucherWallet,
      memo: quote.memo,
      connection: connection.value,
      instructionOrder: isBackpackConnector(connectorId) ? 'memoFirst' : 'transferFirst',
    })

    const txSignature = await sendAndConfirmTransaction(
      connection.value,
      tx,
      wallet,
      wallet.publicKey,
      {
        onStatus: (s) => {
          const label = TX_STATUS_LABELS[s] ?? s
          txNotifications.update(notificationId, {
            status: 'pending',
            message: `Redeem: ${label}`,
          })
        },
      },
    )

    txNotifications.update(notificationId, {
      status: 'success',
      message: 'Voucher redeemed',
      signature: txSignature,
    })

    const slugToClaim =
      hasSlugEntitlement(v) && !tenantSlug.value && slugStatusByMint.value[v.mint] === 'available'
        ? (desiredSlugByMint.value[v.mint] ?? '').trim().toLowerCase()
        : undefined

    const confirmBody: Record<string, unknown> = {
      action: 'confirm',
      paymentId: charge.paymentId,
      txSignature,
    }
    if (slugToClaim) confirmBody.slugToClaim = slugToClaim

    const { data: confirmData, error: confirmErr } = await supabase.functions.invoke('billing', {
      body: confirmBody,
    })
    if (confirmErr) throw new Error(await getEdgeFunctionErrorMessageAsync(confirmErr, 'Confirm failed'))
    const confirm = confirmData as { success?: boolean }
    if (!confirm?.success) throw new Error('Confirmation failed')

    if (slugToClaim) {
      tenantStore.refetchTenantContext()
      desiredSlugByMint.value = { ...desiredSlugByMint.value, [v.mint]: '' }
      slugStatusByMint.value = { ...slugStatusByMint.value, [v.mint]: 'idle' }
    }
    await load()
  } catch (e) {
    txNotifications.update(notificationId, {
      status: 'error',
      message: e instanceof Error ? e.message : 'Redeem failed',
    })
    throw e
  } finally {
    redeemingMint.value = null
  }
}

watch(
  [tenantId, walletAddress, rpcUrl],
  () => {
    if (tenantId.value && (walletAddress.value || !hasRpc.value)) load()
  },
  { immediate: true },
)

defineExpose({ load })
</script>

<style scoped>
.admin__vouchers-rpc-hint,
.admin__vouchers-wallet-hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin: 0;
}

.admin__vouchers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--theme-space-md);
}

.admin__voucher-card {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-sm);
  padding: var(--theme-space-md);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  background: var(--theme-bg-secondary);
}

.admin__voucher-card-body {
  flex: 1;
  min-width: 0;
}

.admin__voucher-label {
  font-weight: 600;
  font-size: var(--theme-font-md);
  margin-bottom: var(--theme-space-xs);
  color: var(--theme-text-primary);
}

.admin__voucher-entitlements {
  margin: 0 0 var(--theme-space-sm);
  padding-left: var(--theme-space-md);
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  line-height: 1.5;
}

.admin__voucher-balance {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.admin__voucher-slug-claim {
  margin-top: var(--theme-space-sm);
  padding-top: var(--theme-space-sm);
  border-top: var(--theme-border-thin) solid var(--theme-border);
}

.admin__voucher-slug-label {
  display: block;
  font-size: var(--theme-font-xs);
  font-weight: 500;
  color: var(--theme-text-secondary);
  margin-bottom: var(--theme-space-xs);
}

.admin__voucher-slug-row {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
}

.admin__voucher-slug-input {
  flex: 1;
  min-width: 0;
  padding: var(--theme-space-xs) var(--theme-space-sm);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  background: var(--theme-bg-primary);
  color: var(--theme-text-primary);
  font-size: var(--theme-font-sm);
}

.admin__slug-check-btn {
  flex-shrink: 0;
}

.admin__slug-check-icon--success {
  color: var(--theme-success);
}

.admin__slug-check-icon--taken {
  color: var(--theme-error);
}

.admin__slug-available-hint {
  font-size: var(--theme-font-xs);
  color: var(--theme-success);
  margin: var(--theme-space-xs) 0 0;
}

.admin__spinner--inline {
  width: 1rem;
  height: 1rem;
  margin-right: var(--theme-space-xs);
  vertical-align: middle;
}
</style>
