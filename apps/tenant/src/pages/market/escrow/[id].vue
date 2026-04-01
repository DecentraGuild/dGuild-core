<template>
  <PageSection module-id="marketplace">
    <ClientOnly>
      <div v-if="!marketplaceActive" class="escrow-page-inactive">
        <p>Marketplace is not enabled for this dGuild.</p>
      </div>
      <div v-else class="escrow-detail-page">
        <div v-if="marketplaceDeactivating" class="escrow-detail-page__banner">
          Marketplace is winding down. You can cancel your trades or claim goods; no new trades can be created or filled.
        </div>
        <div class="escrow-detail-page__card escrow-modal escrow-modal--page">
          <EscrowDetailPanel
            variant="page"
            :escrow-id="escrowId"
            :fill-disabled="marketplaceDeactivating"
            :active="true"
          />
        </div>
      </div>
      <template #fallback>
        <div class="escrow-page-loading">Loading...</div>
      </template>
    </ClientOnly>
  </PageSection>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getModuleState, isModuleVisibleToMembers } from '@decentraguild/core'
import { useTenantStore } from '~/stores/tenant'
import EscrowDetailPanel from '~/modules/marketplace/components/EscrowDetailPanel.vue'

definePageMeta({ layout: 'default' })

const route = useRoute()
const tenantStore = useTenantStore()

const tenant = computed(() => tenantStore.tenant)
const marketplaceState = computed(() => getModuleState(tenant.value?.modules?.marketplace))
const marketplaceActive = computed(() => isModuleVisibleToMembers(marketplaceState.value))
const marketplaceDeactivating = computed(() => marketplaceState.value === 'deactivating')

const escrowId = computed(() => (route.params.id as string) || null)
</script>

<style scoped>
.escrow-page-inactive {
  padding: var(--theme-space-lg);
  color: var(--theme-text-muted);
}

.escrow-page-loading {
  padding: var(--theme-space-lg);
  color: var(--theme-text-secondary);
}

.escrow-detail-page {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
  min-height: 12rem;
}

.escrow-detail-page__banner {
  padding: var(--theme-space-md);
  background: var(--theme-surface-warning);
  border: var(--theme-border-thin) solid var(--theme-warning);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-text-primary);
  font-size: var(--theme-font-sm);
}

.escrow-detail-page__card {
  margin-inline: auto;
  width: 100%;
  max-width: min(90vw, 42rem);
}

.escrow-modal--page {
  background: var(--theme-bg-primary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  box-shadow: var(--theme-shadow-card);
  padding: var(--theme-space-xl);
}
</style>
