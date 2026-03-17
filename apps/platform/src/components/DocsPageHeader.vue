<template>
  <header class="docs-page-header">
    <p v-if="subtitle" class="docs-page-header__subtitle">{{ subtitle }}</p>
    <h1 class="docs-page-header__title">{{ title }}</h1>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
}>()
</script>

<style scoped>
.docs-page-header {
  margin-bottom: var(--theme-space-xl);
}

.docs-page-header__subtitle {
  margin: 0 0 var(--theme-space-xs);
  font-size: var(--theme-font-sm);
  font-weight: 500;
  color: var(--theme-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.docs-page-header__title {
  margin: 0;
  font-size: var(--theme-font-2xl);
  font-weight: 600;
  color: var(--theme-text-primary);
  line-height: 1.2;
}
</style>
