<template>
  <Card>
    <CardHeader>
      <CardTitle>Voucher list</CardTitle>
      <CardDescription>Drafts and linked vouchers</CardDescription>
    </CardHeader>
    <CardContent>
      <div v-if="drafts.length === 0 && linked.length === 0" class="text-muted-foreground italic text-sm">
        No vouchers. Create a mint first.
      </div>
      <div v-else class="space-y-4">
        <div v-if="drafts.length > 0">
          <p class="text-muted-foreground mb-2 text-sm font-medium">Drafts (add metadata & link)</p>
          <ul class="space-y-0 divide-y">
            <li
              v-for="d in drafts"
              :key="d.mint"
              class="flex cursor-pointer items-center justify-between gap-3 py-3 transition-colors hover:bg-muted/50 active:bg-muted"
            >
              <code class="font-mono text-xs">{{ d.mint.slice(0, 8) }}…{{ d.mint.slice(-4) }}</code>
              <Button
                size="sm"
                variant="outline"
                :disabled="metadataLoading === d.mint"
                @click.stop="$emit('add-metadata', d.mint)"
              >
                {{ metadataLoading === d.mint ? 'Adding…' : 'Add metadata & link' }}
              </Button>
            </li>
          </ul>
        </div>
        <div v-if="linked.length > 0">
          <p class="text-muted-foreground mb-2 text-sm font-medium">Linked vouchers</p>
          <ul class="space-y-0 divide-y">
            <li
              v-for="l in linked"
              :key="l.mint"
              class="flex cursor-pointer items-center gap-3 py-3 transition-colors hover:bg-muted/50 active:bg-muted"
              @click="$emit('select', l)"
            >
              <code class="font-mono text-xs">{{ l.mint.slice(0, 8) }}…{{ l.mint.slice(-4) }}</code>
              <span class="text-muted-foreground text-sm">{{ l.type }}: {{ l.bundleId ?? l.label ?? '—' }}</span>
            </li>
          </ul>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '~/components/ui/card'
import { Button } from '~/components/ui/button'

defineProps<{
  drafts: Array<{ mint: string; created_at: string }>
  linked: Array<{ mint: string; type: string; bundleId?: string; label?: string }>
  metadataLoading: string | false
}>()

defineEmits<{
  'add-metadata': [mint: string]
  select: [voucher: { mint: string; type: string; bundleId?: string; label?: string }]
}>()
</script>
