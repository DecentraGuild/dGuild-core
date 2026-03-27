<template>
  <Card class="col-span-full">
    <CardHeader>
      <CardTitle>Audit log</CardTitle>
      <CardDescription>Recent platform changes</CardDescription>
    </CardHeader>
    <CardContent>
      <div v-if="loading" class="text-muted-foreground text-sm">Loading audit log…</div>
      <div v-else-if="error" class="text-destructive text-sm">{{ error }}</div>
      <div v-else class="max-h-[80vh] overflow-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b">
              <th class="h-8 px-3 text-left font-medium">When</th>
              <th class="h-8 px-3 text-left font-medium">Actor</th>
              <th class="h-8 px-3 text-left font-medium">Action</th>
              <th class="h-8 px-3 text-left font-medium">Target</th>
              <th class="h-8 px-3 text-left font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in entries" :key="entry.id" class="border-b">
              <td class="p-3">{{ formatDateTime(entry.createdAt) }}</td>
              <td class="max-w-[180px] truncate font-mono p-3">{{ entry.actorWallet }}</td>
              <td class="p-3">{{ entry.action }}</td>
              <td class="p-3">
                <span v-if="entry.targetType">
                  {{ entry.targetType }}: {{ entry.targetId ?? 'n/a' }}
                </span>
                <span v-else class="text-muted-foreground">n/a</span>
              </td>
              <td class="max-w-[260px] p-3">
                <pre v-if="entry.details" class="max-h-[5.5rem] overflow-auto rounded bg-muted p-2 font-mono text-[0.65rem]">{{ formatDetails(entry.details) }}</pre>
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '~/components/ui/card'
import { formatDateTime } from '@decentraguild/display'

defineProps<{
  entries: Array<{
    id: string
    actorWallet: string
    action: string
    targetType: string | null
    targetId: string | null
    details: Record<string, unknown> | null
    createdAt: string
  }>
  loading: boolean
  error: string | null
}>()

function formatDetails(details: Record<string, unknown> | null): string {
  if (!details) return ''
  return JSON.stringify(details, null, 2)
}
</script>
