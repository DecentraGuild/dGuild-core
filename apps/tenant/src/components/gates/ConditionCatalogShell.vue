<template>
  <div class="condition-catalog-shell">
    <div class="condition-catalog-shell__grid">
      <div class="condition-catalog-shell__col condition-catalog-shell__col--mint">
        <h4 class="condition-catalog-shell__col-title">Mint catalog</h4>
        <p v-if="mintHint" class="condition-catalog-shell__col-hint">{{ mintHint }}</p>
        <div class="condition-catalog-shell__scroll">
          <slot name="mint-catalog" />
        </div>
      </div>
      <div class="condition-catalog-shell__col condition-catalog-shell__col--rules">
        <div class="condition-catalog-shell__scroll">
          <slot name="rules-catalog" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  mintHint?: string
}>()
</script>

<style scoped>
.condition-catalog-shell {
  margin-bottom: var(--theme-space-xl);
}

.condition-catalog-shell__grid {
  display: grid;
  grid-template-columns: 1fr 3fr;
  gap: var(--theme-space-lg);
  min-height: 16rem;
}

@media (max-width: 768px) {
  .condition-catalog-shell__grid {
    grid-template-columns: 1fr;
  }
}

.condition-catalog-shell__col {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  padding: var(--theme-space-md);
  background: var(--theme-bg-muted);
}

.condition-catalog-shell__col-title {
  font-size: var(--theme-font-md);
  margin: 0 0 var(--theme-space-xs);
}

.condition-catalog-shell__col-hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin: 0 0 var(--theme-space-sm);
  line-height: 1.4;
}

.condition-catalog-shell__scroll {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  max-height: 25rem;
}
</style>
