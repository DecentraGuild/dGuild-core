<template>
  <PageSection title="Shipments">
    <div class="shipment-page">
      <div v-if="!shipmentVisible" class="shipment-page__inactive">
        <p>Shipments is not enabled for this dGuild.</p>
      </div>

      <div v-else class="shipment-page__content">
        <div class="shipment-page__header">
          <p v-if="!wallet" class="shipment-page__hint">
            Connect your wallet to view and claim your shipments.
          </p>
          <p v-else-if="loading" class="shipment-page__loading">
            <Icon icon="lucide:loader-2" class="shipment-page__spinner" />
            Loading…
          </p>
          <p v-else-if="assets.length === 0" class="shipment-page__empty">
            You have no shipments.
          </p>
          <div v-else>
            <h3 class="shipment-page__heading">Your shipments</h3>
            <p class="shipment-page__intro">Claim shipment to receive tokens in your wallet.</p>
          </div>
        </div>

        <div v-if="wallet && !loading && assets.length > 0" class="shipment-page__list">
          <div
            v-for="a in assets"
            :key="a.id"
            class="shipment-page__card"
          >
            <a
              v-if="a.mint"
              :href="explorerLinks.tokenUrl(a.mint)"
              target="_blank"
              rel="noopener"
              class="shipment-page__card-link"
              @click.stop
            >
              <Icon icon="lucide:external-link" />
            </a>
            <div class="shipment-page__card-left">
              <div class="shipment-page__card-content">
                <h4 class="shipment-page__card-name">{{ displayName(a) }}</h4>
                <span class="shipment-page__card-amount">{{ formatAmount(a) }}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  class="shipment-page__card-btn"
                  :disabled="claiming === a.id"
                  @click="claim(a)"
                >
                  <Icon v-if="claiming === a.id" icon="lucide:loader-2" class="shipment-page__spinner" />
                  Claim
                </Button>
              </div>
            </div>
            <div
              class="shipment-page__card-right"
              :class="{ 'shipment-page__card-right--fade': !hasBanner(a) && hasImage(a) }"
              :style="cardRightStyle(a)"
            />
          </div>
        </div>
      </div>
    </div>
  </PageSection>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { formatRawTokenAmount, truncateAddress } from '@decentraguild/display'
import { getModuleState, isModuleVisibleToMembers } from '@decentraguild/core'
import { Icon } from '@iconify/vue'
import { Button } from '~/components/ui/button'
import { useAuth } from '@decentraguild/auth'
import { useTenantStore } from '~/stores/tenant'
import { useSupabase } from '~/composables/core/useSupabase'
import { useExplorerLinks } from '~/composables/core/useExplorerLinks'
import { useSolanaConnection } from '~/composables/core/useSolanaConnection'
import { useRpc } from '~/composables/core/useRpc'

const tenantStore = useTenantStore()
const auth = useAuth()
const { connection } = useSolanaConnection()
const { rpcUrl } = useRpc()
const explorerLinks = useExplorerLinks()

const tenant = computed(() => tenantStore.tenant)
const wallet = computed(() => auth.wallet.value ?? null)

const shipmentState = computed(() => getModuleState(tenant.value?.modules?.shipment))
const shipmentVisible = computed(() => isModuleVisibleToMembers(shipmentState.value))

interface CompressedAsset {
  id: string
  mint?: string
  amount?: string
  decimals?: number
  token_info?: { symbol?: string; decimals?: number }
  compression?: { compressed?: boolean }
}

interface DisplayInfo {
  name: string | null
  image: string | null
  isBanner: boolean
}

const assets = ref<CompressedAsset[]>([])
const displayByMint = ref<Map<string, DisplayInfo>>(new Map())
const loading = ref(true)
const claiming = ref<string | null>(null)

function displayName(a: CompressedAsset): string {
  const mint = a.mint ?? a.id
  const info = displayByMint.value.get(mint)
  return info?.name ?? truncateAddress(mint, 10, 8)
}

function hasBanner(a: CompressedAsset): boolean {
  const mint = a.mint ?? a.id
  const info = displayByMint.value.get(mint)
  return !!info?.isBanner
}

function hasImage(a: CompressedAsset): boolean {
  const mint = a.mint ?? a.id
  const info = displayByMint.value.get(mint)
  return !!info?.image
}

function cardRightStyle(a: CompressedAsset): Record<string, string> {
  const mint = a.mint ?? a.id
  const info = displayByMint.value.get(mint)
  const img = info?.image
  const style: Record<string, string> = {
    background: 'var(--theme-bg-card)',
  }
  if (img) {
    style.backgroundImage = `url(${img})`
    style.backgroundSize = 'cover'
    style.backgroundPosition = 'center'
  }
  return style
}

function formatAmount(a: CompressedAsset): string {
  const amt = a.amount ?? '0'
  const dec = a.decimals ?? a.token_info?.decimals ?? null
  if (dec == null || !Number.isFinite(dec)) return '?'
  return formatRawTokenAmount(amt, dec, 'SPL')
}

async function fetchDisplay(mints: string[]) {
  const tenantId = tenantStore.tenantId
  if (!tenantId || mints.length === 0) {
    displayByMint.value = new Map()
    return
  }
  const supabase = useSupabase()
  const [metaRes, catalogRes] = await Promise.all([
    supabase.from('mint_metadata').select('mint, name, image').in('mint', mints),
    supabase.from('tenant_mint_catalog').select('mint, label, shipment_banner_image').eq('tenant_id', tenantId).in('mint', mints),
  ])
  const metaRows = metaRes.data ?? []
  const catalogRows = catalogRes.error
    ? []
    : ((catalogRes.data ?? []) as Array<{ mint: string; label?: string | null; shipment_banner_image?: string | null }>)
  const catalogByMint = new Map(catalogRows.map((r) => [r.mint as string, r]))
  const metaByMint = new Map(metaRows.map((m) => [m.mint as string, m]))
  const map = new Map<string, DisplayInfo>()
  for (const mint of mints) {
    const catalog = catalogByMint.get(mint) as { label?: string | null; shipment_banner_image?: string | null } | undefined
    const meta = metaByMint.get(mint) as { name?: string | null; image?: string | null } | undefined
    const name = catalog?.label ?? meta?.name ?? null
    const bannerImg = catalog?.shipment_banner_image ?? null
    const metaImg = meta?.image ?? null
    const image = bannerImg ?? metaImg
    const isBanner = !!bannerImg
    map.set(mint, { name, image, isBanner })
  }
  displayByMint.value = map
}

async function fetchAssets() {
  const w = wallet.value
  const url = rpcUrl.value
  if (!w || !url) {
    assets.value = []
    displayByMint.value = new Map()
    loading.value = false
    return
  }
  loading.value = true
  try {
    const { fetchCompressedTokenAccounts } = await import('@decentraguild/shipment')
    const { fetchMintMetadataFromChain } = await import('@decentraguild/web3')
    const conn = connection.value
    const accounts = await fetchCompressedTokenAccounts(url, w)
    const withDecimals: CompressedAsset[] = []
    for (const b of accounts) {
      const amt = Number(b.amount)
      if (amt <= 0) continue
      let decimals: number | null = null
      if (conn) {
        try {
          const meta = await fetchMintMetadataFromChain(conn, b.mint)
          decimals = meta?.decimals != null && Number.isFinite(meta.decimals) ? meta.decimals : null
        } catch {
          // leave null
        }
      }
      withDecimals.push({
        id: b.id,
        mint: b.mint,
        amount: b.amount,
        decimals: decimals ?? undefined,
        token_info: { decimals: decimals ?? undefined },
        compression: { compressed: true },
      })
    }
    assets.value = withDecimals
    const mints = [...new Set(withDecimals.map((a) => a.mint ?? a.id).filter(Boolean))]
    await fetchDisplay(mints)
  } catch {
    assets.value = []
    displayByMint.value = new Map()
  } finally {
    loading.value = false
  }
}

async function claim(a: CompressedAsset) {
  claiming.value = a.id
  try {
    const conn = connection.value
    if (!conn) throw new Error('RPC not configured')
    const { getEscrowWalletFromConnector } = await import('@decentraguild/web3')
    const { decompress: doDecompress } = await import('@decentraguild/shipment')
    const walletAdapter = getEscrowWalletFromConnector()
    if (!walletAdapter?.publicKey) throw new Error('Wallet not connected')
    const mint = a.mint ?? a.id
    const amountRaw = Number(a.amount ?? '0')
    const decimals = a.decimals ?? a.token_info?.decimals ?? null
    if (amountRaw <= 0) throw new Error('Invalid amount')
    if (decimals == null || !Number.isFinite(decimals)) throw new Error('Token decimals not available')
    const sig = await doDecompress({
      connection: conn,
      wallet: walletAdapter,
      mint,
      amount: amountRaw,
      decimals,
      rpcUrl: rpcUrl.value || undefined,
    })
    if (sig) {
      fetchAssets()
    }
  } catch (e) {
    const err = e as Error & { originalError?: unknown; cause?: unknown }
    const original = err.originalError ?? err.cause
    const originalMsg =
      original instanceof Error ? original.message : typeof original === 'string' ? original : null
    const msg =
      originalMsg && originalMsg !== err.message
        ? `${err.message}: ${originalMsg}`
        : err instanceof Error ? err.message : 'Claim failed'
    alert(msg)
  } finally {
    claiming.value = null
  }
}

watch([wallet, rpcUrl], () => fetchAssets(), { immediate: true })
</script>

<style scoped>
.shipment-page__inactive,
.shipment-page__hint,
.shipment-page__empty {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}
.shipment-page__content {
  padding: var(--theme-space-md) 0;
}
.shipment-page__header {
  margin-bottom: var(--theme-space-md);
}
.shipment-page__loading {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  margin: 0;
  font-size: var(--theme-font-sm);
}
.shipment-page__spinner {
  animation: shipment-page-spin 1s linear infinite;
}
@keyframes shipment-page-spin {
  to { transform: rotate(360deg); }
}
.shipment-page__heading {
  font-size: var(--theme-font-lg);
  margin: 0 0 var(--theme-space-sm);
}
.shipment-page__intro {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}
.shipment-page__list {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}
.shipment-page__card {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 100px;
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  overflow: hidden;
  text-align: left;
}
.shipment-page__card-link {
  position: absolute;
  top: var(--theme-space-sm);
  right: var(--theme-space-sm);
  color: var(--theme-text-secondary);
  display: inline-flex;
  z-index: 1;
}
.shipment-page__card-link:hover {
  color: var(--theme-text);
}
.shipment-page__card-left {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--theme-space-lg);
  background: var(--theme-bg-card);
}
.shipment-page__card-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--theme-space-sm);
  color: var(--theme-text);
  text-align: center;
}
.shipment-page__card-name {
  font-size: var(--theme-font-lg);
  font-weight: 600;
  margin: 0;
  line-height: 1.2;
}
.shipment-page__card-amount {
  font-size: var(--theme-font-md);
  font-weight: 500;
  color: var(--theme-text-secondary);
}
.shipment-page__card-right {
  min-height: 120px;
  background: var(--theme-bg-card);
}
.shipment-page__card-right--fade {
  mask-image: linear-gradient(to right, transparent 0%, black 50%);
  -webkit-mask-image: linear-gradient(to right, transparent 0%, black 50%);
}
</style>
