<template>
  <aside class="theme-settings__preview" :style="previewStyle">
    <p class="theme-settings__preview-label">Preview</p>
    <div class="theme-settings__preview-content">
      <div class="theme-settings__preview-buttons">
        <button type="button" class="theme-settings__btn theme-settings__btn--primary">
          Primary
        </button>
        <button type="button" class="theme-settings__btn theme-settings__btn--secondary">
          Secondary
        </button>
      </div>
      <div class="theme-settings__preview-card">
        <p class="theme-settings__preview-title">Card title</p>
        <p class="theme-settings__preview-body">Body text and secondary text.</p>
        <p class="theme-settings__preview-muted">Muted caption</p>
      </div>
      <div class="theme-settings__preview-status">
        <span class="theme-settings__pill theme-settings__pill--success">Positive</span>
        <span class="theme-settings__pill theme-settings__pill--error">Negative</span>
        <span class="theme-settings__pill theme-settings__pill--warning">Warning</span>
        <span class="theme-settings__pill theme-settings__pill--info">Info</span>
        <span class="theme-settings__pill theme-settings__pill--destructive">Destructive</span>
      </div>
      <div class="theme-settings__preview-glow">
        <button type="button" class="theme-settings__btn--glow">Glow button</button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { themeToCssVars } from '@decentraguild/ui'
import type { TenantTheme } from '@decentraguild/core'

const props = defineProps<{
  theme: TenantTheme
}>()

const previewStyle = computed(() => {
  const vars = themeToCssVars(props.theme)
  const style: Record<string, string> = {}
  for (const [key, value] of Object.entries(vars)) {
    if (value) style[key] = value
  }
  return style
})
</script>

<style scoped>
.theme-settings__preview {
  padding: var(--theme-space-lg);
  background: var(--theme-bg-primary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  box-shadow: var(--theme-shadow-card);
}

.theme-settings__preview-label {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin: 0 0 var(--theme-space-md);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.theme-settings__preview-content {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-lg);
}

.theme-settings__preview-buttons {
  display: flex;
  gap: var(--theme-space-sm);
  flex-wrap: wrap;
}

.theme-settings__btn {
  padding: var(--theme-space-sm) var(--theme-space-md);
  font-size: var(--theme-font-sm);
  border-radius: var(--theme-radius-sm);
  border: var(--theme-border-thin) solid transparent;
  cursor: default;
  transition: box-shadow 0.2s;
}

.theme-settings__btn--primary {
  background: var(--theme-primary);
  color: var(--theme-primary-inverse);
  border-color: var(--theme-primary);
}

.theme-settings__btn--secondary {
  background: var(--theme-bg-secondary);
  color: var(--theme-text-primary);
  border-color: var(--theme-border);
}

.theme-settings__btn--glow {
  padding: var(--theme-space-sm) var(--theme-space-md);
  font-size: var(--theme-font-sm);
  border-radius: var(--theme-radius-sm);
  border: var(--theme-border-thin) solid var(--theme-primary);
  background: transparent;
  color: var(--theme-primary);
  cursor: default;
  box-shadow: var(--theme-shadow-glow);
  transition: box-shadow 0.2s;
}

.theme-settings__preview-card {
  padding: var(--theme-space-md);
  background: var(--theme-bg-card);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
}

.theme-settings__preview-title {
  font-size: var(--theme-font-lg);
  color: var(--theme-text-primary);
  margin: 0 0 var(--theme-space-xs);
}

.theme-settings__preview-body {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  margin: 0 0 var(--theme-space-xs);
}

.theme-settings__preview-muted {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
  margin: 0;
}

.theme-settings__preview-status,
.theme-settings__preview-glow {
  display: flex;
  flex-wrap: wrap;
  gap: var(--theme-space-xs);
}

.theme-settings__pill {
  padding: var(--theme-space-xs) var(--theme-space-sm);
  font-size: var(--theme-font-xs);
  border-radius: var(--theme-radius-sm);
}

.theme-settings__pill--success {
  background: var(--theme-success);
  color: var(--theme-text-primary);
}

.theme-settings__pill--error {
  background: var(--theme-error);
  color: var(--theme-text-primary);
}

.theme-settings__pill--warning {
  background: var(--theme-warning);
  color: var(--theme-text-primary);
}

.theme-settings__pill--info {
  background: var(--theme-info);
  color: var(--theme-text-primary);
}

.theme-settings__pill--destructive {
  background: hsl(var(--destructive));
  color: hsl(var(--destructive-foreground));
}
</style>
