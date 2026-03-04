<template>
  <div class="platform-layout">
    <header class="platform-header">
      <div class="platform-header__left">
        <NuxtLink to="/" class="platform-header__brand">
          <img
            src="https://www.decentraguild.com/logo/dguild-logo.svg"
            alt="DecentraGuild logo"
            class="platform-header__logo"
          />
          <span class="platform-header__brand-text">DecentraGuild</span>
        </NuxtLink>
        <nav class="platform-header__nav">
          <NuxtLink to="/">Discover</NuxtLink>
          <NuxtLink to="/modules" :prefetch="false">Modules</NuxtLink>
          <NuxtLink to="/onboard">Create</NuxtLink>
        </nav>
      </div>
      <div class="platform-header__right">
        <AuthWidget />
      </div>
    </header>
    <main class="platform-main">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { AuthWidget } from '@decentraguild/auth'
</script>

<style scoped>
.platform-layout {
  min-height: 100vh;
  background-color: var(--theme-bg-primary);
  color: var(--theme-text-primary);
}

.platform-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 56px;
  padding: 0 var(--theme-space-xl);
  background-color: var(--theme-bg-secondary);
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.platform-header__left {
  display: flex;
  align-items: center;
  gap: var(--theme-space-xl);
  min-height: 56px;
}

.platform-header__brand {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  font-size: var(--theme-font-lg);
  font-weight: 600;
  color: var(--theme-text-primary);
  text-decoration: none;
  min-height: 56px;
}

.platform-header__logo {
  display: block;
  height: 28px;
  width: auto;
  flex-shrink: 0;
}

.platform-header__brand-text {
  flex-shrink: 0;
}

.platform-header__separator {
  color: var(--theme-text-muted);
  font-weight: 400;
  margin: 0 var(--theme-space-xs);
}

.platform-header__pagetitle {
  color: var(--theme-text-secondary);
  font-weight: 500;
}

.platform-header__nav {
  display: flex;
  align-items: center;
  gap: var(--theme-space-lg);
}

.platform-header__nav a {
  color: var(--theme-text-secondary);
  text-decoration: none;
  line-height: 1;
}

.platform-header__nav a:hover {
  color: var(--theme-primary);
}

.platform-header__nav .router-link-active {
  color: var(--theme-primary);
  font-weight: 600;
}

.platform-header__right {
  display: flex;
  align-items: center;
  min-height: 56px;
}

.platform-main {
  padding: var(--theme-space-xl);
}
</style>
