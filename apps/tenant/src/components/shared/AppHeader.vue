<template>
  <div class="app-header">
    <div class="app-header__left">
      <div v-if="$slots.leading" class="app-header__leading">
        <slot name="leading" />
      </div>
      <slot name="logo">
        <img
          v-if="logo"
          :src="logo"
          :alt="name"
          class="app-header__logo"
        >
      </slot>
      <span class="app-header__name">{{ name || 'dGuild' }}</span>
      <div v-if="$slots.nav" class="app-header__nav">
        <slot name="nav" />
      </div>
    </div>
    <div v-if="$slots.actions" class="app-header__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  logo?: string
  name?: string
}>()
</script>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--theme-space-md) var(--theme-space-xl);
}

@media (max-width: 767px) {
  .app-header {
    padding-inline: var(--theme-space-md);
  }
}

.app-header__left {
  display: flex;
  align-items: center;
  gap: var(--theme-space-md);
  min-width: 0;
}

.app-header__leading {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.app-header__logo {
  max-height: 2rem;
  width: auto;
  max-width: 9rem;
  object-fit: contain;
  object-position: left center;
  border-radius: 0;
  flex-shrink: 0;
}

.app-header__name {
  font-size: var(--theme-font-lg);
  font-weight: 700;
  flex-shrink: 0;
  background: var(--theme-gradient-primary, var(--theme-primary));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: var(--theme-primary);
}

.app-header__nav {
  display: flex;
  gap: var(--theme-space-sm);
  align-items: center;
  min-width: 0;
}

@media (max-width: 767px) {
  .app-header__name {
    display: none;
  }

  .app-header__nav {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    flex-wrap: nowrap;
  }
}

.app-header__actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
</style>
