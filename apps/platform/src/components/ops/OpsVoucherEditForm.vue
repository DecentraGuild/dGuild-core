<template>
  <form v-if="voucher" class="space-y-4" @submit.prevent="onSubmit">
    <div class="space-y-2">
      <label for="edit-name" class="text-sm font-medium text-foreground">Name</label>
      <Input
        id="edit-name"
        v-model="metadataForm.name"
        type="text"
        placeholder="Token name"
      />
    </div>
    <div class="space-y-2">
      <label for="edit-symbol" class="text-sm font-medium text-foreground">Symbol</label>
      <Input
        id="edit-symbol"
        v-model="metadataForm.symbol"
        type="text"
        placeholder="e.g. VOUCH"
      />
    </div>
    <div class="space-y-2">
      <label for="edit-image" class="text-sm font-medium text-foreground">Image URL</label>
      <Input
        id="edit-image"
        v-model="metadataForm.imageUrl"
        type="url"
        placeholder="https://…"
      />
      <img
        v-if="metadataForm.imageUrl"
        :src="metadataForm.imageUrl"
        alt="Preview"
        class="mt-2 h-16 w-16 rounded-md border border-border object-cover"
        @error="(e) => (e.currentTarget!.style.display = 'none')"
      />
    </div>
    <div class="space-y-2">
      <label for="edit-seller-fee" class="text-sm font-medium text-foreground">Royalty (basis points)</label>
      <Input
        id="edit-seller-fee"
        v-model.number="metadataForm.sellerFeeBasisPoints"
        type="number"
        min="0"
        max="10000"
        placeholder="0"
        class="max-w-[8rem]"
      />
      <p class="text-muted-foreground text-xs m-0">0–10000 (100 = 1%)</p>
    </div>
    <template v-if="voucher.type === 'bundle'">
      <div class="space-y-2">
        <label class="text-sm font-medium text-foreground">Bundle</label>
        <p class="text-muted-foreground text-sm m-0">{{ bundleLabel }}</p>
      </div>
      <div class="space-y-2">
        <label for="edit-bv-tokens" class="text-sm font-medium text-foreground">Tokens required</label>
        <Input
          id="edit-bv-tokens"
          v-model.number="bundleForm.tokensRequired"
          type="number"
          min="1"
          class="max-w-[8rem]"
        />
      </div>
    </template>
    <template v-else>
      <div class="space-y-2">
        <label for="edit-iv-label" class="text-sm font-medium text-foreground">Label</label>
        <Input
          id="edit-iv-label"
          v-model="individualForm.label"
          type="text"
          placeholder="Display label"
        />
      </div>
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-foreground">Entitlements</span>
          <Button type="button" size="sm" variant="outline" @click="individualForm.entitlements.push({ meter_key: '', quantity: 1, duration_days: 30 })">
            Add row
          </Button>
        </div>
        <div v-for="(e, i) in individualForm.entitlements" :key="i" class="flex flex-wrap items-center gap-2">
          <select
            v-model="e.meter_key"
            class="min-w-[160px] rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground"
            required
          >
            <option value="">Select meter</option>
            <option v-for="m in meters" :key="m.meter_key" :value="m.meter_key">
              {{ m.meter_key }} ({{ m.product_key }})
            </option>
          </select>
          <Input v-model.number="e.quantity" type="number" min="1" class="w-14" />
          <Input v-model.number="e.duration_days" type="number" min="0" class="w-14" />
          <Button type="button" size="sm" variant="ghost" @click="individualForm.entitlements.splice(i, 1)">Remove</Button>
        </div>
      </div>
    </template>
    <div class="space-y-2">
      <label for="edit-max-redemptions" class="text-sm font-medium text-foreground">Max redemptions per tenant</label>
      <Input
        id="edit-max-redemptions"
        v-model.number="localMaxRedemptions"
        type="number"
        min="0"
        placeholder="Unlimited"
        class="max-w-[8rem]"
      />
    </div>
    <div class="flex items-center gap-2">
      <Button type="submit" size="sm" :disabled="saving">
        {{ saving ? 'Saving…' : 'Save' }}
      </Button>
      <p v-if="error" class="text-destructive text-sm m-0">{{ error }}</p>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'

const props = defineProps<{
  voucher: { mint: string; type: string; bundleId?: string; label?: string } | null
  bundleLabel?: string
  initialName?: string
  initialSymbol?: string
  initialImageUrl?: string
  initialSellerFeeBasisPoints?: number | null
  initialTokensRequired?: number
  initialLabel?: string
  initialEntitlements?: Array<{ meter_key: string; quantity: number; duration_days: number }>
  initialMaxRedemptions?: number | null
  meters: Array<{ meter_key: string; product_key: string }>
  saving: boolean
  error: string | null
}>()

const emit = defineEmits<{
  save: [payload: {
    name?: string
    symbol?: string
    imageUrl?: string
    sellerFeeBasisPoints?: number | null
    tokensRequired?: number
    label?: string
    maxRedemptionsPerTenant?: number | null
    entitlements?: Array<{ meter_key: string; quantity: number; duration_days: number }>
  }]
}>()

const metadataForm = ref({
  name: props.initialName ?? '',
  symbol: props.initialSymbol ?? '',
  imageUrl: props.initialImageUrl ?? '',
  sellerFeeBasisPoints: props.initialSellerFeeBasisPoints ?? 0,
})
const bundleForm = ref({ tokensRequired: props.initialTokensRequired ?? 1 })
const individualForm = ref({
  label: props.initialLabel ?? '',
  entitlements: (props.initialEntitlements ?? []).map((e) => ({ ...e })),
})
const localMaxRedemptions = ref<number | null>(props.initialMaxRedemptions ?? null)

watch(
  () => [
    props.voucher,
    props.initialName,
    props.initialSymbol,
    props.initialImageUrl,
    props.initialSellerFeeBasisPoints,
    props.initialTokensRequired,
    props.initialLabel,
    props.initialEntitlements,
    props.initialMaxRedemptions,
  ] as const,
  ([v, name, symbol, imageUrl, sellerFee, tokens, label, ents, max]) => {
    if (v) {
      metadataForm.value.name = name ?? ''
      metadataForm.value.symbol = symbol ?? ''
      metadataForm.value.imageUrl = imageUrl ?? ''
      metadataForm.value.sellerFeeBasisPoints = sellerFee ?? 0
      bundleForm.value.tokensRequired = tokens ?? 1
      individualForm.value.label = label ?? ''
      individualForm.value.entitlements = (ents ?? []).map((e) => ({ ...e }))
      if (individualForm.value.entitlements.length === 0) {
        individualForm.value.entitlements.push({ meter_key: '', quantity: 1, duration_days: 30 })
      }
      localMaxRedemptions.value = max ?? null
    }
  },
  { immediate: true }
)

function onSubmit() {
  const base = {
    name: metadataForm.value.name?.trim() || undefined,
    symbol: metadataForm.value.symbol?.trim() || undefined,
    imageUrl: metadataForm.value.imageUrl?.trim() || undefined,
    sellerFeeBasisPoints: metadataForm.value.sellerFeeBasisPoints ?? 0,
    maxRedemptionsPerTenant: localMaxRedemptions.value ?? undefined,
  }
  if (props.voucher?.type === 'bundle') {
    emit('save', {
      ...base,
      tokensRequired: bundleForm.value.tokensRequired,
    })
  } else {
    emit('save', {
      ...base,
      label: individualForm.value.label || undefined,
      entitlements: individualForm.value.entitlements.filter((e) => e.meter_key?.trim()),
    })
  }
}
</script>
