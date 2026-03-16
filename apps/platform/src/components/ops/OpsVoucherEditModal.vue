<template>
  <Dialog :open="!!voucher" @update:open="(v: boolean) => !v && $emit('close')">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Edit voucher: {{ voucher?.mint?.slice(0, 8) }}…</DialogTitle>
        <DialogDescription>
          {{ voucher?.type === 'bundle' ? 'Update tokens required and max redemptions.' : 'Update label, max redemptions, and entitlements.' }}
        </DialogDescription>
      </DialogHeader>
      <form v-if="voucher" class="space-y-4" @submit.prevent="onSubmit">
        <template v-if="voucher.type === 'bundle'">
          <div class="space-y-2">
            <label class="text-sm font-medium">Bundle</label>
            <p class="text-muted-foreground text-sm">{{ bundleLabel }}</p>
          </div>
          <div class="space-y-2">
            <label for="edit-bv-tokens" class="text-sm font-medium">Tokens required</label>
            <input
              id="edit-bv-tokens"
              v-model.number="bundleForm.tokensRequired"
              type="number"
              min="1"
              class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            />
          </div>
        </template>
        <template v-else>
          <div class="space-y-2">
            <label for="edit-iv-label" class="text-sm font-medium">Label</label>
            <input
              id="edit-iv-label"
              v-model="individualForm.label"
              type="text"
              class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            />
          </div>
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium">Entitlements</span>
              <Button type="button" size="sm" variant="outline" @click="individualForm.entitlements.push({ meter_key: '', quantity: 1, duration_days: 30 })">
                Add row
              </Button>
            </div>
            <div v-for="(e, i) in individualForm.entitlements" :key="i" class="flex flex-wrap items-center gap-2">
              <select
                v-model="e.meter_key"
                class="min-w-[160px] rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                required
              >
                <option value="">Select meter</option>
                <option v-for="m in meters" :key="m.meter_key" :value="m.meter_key">
                  {{ m.meter_key }} ({{ m.product_key }})
                </option>
              </select>
              <input v-model.number="e.quantity" type="number" min="1" class="w-14 rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
              <input v-model.number="e.duration_days" type="number" min="0" class="w-14 rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
              <Button type="button" size="sm" variant="ghost" @click="individualForm.entitlements.splice(i, 1)">Remove</Button>
            </div>
          </div>
        </template>
        <div class="space-y-2">
          <label for="edit-max-redemptions" class="text-sm font-medium">Max redemptions per tenant</label>
          <input
            id="edit-max-redemptions"
            v-model.number="localMaxRedemptions"
            type="number"
            min="0"
            placeholder="Unlimited"
            class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
          />
        </div>
        <DialogFooter :show-close-button="true">
          <Button type="submit" size="sm" :disabled="saving">
            {{ saving ? 'Saving…' : 'Save' }}
          </Button>
          <p v-if="error" class="col-span-full text-destructive text-sm">{{ error }}</p>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'

const props = defineProps<{
  voucher: { mint: string; type: string; bundleId?: string; label?: string } | null
  bundleLabel?: string
  bundleForm: { tokensRequired: number }
  individualForm: { label: string; entitlements: Array<{ meter_key: string; quantity: number; duration_days: number }> }
  maxRedemptions: number | null
  meters: Array<{ meter_key: string; product_key: string }>
  saving: boolean
  error: string | null
}>()

const emit = defineEmits<{
  close: []
  save: [payload: { tokensRequired?: number; label?: string; maxRedemptionsPerTenant?: number | null; entitlements?: Array<{ meter_key: string; quantity: number; duration_days: number }> }]
}>()

const localMaxRedemptions = ref<number | null>(null)
watch(
  () => [props.voucher, props.maxRedemptions] as const,
  ([v, m]) => {
    if (v) localMaxRedemptions.value = m ?? null
  },
  { immediate: true }
)

function onSubmit() {
  if (props.voucher?.type === 'bundle') {
    emit('save', {
      tokensRequired: props.bundleForm.tokensRequired,
      maxRedemptionsPerTenant: localMaxRedemptions.value ?? undefined,
    })
  } else {
    emit('save', {
      label: props.individualForm.label || undefined,
      maxRedemptionsPerTenant: localMaxRedemptions.value ?? undefined,
      entitlements: props.individualForm.entitlements.filter((e) => e.meter_key?.trim()),
    })
  }
}
</script>
