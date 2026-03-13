<template>
  <form class="raffle-edit-form" @submit.prevent="$emit('submit')">
    <p class="raffle-edit-form__hint">You can only edit name, description and image when the raffle is paused.</p>
    <FormInput v-model="form.name" label="Name" placeholder="Raffle name" required />
    <FormInput v-model="form.description" label="Description" placeholder="Brief description" />
    <FormInput v-model="form.url" label="Image URL" placeholder="https://..." />
    <div class="raffle-edit-form__actions">
      <Button variant="secondary" type="button" @click="$emit('cancel')">Cancel</Button>
      <Button variant="default" type="submit" :disabled="submitting">
        Save
      </Button>
    </div>
  </form>
</template>

<script setup lang="ts">
import FormInput from '~/components/ui/form-input/FormInput.vue'
import { Button } from '~/components/ui/button'

const form = defineModel<{ name: string; description: string; url: string }>('form', { required: true })

defineProps<{
  submitting: boolean
}>()

defineEmits<{ submit: []; cancel: [] }>()
</script>

<style scoped>
.raffle-edit-form {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
  min-width: 320px;
}
.raffle-edit-form__hint {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}
.raffle-edit-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--theme-space-sm);
  margin-top: var(--theme-space-sm);
}
</style>
