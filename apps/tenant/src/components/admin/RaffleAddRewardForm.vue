<template>
  <form class="raffle-add-reward-form" @submit.prevent="$emit('submit')">
    <div class="raffle-mint-row">
      <FormInput
        v-model="form.prizeMint"
        label="Prize token mint"
        placeholder="SPL token mint address"
        class="raffle-mint-row__input"
        required
      />
      <AddressBookBrowser kind="SPL" @select="(mint) => { form.prizeMint = mint }" />
    </div>
    <FormInput
      v-model="form.amountDisplay"
      type="number"
      :label="prizeMintMeta.label"
      :placeholder="prizeMintMeta.placeholder"
      required
    />
    <p v-if="prizeMintMeta.hint" class="raffle-add-reward-form__hint">{{ prizeMintMeta.hint }}</p>
    <FormInput
      v-model="form.imageUrl"
      label="Image URL (optional)"
      placeholder="https://..."
    />
    <p v-if="error" class="raffle-add-reward-form__error">{{ error }}</p>
    <div class="raffle-add-reward-form__actions">
      <Button variant="secondary" type="button" @click="$emit('cancel')">
        Cancel
      </Button>
      <Button variant="default" type="submit" :disabled="submitting">
        {{ submitting ? 'Adding...' : 'Add reward' }}
      </Button>
    </div>
  </form>
</template>

<script setup lang="ts">
import FormInput from '~/components/ui/form-input/FormInput.vue'
import { Button } from '~/components/ui/button'
import AddressBookBrowser from '~/components/shared/AddressBookBrowser.vue'

const form = defineModel<{
  prizeMint: string
  amountDisplay: string
  imageUrl: string
}>('form', { required: true })

defineProps<{
  prizeMintMeta: { label: string; placeholder: string; hint?: string }
  submitting: boolean
  error: string | null
}>()

defineEmits<{ submit: []; cancel: [] }>()
</script>

<style scoped>
.raffle-add-reward-form {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
  min-width: 0;
  max-width: 100%;
  overflow-x: hidden;
  overflow-wrap: break-word;
}
.raffle-add-reward-form :deep(input) {
  max-width: 100%;
  box-sizing: border-box;
}
.raffle-add-reward-form__hint {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}
.raffle-add-reward-form__error {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-error);
}
.raffle-add-reward-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--theme-space-sm);
  margin-top: var(--theme-space-sm);
}
.raffle-mint-row {
  display: flex;
  align-items: flex-end;
  gap: var(--theme-space-xs);
}
.raffle-mint-row__input {
  flex: 1;
  min-width: 0;
}
</style>
