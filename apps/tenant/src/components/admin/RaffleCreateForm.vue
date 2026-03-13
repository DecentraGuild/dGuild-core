<template>
  <form class="raffle-create-form" @submit.prevent="$emit('submit')">
    <FormInput
      v-model="form.name"
      label="Name"
      placeholder="Raffle name"
      required
    />
    <FormInput
      v-model="form.description"
      label="Description"
      placeholder="Brief description"
    />
    <div class="raffle-mint-row">
      <FormInput
        v-model="form.ticketMint"
        label="Ticket token mint"
        placeholder="SPL token mint address"
        class="raffle-mint-row__input"
        required
      />
      <AddressBookBrowser kind="SPL" @select="(mint) => { form.ticketMint = mint }" />
    </div>
    <FormInput
      v-model="form.ticketPriceDisplay"
      type="number"
      :label="ticketMeta.label"
      :placeholder="ticketMeta.placeholder"
    />
    <p v-if="ticketMeta.hint" class="raffle-create-form__hint">{{ ticketMeta.hint }}</p>
    <FormInput
      v-model="form.maxTicketsDisplay"
      type="number"
      label="Max tickets"
      placeholder="e.g. 100"
      required
    />
    <GateSelect
      v-if="showGateSelect"
      :slug="slug"
      :model-value="form.gate"
      :label="`${gateLabel} (this raffle)`"
      show-use-default
      @update:model-value="form.gate = $event"
    />
    <p v-if="error" class="raffle-create-form__error">{{ error }}</p>
    <div class="raffle-create-form__actions">
      <slot name="actions">
        <Button variant="secondary" type="button" @click="$emit('cancel')">
          Cancel
        </Button>
        <Button variant="default" type="submit" :disabled="submitting">
          {{ submitting ? 'Creating...' : 'Create raffle' }}
        </Button>
      </slot>
    </div>
  </form>
</template>

<script setup lang="ts">
import { getGateLabel } from '@decentraguild/config'
import FormInput from '~/components/ui/form-input/FormInput.vue'
import { Button } from '~/components/ui/button'
import GateSelect from '~/components/gates/GateSelect.vue'
import AddressBookBrowser from '~/components/shared/AddressBookBrowser.vue'

const gateLabel = getGateLabel()

defineProps<{
  form: {
    name: string
    description: string
    ticketMint: string
    ticketPriceDisplay: string
    maxTicketsDisplay: string
    gate: { programId: string; account: string } | null | 'use-default'
  }
  slug: string
  showGateSelect: boolean
  submitting: boolean
  error: string | null
  ticketMeta: { label: string; placeholder: string; hint: string }
}>()

defineEmits<{
  submit: []
  cancel: []
}>()
</script>
