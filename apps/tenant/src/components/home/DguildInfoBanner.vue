<template>
  <div class="dguild-info-banner">
    <div class="dguild-info-banner__brand">
      <img
        v-if="logo"
        :src="logo"
        :alt="name"
        class="dguild-info-banner__logo"
      >
      <span v-else class="dguild-info-banner__logo-placeholder">{{ name.charAt(0) }}</span>
      <div class="dguild-info-banner__brand-text">
        <h1 class="dguild-info-banner__name">{{ name }}</h1>
        <p v-if="description" class="dguild-info-banner__desc">{{ description }}</p>
      </div>
    </div>
    <div v-if="hasLinks" class="dguild-info-banner__links">
      <a
        v-if="homepage"
        :href="homepage"
        target="_blank"
        rel="noopener noreferrer"
        class="dguild-info-banner__link"
      >
        <Icon icon="lucide:globe" class="dguild-info-banner__link-icon" />
        Homepage
      </a>
      <a
        v-if="xLink"
        :href="xLink"
        target="_blank"
        rel="noopener noreferrer"
        class="dguild-info-banner__link"
      >
        <Icon icon="simple-icons:x" class="dguild-info-banner__link-icon" />
        X
      </a>
      <a
        v-if="discord"
        :href="discord"
        target="_blank"
        rel="noopener noreferrer"
        class="dguild-info-banner__link"
      >
        <Icon icon="simple-icons:discord" class="dguild-info-banner__link-icon" />
        Discord
      </a>
      <a
        v-if="telegram"
        :href="telegram"
        target="_blank"
        rel="noopener noreferrer"
        class="dguild-info-banner__link"
      >
        <Icon icon="simple-icons:telegram" class="dguild-info-banner__link-icon" />
        Telegram
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'

const props = withDefaults(
  defineProps<{
    name: string
    description?: string
    logo?: string
    homepage?: string
    discord?: string
    xLink?: string
    telegram?: string
  }>(),
  { name: 'dGuild' }
)

const hasLinks = computed(
  () =>
    Boolean(props.homepage?.trim()) ||
    Boolean(props.discord?.trim()) ||
    Boolean(props.xLink?.trim()) ||
    Boolean(props.telegram?.trim())
)
</script>

<style scoped>
.dguild-info-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--theme-space-lg);
  padding: var(--theme-space-lg);
  background: radial-gradient(circle at top right, rgba(255, 255, 255, 0.04), transparent 55%),
    var(--theme-bg-card);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  margin-bottom: var(--theme-space-lg);
}

.dguild-info-banner__brand {
  display: flex;
  align-items: center;
  gap: var(--theme-space-md);
  min-width: 0;
}

.dguild-info-banner__logo,
.dguild-info-banner__logo-placeholder {
  width: 3rem;
  height: 3rem;
  border-radius: var(--theme-radius-md);
  object-fit: cover;
  flex-shrink: 0;
}

.dguild-info-banner__logo-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--theme-bg-secondary);
  color: var(--theme-text-secondary);
  font-size: var(--theme-font-xl);
  font-weight: 600;
}

.dguild-info-banner__brand-text {
  min-width: 0;
}

.dguild-info-banner__name {
  font-size: var(--theme-font-2xl);
  font-weight: 600;
  margin: 0;
}

.dguild-info-banner__desc {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  margin: var(--theme-space-xs) 0 0;
  line-height: 1.4;
}

.dguild-info-banner__links {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--theme-space-sm) var(--theme-space-md);
  flex-shrink: 0;
}

.dguild-info-banner__link {
  display: inline-flex;
  align-items: center;
  gap: var(--theme-space-xs);
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  text-decoration: none;
  transition: color 0.15s ease;
}

.dguild-info-banner__link:hover {
  color: var(--theme-primary);
}

.dguild-info-banner__link-icon {
  font-size: 1.25rem;
}
</style>
