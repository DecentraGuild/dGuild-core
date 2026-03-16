<template>
  <Card>
    <CardHeader>
      <CardTitle>Billing</CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      <div v-if="loading" class="text-muted-foreground text-sm">Loading billing…</div>
      <div v-else-if="error" class="text-destructive text-sm">{{ error }}</div>
      <template v-else>
        <div class="flex flex-wrap gap-6">
          <div>
            <p class="text-muted-foreground text-xs">MRR</p>
            <p class="font-semibold">{{ formatUsdc(summary.totalMrrUsdc) }} USDC / month</p>
          </div>
          <div>
            <p class="text-muted-foreground text-xs">Active subscriptions</p>
            <p class="font-semibold">{{ summary.activeSubscriptions }}</p>
          </div>
        </div>
        <div>
          <p class="text-muted-foreground mb-2 text-sm font-medium">Recent payments</p>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b">
                  <th class="h-8 px-3 text-left font-medium">Tenant</th>
                  <th class="h-8 px-3 text-left font-medium">Product</th>
                  <th class="h-8 px-3 text-left font-medium">Amount</th>
                  <th class="h-8 px-3 text-left font-medium">Confirmed</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in recentPayments" :key="p.id" class="border-b">
                  <td class="p-3">{{ p.tenantSlug }}</td>
                  <td class="p-3">{{ p.moduleId }}</td>
                  <td class="p-3">{{ formatUsdc(p.amountUsdc) }} USDC</td>
                  <td class="p-3">
                    <span v-if="p.confirmedAt">{{ formatDateTime(p.confirmedAt) }}</span>
                    <span v-else class="text-muted-foreground">n/a</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { formatDateTime, formatUsdc } from '@decentraguild/core'

defineProps<{
  summary: { totalMrrUsdc: number; activeSubscriptions: number }
  recentPayments: Array<{
    id: string
    tenantSlug: string
    moduleId: string
    amountUsdc: number
    confirmedAt: string | null
  }>
  loading: boolean
  error: string | null
}>()
</script>
