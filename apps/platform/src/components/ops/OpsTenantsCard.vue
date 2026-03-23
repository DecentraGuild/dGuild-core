<template>
  <Card>
    <CardHeader>
      <CardTitle>Tenants</CardTitle>
    </CardHeader>
    <CardContent>
      <div v-if="loading" class="text-muted-foreground text-sm">Loading tenants…</div>
      <div v-else-if="error" class="text-destructive text-sm">{{ error }}</div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b">
              <th class="h-9 px-4 text-left font-medium">Name</th>
              <th class="h-9 px-4 text-left font-medium">Slug</th>
              <th class="h-9 px-4 text-left font-medium">Modules</th>
              <th class="h-9 px-4 text-left font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="t in tenants"
              :key="t.id"
              class="cursor-pointer border-b transition-colors hover:bg-muted/50 active:bg-muted"
              @click="$emit('select', t)"
            >
              <td class="p-4">{{ t.name }}</td>
              <td class="p-4">
                <span v-if="t.slug" class="font-mono text-xs">{{ t.slug }}</span>
                <span v-else class="text-muted-foreground font-mono text-xs">id only</span>
              </td>
              <td class="p-4">{{ Object.keys(t.modules ?? {}).length }}</td>
              <td class="p-4">
                <span v-if="t.createdAt">{{ formatDate(t.createdAt) }}</span>
                <span v-else class="text-muted-foreground">n/a</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { formatDate } from '@decentraguild/display'

defineProps<{
  tenants: Array<{
    id: string
    slug: string | null
    name: string
    modules: Record<string, unknown>
    createdAt: string | null
  }>
  loading: boolean
  error: string | null
}>()

defineEmits<{ select: [tenant: { id: string }] }>()
</script>
