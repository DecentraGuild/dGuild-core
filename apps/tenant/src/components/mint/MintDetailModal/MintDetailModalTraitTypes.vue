<template>
  <section v-if="(display.traitTypes?.length ?? 0) > 0" class="mint-modal__section mint-modal__section--bordered">
    <h4 class="mint-modal__section-title">Trait types</h4>
    <div class="mint-modal__trait-pills">
      <span v-for="t in display.traitTypes" :key="t" class="mint-modal__trait-pill">{{ t }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  display: { traitTypes?: string[] }
}>()
</script>
