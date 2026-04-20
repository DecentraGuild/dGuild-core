<template>
  <TenantChooser />
</template>

<script setup lang="ts">
import TenantChooser from '~/components/chooser/TenantChooser.vue'

definePageMeta({
  title: 'Discover',
  middleware: ['discover-reset'],
})
</script>
