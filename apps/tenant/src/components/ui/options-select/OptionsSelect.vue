<template>
  <div class="options-select">
    <Label v-if="label" :for="id" class="options-select__label">{{ label }}</Label>
    <Select :model-value="selectValue" :disabled="disabled" @update:model-value="onSelectUpdate">
      <SelectTrigger :id="id" :disabled="disabled" class="w-full">
        <SelectValue :placeholder="placeholder" />
      </SelectTrigger>
      <SelectContent :class="contentClass">
        <template v-if="optionGroups?.length">
          <SelectGroup v-for="grp in safeOptionGroups" :key="grp.groupLabel">
            <SelectLabel>{{ grp.groupLabel }}</SelectLabel>
            <SelectItem
              v-for="opt in grp.options"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </SelectItem>
          </SelectGroup>
        </template>
        <template v-else>
          <SelectItem
            v-for="opt in safeOptions"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </SelectItem>
        </template>
      </SelectContent>
    </Select>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'

/** Reka-ui SelectItem rejects value="". Use sentinel for empty-string options. */
const EMPTY_SENTINEL = '__empty__'

function toSafeValue(v: string): string {
  return v === '' ? EMPTY_SENTINEL : v
}

function fromSafeValue(v: string): string {
  return v === EMPTY_SENTINEL ? '' : v
}
import Label from '~/components/ui/label/Label.vue'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    label?: string
    placeholder?: string
    options?: { value: string; label: string }[]
    optionGroups?: { groupLabel: string; options: { value: string; label: string }[] }[]
    disabled?: boolean
    /** Use when inside a modal so dropdown appears above overlay (e.g. z-[9999]) */
    contentClass?: string
  }>(),
  { options: () => [], optionGroups: undefined, disabled: false, contentClass: '' }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const id = useId()

const selectValue = computed(() => toSafeValue(props.modelValue ?? ''))

function onSelectUpdate(v: string) {
  emit('update:modelValue', fromSafeValue(v))
}

const safeOptions = computed(() =>
  props.options.map((opt) => ({
    ...opt,
    value: toSafeValue(opt.value),
  }))
)

const safeOptionGroups = computed(() =>
  props.optionGroups?.map((grp) => ({
    ...grp,
    options: grp.options.map((opt) => ({
      ...opt,
      value: toSafeValue(opt.value),
    })),
  })) ?? []
)
</script>

<style scoped>
.options-select {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
}

.options-select__label {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}
</style>
