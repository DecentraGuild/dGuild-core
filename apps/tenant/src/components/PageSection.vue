<template>
  <section :class="['page-section', { 'page-section--wide': wide }]">
    <div v-if="title || $slots.header || moduleId" class="page-section__header">
      <h2 v-if="title" class="page-section__title">{{ title }}</h2>
      <slot name="header" />
      <ModuleUserCostsInfo v-if="moduleId" :module-id="moduleId" class="page-section__costs-info" />
    </div>
    <slot />
  </section>
</template>

<script setup lang="ts">
import ModuleUserCostsInfo from '~/components/ModuleUserCostsInfo.vue'

withDefaults(
  defineProps<{
    title?: string
    moduleId?: string
    /** Use full content width (e.g. admin / split layouts). Default keeps the narrow reading column. */
    wide?: boolean
  }>(),
  { wide: false }
)
</script>

<style scoped>
.page-section {
  max-width: 56rem;
  margin: 0 auto;
  padding: var(--theme-space-xl) 0;
}

.page-section--wide {
  max-width: none;
  width: 100%;
}

.page-section__header {
  display: flex;
  align-items: center;
  gap: var(--theme-space-lg);
  flex-wrap: wrap;
  margin-bottom: var(--theme-space-md);
}

.page-section__title {
  font-size: var(--theme-font-xl);
  font-weight: 600;
  color: var(--theme-text-primary);
  margin: 0;
}

.page-section__costs-info {
  margin-left: auto;
}
</style>
