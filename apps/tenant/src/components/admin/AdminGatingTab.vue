<template>
  <div class="admin__split">
    <div class="admin__panel">
      <Card>
        <h3>Gates</h3>
        <p class="admin-gating__hint">
          Configure who can access each area. dGuild default applies to the community; modules can use it or override.
        </p>
        <div class="admin-gating__list">
          <div
            v-for="scope in scopes"
            :key="scope.id"
            class="admin-gating__row"
          >
            <GateSelectRowModule
              layout="stacked"
              :slug="slug"
              :model-value="getValue(scope.id)"
              :title="scope.label"
              :show-use-default="scope.id !== 'default'"
              show-admin-only
              show-save
              save-label="Save"
              :dirty="dirty[scope.id]"
              :loading="rowState[scope.id].saving"
              :save-success="rowState[scope.id].saveSuccess"
              :save-error="rowState[scope.id].saveError"
              @update:model-value="onUpdate(scope.id, $event)"
              @save="save(scope.id)"
            />
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getGatingScopes } from '@decentraguild/catalog'
import { Card } from '~/components/ui/card'
import GateSelectRowModule from '~/components/gates/GateSelectRowModule.vue'
import { useAdminGating } from '~/composables/admin/useAdminGating'
import type { Ref } from 'vue'
import type { MarketplaceGateSettings } from '@decentraguild/core'

const props = defineProps<{
  defaultGateRef: Ref<MarketplaceGateSettings | null | 'admin-only'>
}>()

const { slug, getValue, dirty, rowState, onUpdate, save } = useAdminGating(props.defaultGateRef)

const scopes = getGatingScopes()
</script>

<style scoped>
.admin-gating__hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin-bottom: var(--theme-space-lg);
  line-height: 1.5;
}

.admin-gating__list {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}

.admin-gating__row {
  padding-bottom: var(--theme-space-md);
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.admin-gating__row:last-child {
  padding-bottom: 0;
  border-bottom: none;
}
</style>
