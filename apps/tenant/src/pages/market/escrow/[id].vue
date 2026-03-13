<template>
  <div class="escrow-redirect">
    <p>Redirecting to marketplace...</p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'default' })
import { useTenantInLinks } from '~/composables/core/useTenantInLinks'

const route = useRoute()
const tenantStore = useTenantStore()
const { shouldAppendTenantToLinks } = useTenantInLinks()

const id = route.params.id as string
const query: Record<string, string> = { escrow: id }
if (tenantStore.slug && shouldAppendTenantToLinks.value) query.tenant = tenantStore.slug
await navigateTo({ path: '/market', query }, { replace: true })
</script>

<style scoped>
.escrow-redirect {
  padding: var(--theme-space-xl);
  text-align: center;
  color: var(--theme-text-muted);
}
</style>
