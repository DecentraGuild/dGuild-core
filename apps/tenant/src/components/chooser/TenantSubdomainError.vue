<template>
  <div class="tenant-subdomain-error">
    <p class="tenant-subdomain-error__message">
      {{ tenantStore.error || 'This dGuild could not be loaded.' }}
    </p>
    <p class="tenant-subdomain-error__hint">
      Open the main app to choose another dGuild.
    </p>
    <Button as-child class="tenant-subdomain-error__cta">
      <a :href="`${dappEntryOrigin}/`">Open dGuild app</a>
    </Button>
  </div>
</template>

<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { useTenantEntryRouting } from '~/composables/core/useTenantEntryRouting'
import { useTenantStore } from '~/stores/tenant'

const tenantStore = useTenantStore()
const { dappEntryOrigin } = useTenantEntryRouting()
</script>

<style scoped>
.tenant-subdomain-error {
  padding: max(2rem, env(safe-area-inset-top)) max(1.5rem, env(safe-area-inset-right))
    max(2rem, env(safe-area-inset-bottom)) max(1.5rem, env(safe-area-inset-left));
  text-align: center;
  min-height: 100vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--theme-space-md);
  color: var(--theme-text-muted);
  background: var(--theme-bg-primary);
}

.tenant-subdomain-error__message {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-primary);
  max-width: 28rem;
}

.tenant-subdomain-error__hint {
  margin: 0;
  font-size: var(--theme-font-xs);
  max-width: 24rem;
}

.tenant-subdomain-error__cta {
  text-decoration: none;
}
</style>
