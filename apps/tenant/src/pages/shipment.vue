<template>
  <PageSection title="Shipments" module-id="shipment">
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
            <template v-if="primaryAssets.length > 0">
              <h3 class="shipment-page__heading">From this dGuild</h3>
              <p class="shipment-page__intro">Claim to receive tokens in your wallet.</p>
            </template>
            <p v-else class="shipment-page__minimal">
              No balances from this dGuild's listed tokens.
            </p>
          </div>
        </div>

        <div v-if="wallet && !loading && primaryAssets.length > 0" class="shipment-page__list">
          <ShipmentClaimCard
            v-for="a in primaryAssets"
            :key="a.id"
            :title="displayName(a)"
            :amount="formatAmount(a)"
            :claiming="claiming === a.id"
            :explorer-url="a.mint ? explorerLinks.tokenUrl(a.mint) : undefined"
            :has-banner="hasBanner(a)"
            :has-image="hasImage(a)"
            :card-right-style="cardRightStyle(a)"
            @claim="claim(a)"
          />
        </div>

        <details
          v-if="wallet && !loading && secondaryAssets.length > 0"
          class="shipment-page__other"
          :open="secondaryDetailsOpen"
        >
          <summary class="shipment-page__other-summary">
            <span class="shipment-page__other-title">Other compressed balances</span>
            <Icon icon="lucide:chevron-down" class="shipment-page__other-chevron" />
          </summary>
          <p class="shipment-page__other-hint">
            Tokens not listed in this dGuild's catalog. You can still claim them to your wallet.
          </p>
          <div class="shipment-page__list shipment-page__list--nested">
            <ShipmentClaimCard
              v-for="a in secondaryAssets"
              :key="a.id"
              :title="displayName(a)"
              :amount="formatAmount(a)"
              :claiming="claiming === a.id"
              :explorer-url="a.mint ? explorerLinks.tokenUrl(a.mint) : undefined"
              :has-banner="hasBanner(a)"
              :has-image="hasImage(a)"
              :card-right-style="cardRightStyle(a)"
              @claim="claim(a)"
            />
          </div>
        </details>
      </div>
    </div>

    <Dialog v-model:open="claimErrorOpen">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Claim failed</DialogTitle>
        </DialogHeader>
        <pre class="shipment-page__claim-error">{{ claimErrorMessage }}</pre>
        <div class="shipment-page__claim-error-actions">
          <Button variant="outline" size="sm" type="button" @click="copyClaimError">
            <Icon icon="lucide:copy" />
            {{ claimErrorCopied ? 'Copied' : 'Copy error' }}
          </Button>
          <Button size="sm" type="button" variant="default" @click="claimErrorOpen = false">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </PageSection>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { formatRawTokenAmount, truncateAddress } from '@decentraguild/display'
import { getModuleState, isModuleVisibleToMembers } from '@decentraguild/core'
import { Icon } from '@iconify/vue'
import ShipmentClaimCard from '~/components/shipment/ShipmentClaimCard.vue'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog'
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
  /** From fetch; pass to decompress when multiple compressed accounts share a mint. */
  accountHash?: string | null
  token_info?: { symbol?: string; decimals?: number }
  compression?: { compressed?: boolean }
}

interface DisplayInfo {
  name: string | null
  image: string | null
  isBanner: boolean
  inTenantCatalog: boolean
}

const assets = ref<CompressedAsset[]>([])
const displayByMint = ref<Map<string, DisplayInfo>>(new Map())
const loading = ref(true)
const claiming = ref<string | null>(null)
const claimErrorOpen = ref(false)
const claimErrorMessage = ref('')
const claimErrorCopied = ref(false)
let claimErrorCopyReset: ReturnType<typeof setTimeout> | null = null

function openClaimError(msg: string) {
  claimErrorMessage.value = msg
  claimErrorCopied.value = false
  claimErrorOpen.value = true
}

async function copyClaimError() {
  const text = claimErrorMessage.value
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    claimErrorCopied.value = true
    if (claimErrorCopyReset) clearTimeout(claimErrorCopyReset)
    claimErrorCopyReset = setTimeout(() => {
      claimErrorCopied.value = false
      claimErrorCopyReset = null
    }, 2000)
  } catch {
  }
}

function mintKey(a: CompressedAsset): string {
  return a.mint ?? a.id
}

const primaryAssets = computed(() =>
  assets.value.filter((a) => displayByMint.value.get(mintKey(a))?.inTenantCatalog === true),
)

const secondaryAssets = computed(() =>
  assets.value.filter((a) => displayByMint.value.get(mintKey(a))?.inTenantCatalog !== true),
)

const secondaryDetailsOpen = computed(() => primaryAssets.value.length === 0)

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
    const inTenantCatalog = catalogByMint.has(mint)
    map.set(mint, { name, image, isBanner, inTenantCatalog })
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
      try {
        if (BigInt(b.amount) <= 0n) continue
      } catch {
        continue
      }
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
        accountHash: b.accountHash,
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
    const amountStr = String(a.amount ?? '0').trim()
    if (!/^\d+$/.test(amountStr) || amountStr === '0') throw new Error('Invalid amount')
    const decimals = a.decimals ?? a.token_info?.decimals ?? null
    if (decimals == null || !Number.isFinite(decimals)) throw new Error('Token decimals not available')
    const hash = a.accountHash?.trim()
    if (!hash) {
      throw new Error(
        'Compressed account hash missing for this shipment. Refresh the page (Helius ZK / compression RPC required), then try again.',
      )
    }
    const sig = await doDecompress({
      connection: conn,
      wallet: walletAdapter,
      mint,
      amount: amountStr,
      decimals,
      rpcUrl: rpcUrl.value || undefined,
      compressedAccountHash: hash,
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
    openClaimError(msg)
  } finally {
    claiming.value = null
  }
}

watch([wallet, rpcUrl], () => fetchAssets(), { immediate: true })

onUnmounted(() => {
  if (claimErrorCopyReset) clearTimeout(claimErrorCopyReset)
})
</script>

<style scoped>
.shipment-page__inactive,
.shipment-page__hint,
.shipment-page__empty,
.shipment-page__minimal {
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
  font-weight: 600;
  color: var(--theme-secondary);
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
.shipment-page__list--nested {
  margin-top: var(--theme-space-md);
}
.shipment-page__other {
  margin-top: var(--theme-space-xl);
  border: none;
  padding: 0;
}
.shipment-page__other-summary {
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--theme-space-sm);
  cursor: pointer;
  padding: var(--theme-space-xs) 0;
  font: inherit;
  color: var(--theme-text-primary);
}
.shipment-page__other-summary::-webkit-details-marker {
  display: none;
}
.shipment-page__other-title {
  font-size: var(--theme-font-base);
  font-weight: 600;
  margin: 0;
}
.shipment-page__other-chevron {
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
  color: var(--theme-text-muted);
  transition: transform 0.15s ease;
}
.shipment-page__other[open] .shipment-page__other-chevron {
  transform: rotate(180deg);
}
.shipment-page__other-hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin: 0 0 var(--theme-space-md);
  line-height: 1.5;
}
.shipment-page__claim-error {
  margin: 0;
  padding: var(--theme-space-sm);
  font-size: var(--theme-font-sm);
  font-family: ui-monospace, 'Cascadia Code', 'Segoe UI Mono', monospace;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
  cursor: text;
  color: var(--theme-text-primary);
  background: var(--theme-bg-elevated, var(--theme-bg-card));
  border-radius: var(--theme-radius-md);
  border: var(--theme-border-thin) solid var(--theme-border);
  max-height: min(40vh, 20rem);
  overflow-y: auto;
}
.shipment-page__claim-error-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--theme-space-sm);
  padding-top: var(--theme-space-xs);
}
</style>
