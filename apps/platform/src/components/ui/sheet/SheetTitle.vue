<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { DialogTitle, type DialogTitleProps } from 'reka-ui'
import { cn } from '~/lib/utils'

const props = defineProps<DialogTitleProps & { class?: HTMLAttributes['class'] }>()
</script>

<template>
  <DialogTitle
    data-slot="sheet-title"
    :class="cn('text-lg font-semibold', props.class)"
  >
    <slot />
  </DialogTitle>
</template>
