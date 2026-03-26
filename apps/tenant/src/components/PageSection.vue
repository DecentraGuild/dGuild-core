<template>
  <section class="page-section">
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

defineProps<{
  title?: string
  moduleId?: string
}>()
</script>

<style scoped>
.page-section {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: var(--theme-space-xl) 0;
  box-sizing: border-box;
}

.page-section__header {
  display: flex;
  align-items: center;
  gap: var(--theme-space-lg);
  flex-wrap: wrap;
  min-width: 0;
  margin-bottom: var(--theme-space-md);
}

.page-section__title {
  font-size: var(--theme-font-xl);
  font-weight: 700;
  margin: 0;
  background: var(--theme-gradient-primary, var(--theme-primary));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: var(--theme-primary);
}

.page-section__costs-info {
  margin-left: auto;
}
</style>
