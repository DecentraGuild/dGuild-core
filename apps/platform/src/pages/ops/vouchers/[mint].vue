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
                @error="onVoucherImageError"
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
            <CardDescription>Mint, burn, or edit voucher token accounts.</CardDescription>
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
              :voucher="{
                mint: detail.voucher?.mint ?? mint,
                type: detail.type,
                bundleId: detail.voucher?.bundle_id ?? undefined,
                label: detail.voucher?.label ?? undefined,
              }"
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

import { formatDate, formatRawTokenAmount, truncateAddress } from '@decentraguild/display'
import { Icon } from '@iconify/vue'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { useExplorerLinks } from '~/composables/useExplorerLinks'
import { useOpsVoucherDetail } from '~/composables/useOpsVoucherDetail'
import OpsVoucherEditForm from '~/components/ops/OpsVoucherEditForm.vue'

const route = useRoute()
const router = useRouter()
const explorerLinks = useExplorerLinks()

const mint = computed(() => route.params.mint as string)

const {
  detail, loading, error,
  ourBalanceRaw, ourBalanceLoading,
  holders, holdersLoading,
  editExpanded, editSaving, editError, editMetadata,
  mintLoading, burnLoading, mintDialogOpen, burnDialogOpen, mintAmount, burnAmount,
  meters, confirmMint, confirmBurn, saveEdit,
} = useOpsVoucherDetail(mint)

function onVoucherImageError(e: Event) {
  const el = e.currentTarget
  if (el instanceof HTMLElement) el.style.display = 'none'
}

function back() {
  if (history.length > 1) router.back()
  else router.push('/ops')
}
</script>
