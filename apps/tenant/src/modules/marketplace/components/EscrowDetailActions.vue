<template>
  <div class="escrow-modal__owner-actions">
    <Button
      variant="default"
      :disabled="cancelling"
      @click="$emit('cancel')"
    >
      {{ cancelling ? 'Cancelling...' : 'Cancel' }}
    </Button>
  </div>
</template>

<script setup lang="ts">
import { Button } from '~/components/ui/button'

defineProps<{
  cancelling: boolean
}>()

defineEmits<{
  cancel: []
}>()
</script>
