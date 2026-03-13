<template>
  <Dialog :open="modelValue" @update:open="$emit('update:modelValue', $event)">
    <DialogContent :class="contentClass">
      <DialogHeader>
        <DialogTitle v-if="title">{{ title }}</DialogTitle>
        <DialogDescription class="sr-only">
          {{ title ? `${title} dialog` : 'Dialog' }}
        </DialogDescription>
      </DialogHeader>
      <slot />
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    wide?: boolean
    extraWide?: boolean
  }>(),
  { wide: false, extraWide: false }
)

const contentClass = computed(() => {
  if (props.extraWide) return 'sm:max-w-[80vw]'
  if (props.wide) return 'sm:max-w-[42rem]'
  return ''
})

defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>
