<template>
  <div class="market-open-trades">
    <StatusBanner
      v-if="!supabaseConfigured"
      variant="error"
      message="Backend is not configured. Set NUXT_PUBLIC_SUPABASE_URL and NUXT_PUBLIC_SUPABASE_ANON_KEY."
    />
    <StatusBanner
      v-else-if="!connected"
      variant="info"
      message="Connect your wallet to manage your escrows."
    />
    <div v-else>
      <div class="market-open-trades__toolbar">
        <button
          type="button"
          class="market-open-trades__create-btn"
          :class="{ 'market-open-trades__create-btn--disabled': props.createDisabled }"
          :disabled="props.createDisabled"
          @click="!props.createDisabled && emit('open-create-trade')"
        >
          <Icon icon="lucide:plus" class="market-open-trades__create-btn-icon" />
          <span>New trade</span>
        </button>
      </div>
      <StatusBanner
        v-if="loading"
        variant="loading"
        message="Loading your escrows..."
      />
      <StatusBanner
        v-else-if="error"
        variant="error"
        :message="error"
      />
      <template v-else>
        <StatusBanner
          v-if="!escrows.length"
          variant="empty"
          message="You have no open escrows in this dGuild."
        />
        <div v-else class="market-open-trades__list">
          <section
            v-for="group in groupedByDeposit"
            :key="group.depositMint"
            class="market-open-trades__group"
          >
            <h3 class="market-open-trades__group-heading">
              <MintLabel :mint="group.depositMint" />
            </h3>
            <div class="market-open-trades__group-items">
              <NuxtLink
                v-for="item in group.escrows"
                :key="item.publicKey.toBase58()"
                :to="myTradesEscrowLink(item.publicKey.toBase58())"
                class="market-open-trades__row-link"
              >
                <ManageEscrowCard
                  :escrow="item"
                  :escrow-link="myTradesEscrowLink(item.publicKey.toBase58())"
                  :show-quick-cancel="true"
                  :cancelling="cancellingId === item.publicKey.toBase58()"
                  @cancel="handleQuickCancel(item)"
                />
              </NuxtLink>
            </div>
          </section>
        </div>
        <section class="market-open-trades__elsewhere">
          <h2 class="market-open-trades__elsewhere-title">Open elsewhere</h2>
          <p class="market-open-trades__elsewhere-hint">
            Trades your wallet has on other dGuilds or the same program. Cancel and create here to list in this dGuild.
          </p>
          <StatusBanner
            v-if="externalLoading"
            variant="loading"
            message="Loading escrows elsewhere..."
          />
          <StatusBanner
            v-else-if="externalError"
            variant="error"
            :message="externalError"
          />
          <StatusBanner
            v-else-if="!externalEscrows.length"
            variant="empty"
            message="No open trades elsewhere."
          />
          <div v-else class="market-open-trades__list">
            <section
              v-for="group in groupedByDepositExternal"
              :key="`ext-${group.depositMint}`"
              class="market-open-trades__group"
            >
              <h3 class="market-open-trades__group-heading">
                <MintLabel :mint="group.depositMint" />
              </h3>
              <div class="market-open-trades__group-items">
                <NuxtLink
                  v-for="item in group.escrows"
                  :key="item.publicKey.toBase58()"
                  :to="myTradesEscrowLink(item.publicKey.toBase58())"
                  class="market-open-trades__row-link"
                >
                  <ManageEscrowCard
                    :escrow="item"
                    :escrow-link="myTradesEscrowLink(item.publicKey.toBase58())"
                    :show-quick-cancel="true"
                    :cancelling="cancellingId === item.publicKey.toBase58()"
                    @cancel="handleQuickCancel(item)"
                  />
                </NuxtLink>
              </div>
            </section>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { PublicKey } from '@solana/web3.js'
import BN from 'bn.js'
import {
  buildCancelTransaction,
  sendAndConfirmTransaction,
  getEscrowWalletFromConnector,
  fetchAllEscrows,
} from '@decentraguild/web3'
import { escrowPriceToHuman } from '@decentraguild/display'
import { Icon } from '@iconify/vue'
import StatusBanner from '~/components/ui/status-banner/StatusBanner.vue'
import ManageEscrowCard from './ManageEscrowCard.vue'
import MintLabel from './MintLabel.vue'
import { useTenantStore } from '~/stores/tenant'
import { useMarketplaceEscrowLinks } from '~/composables/marketplace/useMarketplaceEscrowLinks'
import { useMarketplaceScope } from '~/composables/marketplace/useMarketplaceScope'
import { invokeEdgeFunction, useSubmitInFlightLock } from '@decentraguild/nuxt-composables'
import { useSupabase } from '~/composables/core/useSupabase'
import { useAuth } from '@decentraguild/auth'
import { useSolanaConnection } from '~/composables/core/useSolanaConnection'
import { useTransactionNotificationsStore } from '~/stores/transactionNotifications'
import type { EscrowWithAddress } from '@decentraguild/web3'

const config = useRuntimeConfig()
const supabaseConfigured = computed(() => Boolean(config.public.supabaseUrl && config.public.supabaseAnonKey))

const props = withDefaults(
  defineProps<{ tabActive?: boolean; createDisabled?: boolean }>(),
  { tabActive: false, createDisabled: false }
)
const emit = defineEmits<{ 'open-create-trade': [] }>()

function myTradesEscrowLink(id: string) {
  return escrowLink(id, { tab: 'open-trades' })
}

const tenantStore = useTenantStore()
const auth = useAuth()
const { connection } = useSolanaConnection()
const txNotifications = useTransactionNotificationsStore()
const quickCancelLock = useSubmitInFlightLock()

const tenantId = computed(() => tenantStore.tenantId)
const { escrowLink } = useMarketplaceEscrowLinks(
  computed(() => tenantStore.slug)
)

const connected = computed(() => auth.connectorState.value?.connected ?? false)
const walletAddress = computed(() => auth.connectorState.value?.account ?? null)

const escrows = ref<EscrowWithAddress[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const cancellingId = ref<string | null>(null)

const externalEscrows = ref<EscrowWithAddress[]>([])
const externalLoading = ref(false)
const externalError = ref<string | null>(null)

const MIN_REMAINING_HUMAN = 0.0000001
function isEffectivelyComplete(remaining: BN, decimals: number): boolean {
  const rawThreshold = Math.max(1, Math.round(MIN_REMAINING_HUMAN * 10 ** decimals))
  return remaining.lt(new BN(rawThreshold))
}

const groupedByDeposit = computed(() => {
  const list = escrows.value
  if (!list.length) return []
  const byDeposit = new Map<string, EscrowWithAddress[]>()
  for (const e of list) {
    const mint = e.account.depositToken.toBase58()
    const arr = byDeposit.get(mint) ?? []
    arr.push(e)
    byDeposit.set(mint, arr)
  }
  for (const arr of byDeposit.values()) {
    arr.sort((a, b) => (a.account.price ?? 0) - (b.account.price ?? 0))
  }
  const groups = [...byDeposit.entries()].map(([depositMint, escrows]) => ({
    depositMint,
    escrows,
    minPrice: Math.min(...escrows.map((e) => e.account.price ?? 0)),
  }))
  groups.sort((a, b) => a.minPrice - b.minPrice)
  return groups.map(({ depositMint, escrows: es }) => ({ depositMint, escrows: es }))
})

const groupedByDepositExternal = computed(() => {
  const list = externalEscrows.value
  if (!list.length) return []
  const byDeposit = new Map<string, EscrowWithAddress[]>()
  for (const e of list) {
    const mint = e.account.depositToken.toBase58()
    const arr = byDeposit.get(mint) ?? []
    arr.push(e)
    byDeposit.set(mint, arr)
  }
  for (const arr of byDeposit.values()) {
    arr.sort((a, b) => (a.account.price ?? 0) - (b.account.price ?? 0))
  }
  const groups = [...byDeposit.entries()].map(([depositMint, escrows]) => ({
    depositMint,
    escrows,
    minPrice: Math.min(...escrows.map((e) => e.account.price ?? 0)),
  }))
  groups.sort((a, b) => a.minPrice - b.minPrice)
  return groups.map(({ depositMint, escrows: es }) => ({ depositMint, escrows: es }))
})

const { mintsSet: scopeMintsSet, loading: scopeLoading } = useMarketplaceScope()
const supabase = useSupabase()

function apiEscrowToFull(e: { publicKey: string; account: Record<string, unknown> }): EscrowWithAddress {
  const acc = e.account
  return {
    publicKey: new PublicKey(e.publicKey),
    account: {
      maker: new PublicKey(acc.maker),
      depositToken: new PublicKey(acc.depositToken),
      requestToken: new PublicKey(acc.requestToken),
      tokensDepositInit: new BN(acc.tokensDepositInit),
      tokensDepositRemaining: new BN(acc.tokensDepositRemaining),
      price: escrowPriceToHuman(acc.price),
      decimals: acc.decimals as number,
      slippage: acc.slippage as number,
      seed: new BN(acc.seed),
      authBump: 0,
      vaultBump: 0,
      escrowBump: 0,
      expireTimestamp: new BN(acc.expireTimestamp),
      recipient: new PublicKey(acc.recipient),
      onlyRecipient: acc.onlyRecipient as boolean,
      onlyWhitelist: acc.onlyWhitelist as boolean,
      allowPartialFill: acc.allowPartialFill as boolean,
      whitelist: new PublicKey(acc.whitelist),
    },
  }
}

async function load() {
  const addr = walletAddress.value
  const conn = connection.value
  const tid = tenantId.value
  if (!addr) {
    loading.value = false
    return
  }
  loading.value = true
  error.value = null
  try {
    if (supabaseConfigured.value && tid) {
      try {
        const data = await invokeEdgeFunction<{ escrows?: Array<{ publicKey: string; account: Record<string, unknown> }> }>(
          supabase,
          'marketplace',
          { action: 'escrows', tenantId: tid, wallet: addr },
        )
        const raw = data.escrows ?? []
        const converted = raw.map(apiEscrowToFull)
        escrows.value = converted.filter((e) => !isEffectivelyComplete(e.account.tokensDepositRemaining, e.account.decimals))
        return
      } catch {
        /* fall through to RPC */
      }
    }
    if (conn) {
      const all = await fetchAllEscrows(conn, addr)
      const scope = scopeMintsSet.value
      escrows.value = all.filter((e) => {
        if (isEffectivelyComplete(e.account.tokensDepositRemaining, e.account.decimals)) return false
        if (scope.size === 0) return true
        const dep = e.account.depositToken.toBase58()
        const req = e.account.requestToken.toBase58()
        return scope.has(dep) && scope.has(req)
      })
    } else {
      escrows.value = []
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load escrows'
    escrows.value = []
  } finally {
    loading.value = false
    void loadExternal()
  }
}

async function loadExternal() {
  const conn = connection.value
  const addr = walletAddress.value
  if (!conn || !addr) return
  const inDguildKeys = new Set(escrows.value.map((e) => e.publicKey.toBase58()))
  externalLoading.value = true
  externalError.value = null
  try {
    const all = await fetchAllEscrows(conn, addr)
    externalEscrows.value = all.filter(
      (e) =>
        !inDguildKeys.has(e.publicKey.toBase58()) &&
        !isEffectivelyComplete(e.account.tokensDepositRemaining, e.account.decimals)
    )
  } catch (e) {
    externalError.value = e instanceof Error ? e.message : 'Failed to load escrows elsewhere'
    externalEscrows.value = []
  } finally {
    externalLoading.value = false
  }
}

watch(
  () => [walletAddress.value, tenantStore.slug],
  () => { void load() },
  { immediate: false }
)
watch(
  () => props.tabActive,
  (active) => { if (active) void load() }
)
watch(
  scopeLoading,
  (loading, wasLoading) => {
    if (wasLoading && !loading && connection.value) void load()
  },
  { immediate: false }
)
onMounted(() => { void load() })

async function handleQuickCancel(escrow: EscrowWithAddress) {
  const wallet = getEscrowWalletFromConnector()
  if (!wallet || !escrow) return
  const id = escrow.publicKey.toBase58()
  const exclusive = await quickCancelLock.runExclusive(async () => {
    cancellingId.value = id
    const txId = `cancel-${id}-${Date.now()}`
    txNotifications.add(txId, { status: 'pending', message: 'Cancelling escrow...' })
    try {
      if (!connection.value) return
      const tx = await buildCancelTransaction({
        maker: escrow.account.maker,
        depositTokenMint: escrow.account.depositToken,
        requestTokenMint: escrow.account.requestToken,
        seed: escrow.account.seed,
        connection: connection.value,
        wallet,
      })
      const sig = await sendAndConfirmTransaction(connection.value, tx, wallet, escrow.account.maker)
      txNotifications.update(txId, { status: 'success', message: 'Escrow cancelled', signature: sig })
      escrows.value = escrows.value.filter((e) => e.publicKey.toBase58() !== id)
      externalEscrows.value = externalEscrows.value.filter((e) => e.publicKey.toBase58() !== id)
    } catch (e) {
      txNotifications.update(txId, {
        status: 'error',
        message: e instanceof Error ? e.message : 'Cancel failed',
      })
    } finally {
      cancellingId.value = null
    }
  })
  if (!exclusive.ok) return
}
</script>

<style scoped>
.market-open-trades__toolbar {
  margin-bottom: var(--theme-space-md);
}

.market-open-trades__create-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--theme-space-xs);
  padding: var(--theme-space-xs) var(--theme-space-md);
  background: var(--theme-primary);
  color: var(--theme-primary-inverse);
  border: none;
  border-radius: var(--theme-radius-md);
  font-size: var(--theme-font-sm);
  font-weight: 500;
  cursor: pointer;
}

.market-open-trades__create-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.market-open-trades__create-btn--disabled,
.market-open-trades__create-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: var(--theme-bg-muted);
  color: var(--theme-text-muted);
}

.market-open-trades__create-btn-icon {
  font-size: 1.125rem;
}

.market-open-trades__list {
  display: flex;
  flex-direction: column;
  gap: 0;
  background: var(--theme-bg-secondary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  padding: 0;
}

.market-open-trades__group {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.market-open-trades__group:not(:last-child) {
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.market-open-trades__group-heading {
  font-size: var(--theme-font-xs);
  font-weight: 600;
  color: var(--theme-text-secondary);
  margin: 0;
  padding: var(--theme-space-xs) var(--theme-space-sm);
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.market-open-trades__group-items {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.market-open-trades__row-link {
  text-decoration: none;
  color: inherit;
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.market-open-trades__row-link:last-child {
  border-bottom: none;
}

.market-open-trades__elsewhere {
  margin-top: var(--theme-space-xl);
}

.market-open-trades__elsewhere-title {
  font-size: var(--theme-font-base);
  font-weight: 600;
  color: var(--theme-text-primary);
  margin: 0 0 var(--theme-space-xs);
}

.market-open-trades__elsewhere-hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin: 0 0 var(--theme-space-md);
}
</style>
