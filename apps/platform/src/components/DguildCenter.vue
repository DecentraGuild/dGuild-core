<template>
  <article class="dguild-center">
    <div class="dguild-center__left">
      <span class="dguild-center__icon-wrap">
        <Icon icon="mdi:home" class="dguild-center__icon" />
      </span>
      <span class="dguild-center__label">dGuild</span>
      <NuxtLink to="/onboard" class="dguild-center__cta dguild-center__cta--left">
        <Button variant="primary" size="sm">Create org</Button>
      </NuxtLink>
    </div>
    <div class="dguild-center__right">
      <p class="dguild-center__desc">{{ intro }}</p>
      <ul class="dguild-center__key-info">
        <li v-for="(item, i) in keyPoints" :key="i">{{ item }}</li>
      </ul>
      <p class="dguild-center__desc">{{ designedFor }}</p>
      <p class="dguild-center__desc">{{ protocolLayer }}</p>
    </div>
  </article>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { Button } from '@decentraguild/ui/components'

const intro = 'With dGuild Custom, partners can:'

const keyPoints = [
  'Select specific modules from the catalog',
  'Define custom module combinations',
  'Adjust logic parameters beyond standard tiers',
  'Build branded guild environments',
  'Integrate modules into external ecosystems',
]

const designedFor =
  'This solution is designed for DAOs, NFT ecosystems, gaming guilds, creator economies, and Web3 platforms seeking structured on-chain coordination without building everything from scratch.'

const protocolLayer =
  'It allows your project to use DecentraGuild as a modular protocol layer — while maintaining your identity and governance model.'
</script>

<style scoped>
.dguild-center {
  display: flex;
  flex-direction: row;
  background: var(--theme-bg-card);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  overflow: hidden;
  flex-shrink: 0;
}

.dguild-center__left {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--theme-space-md);
  padding: var(--theme-space-xl);
  min-width: 120px;
  min-height: 120px;
  background: var(--theme-bg-card);
  color: var(--theme-text-primary);
  text-align: center;
}

.dguild-center__icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: var(--theme-radius-md);
  background: var(--theme-bg-secondary);
}

.dguild-center__icon {
  font-size: 2rem;
  color: var(--theme-primary);
}

.dguild-center__label {
  font-size: var(--theme-font-lg);
  font-weight: 600;
}

.dguild-center__right {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: var(--theme-space-lg);
  border-left: 1px solid var(--theme-border);
  min-width: 0;
  flex: 1;
}

.dguild-center__desc {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  margin: 0 0 var(--theme-space-sm);
  line-height: 1.5;
}

.dguild-center__key-info {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--theme-space-xs);
  margin: var(--theme-space-sm) 0 var(--theme-space-sm);
  padding-left: var(--theme-space-lg);
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  list-style: disc;
}

.dguild-center__key-info li {
  margin-bottom: 0;
}

.dguild-center__cta {
  margin-top: var(--theme-space-md);
  text-decoration: none;
}

.dguild-center__cta--left {
  margin-top: var(--theme-space-lg);
}

@media (max-width: var(--theme-breakpoint-md)) {
  .dguild-center {
    flex-direction: column;
  }

  .dguild-center__right {
    border-left: none;
    border-top: 1px solid var(--theme-border);
  }
}
</style>
