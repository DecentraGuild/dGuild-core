<template>
  <article class="tenant-discover-card" :style="cardStyle">
    <div class="tenant-discover-card__overlay" aria-hidden="true" />
    <div class="tenant-discover-card__content">
      <span
        class="tenant-discover-card__gate"
        :class="{ 'tenant-discover-card__gate--active': hasGate }"
        :aria-label="hasGate ? 'Gated' : 'Public'"
      >
        <Icon icon="mdi:gate" class="tenant-discover-card__gate-icon" />
      </span>

      <div class="tenant-discover-card__top">
        <h3 class="tenant-discover-card__name">{{ tenant.name }}</h3>
        <p v-if="tenant.description" class="tenant-discover-card__desc">{{ tenant.description }}</p>
      </div>

      <div class="tenant-discover-card__bottom">
        <ul v-if="activeModulesWithGate.length" class="tenant-discover-card__modules">
          <li
            v-for="(mod, i) in activeModulesWithGate"
            :key="i"
            class="tenant-discover-card__module-row"
          >
            <span class="tenant-discover-card__module-name">{{ mod.name }}</span>
            <span
              v-if="mod.hasGate"
              class="tenant-discover-card__module-gate tenant-discover-card__module-gate--active"
              aria-label="Gated"
            >
              <Icon icon="mdi:gate" class="tenant-discover-card__module-gate-icon" />
            </span>
            <span v-else class="tenant-discover-card__module-gate" aria-label="Public">
              <Icon icon="mdi:gate" class="tenant-discover-card__module-gate-icon" />
            </span>
          </li>
        </ul>

        <div class="tenant-discover-card__actions">
          <Button type="button" @click="emit('select', tenant)">
            Open
          </Button>
        </div>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { Button } from '~/components/ui/button'
import type { TenantConfig } from '@decentraguild/core'
import type { ActiveModuleWithGate } from '@decentraguild/discovery'

const props = defineProps<{
  tenant: TenantConfig
  hasGate: boolean
  activeModulesWithGate: ActiveModuleWithGate[]
}>()

const emit = defineEmits<{
  select: [tenant: TenantConfig]
}>()

const cardStyle = computed(() => {
  const logo = props.tenant?.branding?.logo
  if (!logo) return { backgroundColor: 'var(--theme-bg-card)' }
  return {
    backgroundImage: `url(${logo})`,
  }
})
</script>

<style scoped>
.tenant-discover-card {
  position: relative;
  height: 392px;
  background-size: auto 100%;
  background-position: center;
  background-color: var(--theme-bg-secondary);
  border-radius: var(--theme-radius-md);
  overflow: hidden;
  border: 1px solid var(--theme-border);
}

.tenant-discover-card__overlay {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--theme-bg-secondary) 86%, transparent);
  pointer-events: none;
}

.tenant-discover-card__content {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--theme-space-sm) var(--theme-space-md);
  min-height: 0;
}

.tenant-discover-card__gate {
  position: absolute;
  top: var(--theme-space-xs);
  right: var(--theme-space-xs);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--theme-text-muted);
}

.tenant-discover-card__gate--active {
  color: var(--theme-primary);
}

.tenant-discover-card__gate-icon {
  font-size: 1rem;
  color: inherit;
}

.tenant-discover-card__gate :deep(svg),
.tenant-discover-card__module-gate :deep(svg) {
  fill: currentColor;
}

.tenant-discover-card__top {
  flex-shrink: 0;
}

.tenant-discover-card__name {
  margin: 0 0 var(--theme-space-xs);
  font-size: var(--theme-font-sm);
  font-weight: 600;
  color: var(--theme-text-primary);
  line-height: 1.25;
}

.tenant-discover-card__desc {
  margin: 0;
  font-size: var(--theme-font-xs);
  color: var(--theme-text-secondary);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tenant-discover-card__modules {
  margin: 0 0 var(--theme-space-sm);
  padding-left: var(--theme-space-md);
  list-style-type: disc;
  font-size: var(--theme-font-xs);
  color: var(--theme-text-secondary);
  line-height: 1.35;
}

.tenant-discover-card__module-row {
  display: flex;
  align-items: center;
  gap: var(--theme-space-xs);
  margin-bottom: 0.25rem;
}

.tenant-discover-card__module-row:last-child {
  margin-bottom: 0;
}

.tenant-discover-card__module-name {
  flex: 1;
  min-width: 0;
}

.tenant-discover-card__module-gate {
  flex-shrink: 0;
  display: inline-flex;
  color: var(--theme-text-muted);
}

.tenant-discover-card__module-gate--active {
  color: var(--theme-primary);
}

.tenant-discover-card__module-gate-icon {
  font-size: 0.875rem;
  color: inherit;
}

.tenant-discover-card__bottom {
  margin-top: auto;
}

.tenant-discover-card__actions {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
}
</style>
