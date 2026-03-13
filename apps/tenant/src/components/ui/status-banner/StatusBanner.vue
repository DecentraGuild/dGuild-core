<template>
  <Alert :variant="alertVariant" :class="cn('status-banner', props.class)">
    <div class="status-banner__content">
      <slot>
        <p v-if="message">{{ message }}</p>
      </slot>
      <slot v-if="$slots.hint" name="hint" />
      <div v-if="retry || $slots.action" class="status-banner__actions">
        <slot name="action">
          <Button
            v-if="retry"
            variant="outline"
            size="sm"
            @click="$emit('retry')"
          >
            {{ retryLabel }}
          </Button>
        </slot>
      </div>
    </div>
  </Alert>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { Alert } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'

const props = withDefaults(
  defineProps<{
    variant?: 'error' | 'loading' | 'empty' | 'info'
    message?: string
    retry?: boolean
    retryLabel?: string
    class?: HTMLAttributes['class']
  }>(),
  {
    variant: 'info',
    retry: false,
    retryLabel: 'Retry',
  }
)

defineEmits<{ retry: [] }>()

const alertVariant = computed(() => (props.variant === 'error' ? 'destructive' : 'default'))
</script>

<style scoped>
.status-banner {
  padding: var(--theme-space-lg);
  color: var(--theme-text-muted);
}

.status-banner__content {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-sm);
}

.status-banner__actions {
  display: flex;
  align-items: center;
  margin-top: var(--theme-space-xs);
}
</style>
