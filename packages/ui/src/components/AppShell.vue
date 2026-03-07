<template>
  <div class="app-shell" :class="{ 'app-shell--nav-open': mobileNavOpen }">
    <!-- Pattern overlay: purely decorative, pointer-events off, rendered below content -->
    <div
      v-if="patternClass"
      class="app-shell__pattern"
      :class="patternClass"
      aria-hidden="true"
    />
    <header v-if="$slots.header" class="app-shell__header">
      <slot name="header" />
    </header>
    <div class="app-shell__body">
      <template v-if="$slots.nav">
        <div
          v-show="mobileNavOpen"
          class="app-shell__overlay"
          aria-hidden="true"
          @click="$emit('update:mobileNavOpen', false)"
        />
        <nav class="app-shell__nav">
          <button
            type="button"
            class="app-shell__nav-close"
            aria-label="Close menu"
            @click="$emit('update:mobileNavOpen', false)"
          >
            <slot name="nav-close-icon">
              <Icon icon="mdi:close" />
            </slot>
          </button>
          <slot name="nav" />
        </nav>
      </template>
      <main class="app-shell__main">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useThemeStore } from '../stores/theme'

withDefaults(
  defineProps<{
    mobileNavOpen?: boolean
  }>(),
  { mobileNavOpen: false }
)
defineEmits<{
  'update:mobileNavOpen': [value: boolean]
}>()

const themeStore = useThemeStore()
const patternClass = computed(() => {
  const p = themeStore.currentTheme.effects?.pattern
  return p && p !== 'none' ? `app-shell__pattern--${p}` : null
})
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--theme-bg-primary);
  color: var(--theme-text-primary);
  position: relative;
}

/* Pattern overlay
 * position: fixed so it covers the full viewport while scrolling.
 * z-index: 0 places it above the shell background but below positioned children.
 * Header and body use position: relative + z-index: 1 to render above it. */
.app-shell__pattern {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-color: transparent;
  background-repeat: repeat;
  transition: opacity 0.3s ease;
}

/* Dots – 1 px dot, spacing controlled by --theme-effect-pattern-size */
.app-shell__pattern--dots {
  background-image: radial-gradient(circle, var(--theme-border-light) 1px, transparent 1px);
  background-size: var(--theme-effect-pattern-size) var(--theme-effect-pattern-size);
  opacity: 0.4;
}

/* Grid – 1 px lines, cell size controlled by --theme-effect-pattern-size */
.app-shell__pattern--grid {
  background-image:
    linear-gradient(to right, var(--theme-border) 1px, transparent 1px),
    linear-gradient(to bottom, var(--theme-border) 1px, transparent 1px);
  background-size: var(--theme-effect-pattern-size) var(--theme-effect-pattern-size);
  opacity: 0.3;
}

/* Grain – dot diameter scales with pattern size; clamped so it stays fine */
.app-shell__pattern--noise {
  background-image: radial-gradient(
    circle,
    var(--theme-border) calc(var(--theme-effect-pattern-size) * 0.08),
    transparent calc(var(--theme-effect-pattern-size) * 0.08)
  );
  background-size: var(--theme-effect-pattern-size) var(--theme-effect-pattern-size);
  opacity: 0.3;
}

.app-shell__header {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  background-color: var(--theme-bg-secondary);
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.app-shell__body {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  min-height: 0;
}

.app-shell__overlay {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 100;
  background: var(--theme-backdrop, rgba(0, 0, 0, 0.6));
}

.app-shell__nav {
  flex-shrink: 0;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background-color: var(--theme-bg-secondary);
  border-right: var(--theme-border-thin) solid var(--theme-border);
  padding: var(--theme-space-md);
}

.app-shell__nav-close {
  display: none;
  align-items: center;
  justify-content: center;
  width: var(--theme-input-height);
  height: var(--theme-input-height);
  margin: 0 0 var(--theme-space-sm);
  padding: 0;
  background: none;
  border: none;
  border-radius: var(--theme-radius-md);
  color: var(--theme-text-secondary);
  cursor: pointer;
}

.app-shell__nav-close:hover {
  color: var(--theme-text-primary);
  background: var(--theme-bg-card);
}

.app-shell__main {
  flex: 1;
  min-width: 0;
  padding: var(--theme-space-xl);
}

@media (min-width: var(--theme-breakpoint-md)) {
  .app-shell__nav {
    min-width: 12rem;
  }
}

@media (max-width: var(--theme-breakpoint-md)) {
  .app-shell__overlay {
    display: block;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }

  .app-shell--nav-open .app-shell__overlay {
    opacity: 1;
    pointer-events: auto;
  }

  .app-shell__nav {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 101;
    width: 280px;
    max-width: 85vw;
    border-right: var(--theme-border-thin) solid var(--theme-border);
    transform: translateX(-100%);
    transition: transform 0.2s ease;
    overflow-y: auto;
  }

  .app-shell--nav-open .app-shell__nav {
    transform: translateX(0);
  }

  .app-shell__nav-close {
    display: flex;
  }
}
</style>
