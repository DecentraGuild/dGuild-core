<template>
  <Card>
    <CardHeader>
      <CardTitle>Create bundle</CardTitle>
    </CardHeader>
    <CardContent>
      <form class="space-y-4" @submit.prevent="$emit('submit')">
        <div class="space-y-2">
          <label for="bundle-id" class="text-sm font-medium">Bundle ID (slug)</label>
          <input
            id="bundle-id"
            v-model="form.id"
            type="text"
            placeholder="e.g. starterpack"
            class="flex h-9 w-full max-w-[280px] rounded-md border border-input bg-background px-3 py-1 text-sm"
            required
          />
        </div>
        <div class="space-y-2">
          <label for="bundle-label" class="text-sm font-medium">Label</label>
          <input
            id="bundle-label"
            v-model="form.label"
            type="text"
            placeholder="Starter Pack"
            class="flex h-9 w-full max-w-[280px] rounded-md border border-input bg-background px-3 py-1 text-sm"
            required
          />
        </div>
        <div class="space-y-2">
          <label for="bundle-product" class="text-sm font-medium">Product key</label>
          <input
            id="bundle-product"
            v-model="form.productKey"
            type="text"
            placeholder="e.g. starterpack"
            class="flex h-9 w-full max-w-[280px] rounded-md border border-input bg-background px-3 py-1 text-sm"
            required
          />
        </div>
        <div class="space-y-2">
          <label for="bundle-price" class="text-sm font-medium">Price USDC</label>
          <input
            id="bundle-price"
            v-model.number="form.priceUsdc"
            type="number"
            step="0.01"
            min="0"
            class="flex h-9 w-full max-w-[280px] rounded-md border border-input bg-background px-3 py-1 text-sm"
            required
          />
        </div>
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium">Entitlements</span>
            <Button type="button" size="sm" variant="outline" @click="$emit('add-entitlement')">
              Add row
            </Button>
          </div>
          <div v-for="(e, i) in form.entitlements" :key="i" class="flex flex-wrap items-center gap-2">
            <select
              v-model="e.meter_key"
              class="min-w-[180px] rounded-md border border-input bg-background px-3 py-1.5 text-sm"
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
              class="w-16 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              required
            />
            <input
              v-model.number="e.duration_days"
              type="number"
              min="0"
              placeholder="Days"
              class="w-16 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              required
            />
            <Button type="button" size="sm" variant="ghost" @click="$emit('remove-entitlement', i)">
              Remove
            </Button>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Button type="submit" size="sm" :disabled="loading">
            {{ loading ? 'Creating…' : 'Create bundle' }}
          </Button>
          <p v-if="createError" class="text-destructive text-sm">{{ createError }}</p>
          <p v-if="createSuccess" class="text-muted-foreground text-sm">{{ createSuccess }}</p>
        </div>
      </form>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Button } from '~/components/ui/button'

const props = defineProps<{
  form: {
    id: string
    label: string
    productKey: string
    priceUsdc: number
    entitlements: Array<{ meter_key: string; quantity: number; duration_days: number }>
  }
  meters: Array<{ meter_key: string; product_key: string }>
  loading: boolean
  createError: string | null
  createSuccess: string | null
}>()

defineEmits<{
  submit: []
  'add-entitlement': []
  'remove-entitlement': [index: number]
}>()
</script>
