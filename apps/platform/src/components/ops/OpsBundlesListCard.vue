<template>
  <Card>
    <CardHeader>
      <CardTitle>Bundles</CardTitle>
    </CardHeader>
    <CardContent>
      <div v-if="bundles.length === 0" class="text-muted-foreground italic text-sm">No bundles yet.</div>
      <ul v-else class="space-y-0 divide-y">
        <li
          v-for="b in bundles"
          :key="b.id"
          class="flex cursor-pointer items-center gap-3 py-3 transition-colors hover:bg-muted/50 active:bg-muted"
          @click="$emit('select', b)"
        >
          <span class="font-mono text-xs">{{ b.id }}</span>
          <span class="text-muted-foreground text-sm">{{ b.label }}</span>
          <span class="text-muted-foreground text-sm">{{ b.product_key }}</span>
        </li>
      </ul>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'

defineProps<{
  bundles: Array<{ id: string; label: string; product_key: string }>
}>()

defineEmits<{ select: [bundle: { id: string; label: string; product_key: string }] }>()
</script>
