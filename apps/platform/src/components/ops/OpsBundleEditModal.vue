<template>
  <Dialog :open="!!bundleId" @update:open="(v: boolean) => !v && $emit('close')">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Edit bundle: {{ bundleId }}</DialogTitle>
        <DialogDescription>Update label, product key, price, and entitlements.</DialogDescription>
      </DialogHeader>
      <form v-if="form" class="space-y-4" @submit.prevent="$emit('save', form)">
        <div class="space-y-2">
          <label for="edit-bundle-label" class="text-sm font-medium text-foreground">Label</label>
          <input
            id="edit-bundle-label"
            v-model="form.label"
            type="text"
            class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground"
            required
          />
        </div>
        <div class="space-y-2">
          <label for="edit-bundle-product" class="text-sm font-medium text-foreground">Product key</label>
          <input
            id="edit-bundle-product"
            v-model="form.productKey"
            type="text"
            class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground"
            required
          />
        </div>
        <div class="space-y-2">
          <label for="edit-bundle-price" class="text-sm font-medium text-foreground">Price USDC</label>
          <input
            id="edit-bundle-price"
            v-model.number="form.priceUsdc"
            type="number"
            step="0.01"
            min="0"
            class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground"
            required
          />
        </div>
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-foreground">Entitlements</span>
            <Button type="button" size="sm" variant="outline" @click="form.entitlements.push({ meter_key: '', quantity: 1, duration_days: 30 })">
              Add row
            </Button>
          </div>
          <div v-for="(e, i) in form.entitlements" :key="i" class="flex flex-wrap items-center gap-2">
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
            <input
              v-model.number="e.quantity"
              type="number"
              min="1"
              placeholder="Qty"
              class="w-14 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
            />
            <input
              v-model.number="e.duration_days"
              type="number"
              min="0"
              placeholder="Days"
              class="w-14 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
            />
            <Button type="button" size="sm" variant="ghost" @click="form.entitlements.splice(i, 1)">Remove</Button>
          </div>
        </div>
        <DialogFooter :show-close-button="true">
          <Button type="submit" size="sm" :disabled="saving">
            {{ saving ? 'Saving…' : 'Save' }}
          </Button>
          <p v-if="error" class="col-span-full text-destructive text-sm">{{ error }}</p>
        </DialogFooter>
      </form>
      <div v-else-if="loading" class="py-4 text-muted-foreground text-sm">Loading…</div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'

defineProps<{
  bundleId: string | null
  meters: Array<{ meter_key: string; product_key: string }>
  loading: boolean
  saving: boolean
  error: string | null
}>()

const form = defineModel<{
  label: string
  productKey: string
  priceUsdc: number
  entitlements: Array<{ meter_key: string; quantity: number; duration_days: number }>
} | null>('form', { required: true })

defineEmits<{
  close: []
  save: [form: { label: string; productKey: string; priceUsdc: number; entitlements: Array<{ meter_key: string; quantity: number; duration_days: number }> }]
}>()
</script>
