<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { Icon } from '@iconify/vue'
import {
  DialogClose,
  DialogContent,
  DialogPortal,
  useForwardPropsEmits,
} from 'reka-ui'
import { cn } from '~/lib/utils'
import SheetOverlay from './SheetOverlay.vue'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<DialogContentProps & { class?: HTMLAttributes['class']; side?: 'top' | 'right' | 'bottom' | 'left'; showCloseButton?: boolean }>(),
  { side: 'right', showCloseButton: true },
)
const emits = defineEmits<DialogContentEmits>()

const delegatedProps = reactiveOmit(props, 'class', 'side')
const forwarded = useForwardPropsEmits(delegatedProps, emits)

const slideInFrom = {
  top: 'data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top',
  right: 'data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
  bottom: 'data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
  left: 'data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left',
}
</script>

<template>
  <DialogPortal>
    <SheetOverlay />
    <DialogContent
      data-slot="sheet-content"
      v-bind="{ ...$attrs, ...forwarded }"
      :class="cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500',
        side === 'right' && 'inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm',
        side === 'left' && 'inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm',
        side === 'top' && 'inset-x-0 top-0 border-b',
        side === 'bottom' && 'inset-x-0 bottom-0 border-t',
        slideInFrom[side],
        props.class,
      )"
    >
      <slot />
      <DialogClose
        v-if="showCloseButton"
        data-slot="sheet-close"
        class="absolute top-4 right-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none disabled:pointer-events-none"
      >
        <Icon icon="lucide:x" />
        <span class="sr-only">Close</span>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
