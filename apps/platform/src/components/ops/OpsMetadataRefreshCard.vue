<template>
  <Card>
    <CardHeader>
      <CardTitle>Mint metadata</CardTitle>
      <CardDescription>
        After db reset, run <strong>Seed from configs</strong> first to populate <code>mint_metadata</code> and enqueue empty marketplace collections for the <code>mint-catalog-index</code> worker. <strong>Refresh batch</strong> uses that worker: same mint scope (defaults, <code>tenant_mint_catalog</code>, watches, marketplace, vouchers, collection members), rich DAS metadata (SPL, NFT, Token-2022, Core), merges with existing rows, and re-enqueues collection member indexing where applicable.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div class="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="default"
          :disabled="loading"
          @click="$emit('seed')"
        >
          {{ loading ? 'Seeding…' : 'Seed from configs' }}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          :disabled="loading"
          @click="$emit('refresh', 200)"
        >
          {{ loading ? 'Refreshing…' : 'Refresh batch (200)' }}
        </Button>
        <Button
          size="sm"
          variant="outline"
          :disabled="loading"
          @click="$emit('refresh', 500)"
        >
          Refresh batch (500)
        </Button>
      </div>
      <p v-if="result" class="mt-2 text-muted-foreground text-sm">{{ result }}</p>
      <p v-if="error" class="mt-2 text-destructive text-sm">{{ error }}</p>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '~/components/ui/card'
import { Button } from '~/components/ui/button'

defineProps<{
  loading: boolean
  result: string | null
  error: string | null
}>()

defineEmits<{
  seed: []
  refresh: [limit: number]
}>()
</script>
