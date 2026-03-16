<script setup lang="ts">
import type { CollapsibleContentEmits, CollapsibleContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { CollapsibleContent, useForwardPropsEmits } from 'reka-ui'
import { cn } from '~/lib/utils'

const props = defineProps<CollapsibleContentProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<CollapsibleContentEmits>()

const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <CollapsibleContent
    data-slot="collapsible-content"
    v-bind="forwarded"
    :class="cn(
      'overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down',
      props.class,
    )"
  >
    <slot />
  </CollapsibleContent>
</template>
