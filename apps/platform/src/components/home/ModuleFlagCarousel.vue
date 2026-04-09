<template>
  <div class="flag-carousel" role="group" :aria-label="ariaLabel">
    <button
      type="button"
      class="flag-carousel__arrow"
      aria-label="Previous module"
      :disabled="!canGoPrev"
      @click="goPrev"
    >
      <Icon icon="mdi:chevron-left" class="flag-carousel__arrow-icon" aria-hidden="true" />
    </button>

    <div class="flag-carousel__wheel-zone">
      <div
        ref="scrollerRef"
        class="flag-carousel__track"
        role="listbox"
        tabindex="0"
        @keydown="onKeydown"
      >
        <button
          v-for="entry in modules"
          :id="`module-flag-${entry.id}`"
          :key="entry.id"
          type="button"
          role="option"
          :aria-selected="selectedId === entry.id"
          class="flag-tile"
          :class="{
            'flag-tile--selected': selectedId === entry.id,
            'flag-tile--dguild': entry.id === 'dguild',
          }"
          @click="emit('select', entry.id)"
        >
          <span class="flag-tile__bg" aria-hidden="true" />
          <span class="flag-tile__face">
            <span class="flag-tile__icon-wrap">
              <Icon :icon="flagIcon(entry)" class="flag-tile__icon" aria-hidden="true" />
            </span>
            <span class="flag-tile__name">{{ entry.name }}</span>
          </span>
        </button>
      </div>
    </div>

    <button
      type="button"
      class="flag-carousel__arrow"
      aria-label="Next module"
      :disabled="!canGoNext"
      @click="goNext"
    >
      <Icon icon="mdi:chevron-right" class="flag-carousel__arrow-icon" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { ModuleCatalogEntry } from '@decentraguild/catalog'

const props = withDefaults(
  defineProps<{
    modules: ModuleCatalogEntry[]
    selectedId: string | null
    ariaLabel?: string
  }>(),
  { ariaLabel: 'Modules' },
)

const emit = defineEmits<{
  select: [id: string]
}>()

const scrollerRef = ref<HTMLElement | null>(null)

function onWheelScroll(e: WheelEvent) {
  const el = scrollerRef.value
  if (!el) return
  const dy = e.deltaY
  const dx = e.deltaX
  if (Math.abs(dx) > Math.abs(dy)) {
    return
  }
  const maxLeft = el.scrollWidth - el.clientWidth
  if (maxLeft <= 0) return

  const atEnd = el.scrollLeft >= maxLeft - 0.5
  const atStart = el.scrollLeft <= 0.5
  if (dy > 0 && atEnd) return
  if (dy < 0 && atStart) return

  e.preventDefault()
  el.scrollLeft = Math.max(0, Math.min(maxLeft, el.scrollLeft + dy))
}

let removeWheelListener: (() => void) | undefined

const selectedIndex = computed(() => {
  if (!props.selectedId) return -1
  return props.modules.findIndex((m) => m.id === props.selectedId)
})

const canGoPrev = computed(() => selectedIndex.value > 0)
const canGoNext = computed(() => {
  const i = selectedIndex.value
  return i >= 0 && i < props.modules.length - 1
})

function flagIcon(entry: ModuleCatalogEntry) {
  return entry.id === 'dguild' ? 'mdi:home' : entry.icon
}

function focusIndex(i: number) {
  const id = props.modules[i]?.id
  if (!id) return
  emit('select', id)
}

function scrollActiveIntoView(behavior: ScrollBehavior = 'smooth') {
  const id = props.selectedId
  if (!id) return
  nextTick(() => {
    requestAnimationFrame(() => {
      const el = document.getElementById(`module-flag-${id}`)
      if (!el) return
      el.scrollIntoView({
        behavior,
        inline: 'center',
        block: 'nearest',
      })
    })
  })
}

watch(
  () => [props.selectedId, props.modules.map((m) => m.id).join(',')] as const,
  () => scrollActiveIntoView('smooth'),
  { flush: 'post' },
)

onMounted(() => {
  const el = scrollerRef.value
  if (el) {
    el.addEventListener('wheel', onWheelScroll, { passive: false })
    removeWheelListener = () => el.removeEventListener('wheel', onWheelScroll)
  }
  scrollActiveIntoView('instant')
})

onUnmounted(() => {
  removeWheelListener?.()
})

function goPrev() {
  const i = selectedIndex.value
  if (i > 0) focusIndex(i - 1)
}

function goNext() {
  const i = selectedIndex.value
  if (i >= 0 && i < props.modules.length - 1) focusIndex(i + 1)
}

function onKeydown(e: KeyboardEvent) {
  const ids = props.modules.map((m) => m.id)
  const i = ids.findIndex((id) => id === props.selectedId)
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    const next = i < 0 ? 0 : Math.min(i + 1, ids.length - 1)
    focusIndex(next)
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    const next = i <= 0 ? 0 : i - 1
    focusIndex(next)
  } else if (e.key === 'Home') {
    e.preventDefault()
    focusIndex(0)
  } else if (e.key === 'End') {
    e.preventDefault()
    focusIndex(ids.length - 1)
  }
}
</script>

<style scoped>
.flag-carousel {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: var(--theme-space-xs);
  width: 100%;
  min-width: 0;
}

.flag-carousel__wheel-zone {
  flex: 1;
  min-width: 0;
}

.flag-carousel__track {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  gap: var(--theme-space-sm);
  overflow-x: auto;
  padding: var(--theme-space-xs) 2px var(--theme-space-sm);
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
  outline: none;
}

.flag-carousel__track:focus-visible {
  outline: 2px solid var(--theme-primary);
  outline-offset: 2px;
  border-radius: var(--theme-radius-sm);
}

.flag-carousel__arrow {
  flex-shrink: 0;
  align-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  padding: 0;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  background: var(--theme-bg-card);
  color: var(--theme-text-primary);
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    opacity 0.15s ease;
}

.flag-carousel__arrow:hover:not(:disabled) {
  border-color: var(--theme-primary);
  color: var(--theme-primary);
}

.flag-carousel__arrow:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.flag-carousel__arrow-icon {
  width: 1.5rem;
  height: 1.5rem;
}

.flag-tile {
  position: relative;
  flex: 0 0 auto;
  width: 7.5rem;
  scroll-snap-align: start;
  border: none;
  padding: 0;
  cursor: pointer;
  background: none;
  color: inherit;
  text-align: center;
}

.flag-tile__bg {
  position: absolute;
  inset: 0;
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 14px), 50% 100%, 0 calc(100% - 14px));
  background: var(--flag-accent, rgba(0, 212, 255, 0.85));
  opacity: 0.75;
  transition: opacity 0.2s ease;
  z-index: 0;
}

.flag-tile__face {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--theme-space-xs);
  padding: var(--theme-space-sm) var(--theme-space-xs) calc(var(--theme-space-md) + 6px);
  min-height: 7rem;
  clip-path: polygon(1% 0, 99% 0, 99% calc(100% - 15px), 50% 99%, 1% calc(100% - 15px));
  background: var(--theme-bg-card);
  border: 2px solid var(--theme-border);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.flag-tile:hover .flag-tile__face {
  border-color: color-mix(in srgb, var(--theme-primary) 55%, var(--theme-border));
}

.flag-tile--selected .flag-tile__face {
  border-color: var(--theme-primary);
  box-shadow: 0 0 0 1px var(--theme-primary);
}

.flag-tile--selected .flag-tile__bg {
  opacity: 1;
}

.flag-tile--dguild .flag-tile__bg {
  background: linear-gradient(
    135deg,
    rgba(0, 212, 255, 0.55) 0%,
    rgba(139, 92, 246, 0.45) 100%
  );
}

.flag-tile--dguild.flag-tile--selected .flag-tile__face {
  border-color: color-mix(in srgb, var(--theme-primary) 80%, white 10%);
}

.flag-tile:focus-visible .flag-tile__face {
  outline: 2px solid var(--theme-primary);
  outline-offset: 2px;
}

.flag-tile__icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  color: var(--theme-primary);
}

.flag-tile__icon {
  width: 2rem;
  height: 2rem;
}

.flag-tile__name {
  font-size: var(--theme-font-xs);
  font-weight: 600;
  line-height: 1.25;
  color: var(--theme-text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

@media (max-width: 479px) {
  .flag-carousel__arrow {
    width: 2rem;
    height: 2rem;
  }

  .flag-carousel__arrow-icon {
    width: 1.25rem;
    height: 1.25rem;
  }
}
</style>
