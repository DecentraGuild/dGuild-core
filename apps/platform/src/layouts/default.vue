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
        <nav class="platform-header__nav platform-header__nav--desktop" aria-label="Main">
          <NuxtLink to="/" class="platform-header__link">Home</NuxtLink>
          <NuxtLink to="/discover" :prefetch="false" class="platform-header__link">Discover</NuxtLink>
          <NuxtLink to="/onboard" class="platform-header__link">Create</NuxtLink>
        </nav>
      </div>
      <div class="platform-header__right">
        <Sheet v-model:open="mobileNavOpen">
          <SheetTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              class="platform-header__burger"
              aria-label="Open menu"
            >
              <Icon icon="mdi:menu" aria-hidden />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" class="w-[280px] sm:max-w-[280px]">
            <SheetHeader>
              <SheetTitle class="sr-only">Menu</SheetTitle>
            </SheetHeader>
            <nav class="flex flex-col gap-1 pt-6" aria-label="Main navigation">
              <NuxtLink
                to="/"
                class="flex min-h-11 items-center rounded-md px-3 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                @click="mobileNavOpen = false"
              >
                Home
              </NuxtLink>
              <NuxtLink
                to="/discover"
                :prefetch="false"
                class="flex min-h-11 items-center rounded-md px-3 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                @click="mobileNavOpen = false"
              >
                Discover
              </NuxtLink>
              <NuxtLink
                to="/onboard"
                class="flex min-h-11 items-center rounded-md px-3 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                @click="mobileNavOpen = false"
              >
                Create org
              </NuxtLink>
            </nav>
          </SheetContent>
        </Sheet>
        <div class="platform-header__auth">
          <AuthWidget />
        </div>
      </div>
    </header>

    <main
      class="platform-main"
      :class="{ 'platform-main--flush-top': isHomeRoute }"
    >
      <slot />
    </main>
    <ClientOnly>
      <TransactionToastContainer
        :store="useTransactionNotificationsStore()"
        :get-tx-url="(s) => useExplorerLinks().txUrl(s)"
      />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { AuthWidget } from '@decentraguild/auth'
import { TransactionToastContainer } from '@decentraguild/ui/components'
import { Button } from '~/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet'

const route = useRoute()
const mobileNavOpen = ref(false)

const isHomeRoute = computed(() => route.path === '/')

watch(
  () => route.path,
  () => {
    mobileNavOpen.value = false
  },
)
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

.platform-header__nav {
  display: flex;
  align-items: center;
  gap: var(--theme-space-lg);
}

.platform-header__link {
  color: var(--theme-text-secondary);
  text-decoration: none;
  line-height: 1;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}

.platform-header__link:hover {
  color: var(--theme-primary);
}

.platform-header__link.router-link-active {
  color: var(--theme-primary);
  font-weight: 600;
}

.platform-header__right {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  min-height: 56px;
}

.platform-header__burger {
  display: none;
}

.platform-header__auth {
  display: flex;
  align-items: center;
}

.platform-header__auth :deep(.btn) {
  min-height: 2.25rem;
  padding: 0.375rem 1rem;
}

.platform-main {
  padding: var(--theme-space-xl);
}

.platform-main--flush-top {
  padding-top: 0;
}

@media (max-width: 767px) {
  .platform-header {
    padding: 0 var(--theme-space-md);
  }

  .platform-header__nav--desktop {
    display: none;
  }

  .platform-header__burger {
    display: flex;
  }

  .platform-main {
    padding: var(--theme-space-md);
  }

  .platform-main--flush-top {
    padding-top: 0;
  }
}
</style>
