<template>
  <div class="admin__panel">
    <AdminDiscordSettings ref="settingsRef" :slug="slug ?? ''" />
  </div>
</template>

<script setup lang="ts">
import AdminDiscordSettings from '~/components/admin/AdminDiscordSettings.vue'

defineProps<{
  slug: string
}>()

const settingsRef = ref<InstanceType<typeof AdminDiscordSettings> | null>(null)
</script>
