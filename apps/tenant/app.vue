<template>
  <div v-if="tenantStore.loading && !tenantStore.tenant" class="app-entry__loading">Loading...</div>
  <TenantSubdomainError v-else-if="showSubdomainMissing" />
  <NuxtPage v-else-if="isTenantSingleHost && route.path === '/discover'" />
  <TenantChooser v-else-if="!tenantStore.tenant" />
  <NuxtLayout v-else>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
import TenantChooser from '~/components/chooser/TenantChooser.vue'
import TenantSubdomainError from '~/components/chooser/TenantSubdomainError.vue'
import { useTenantEntryRouting } from '~/composables/core/useTenantEntryRouting'
import { useTenantSingleHost } from '~/composables/core/useTenantSingleHost'
import { useTenantStore } from '~/stores/tenant'

const route = useRoute()
const tenantStore = useTenantStore()
const { showSubdomainMissing } = useTenantEntryRouting()
const isTenantSingleHost = useTenantSingleHost()
</script>

<style scoped>
.app-entry__loading {
  padding: 2rem;
  text-align: center;
  color: var(--theme-text-muted);
  background: var(--theme-bg-primary);
  min-height: 100vh;
}
</style>
