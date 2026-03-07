<template>
  <div v-if="addressbookEnabled" ref="rootEl" class="ab-browser">
    <button
      type="button"
      class="ab-browser__trigger"
      :title="triggerTitle"
      :aria-label="triggerTitle"
      @click="toggle"
    >
      <Icon icon="mdi:book-account" />
    </button>

    <div v-if="open" class="ab-browser__dropdown">
      <div class="ab-browser__search-row">
        <input
          ref="searchEl"
          v-model="query"
          type="text"
          class="ab-browser__search"
          placeholder="Search…"
        />
        <div class="ab-browser__kind-tabs">
          <button
            type="button"
            class="ab-browser__kind-tab"
            :class="{ 'ab-browser__kind-tab--active': kindFilter === 'all' }"
            @click="kindFilter = 'all'"
          >All</button>
          <button
            type="button"
            class="ab-browser__kind-tab"
            :class="{ 'ab-browser__kind-tab--active': kindFilter === 'SPL' }"
            @click="kindFilter = 'SPL'"
          >SPL</button>
          <button
            type="button"
            class="ab-browser__kind-tab"
            :class="{ 'ab-browser__kind-tab--active': kindFilter === 'NFT' }"
            @click="kindFilter = 'NFT'"
          >NFT</button>
        </div>
      </div>

      <div v-if="loading" class="ab-browser__state">
        <Icon icon="mdi:loading" class="ab-browser__spinner" />
        Loading…
      </div>
      <ul v-else-if="filtered.length" class="ab-browser__list">
        <li
          v-for="entry in filtered"
          :key="entry.mint"
          class="ab-browser__item"
        >
          <button
            type="button"
            class="ab-browser__entry"
            @click="select(entry)"
          >
            <span class="ab-browser__entry-thumb">
              <img v-if="entry.image" :src="entry.image" :alt="entry.name ?? entry.label ?? ''" />
              <Icon v-else :icon="entry.kind === 'SPL' ? 'mdi:token' : 'mdi:image-off'" class="ab-browser__entry-thumb-icon" />
            </span>
            <span class="ab-browser__entry-text">
              <span class="ab-browser__entry-name">{{ entry.name || entry.label || truncate(entry.mint) }}</span>
              <span class="ab-browser__entry-kind">{{ entry.kind }}</span>
            </span>
          </button>
        </li>
      </ul>
      <p v-else class="ab-browser__state ab-browser__state--empty">
        {{ loading ? '' : 'No entries' }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { AddressBookEntry, MintKind } from '~/types/mints'

const props = withDefaults(defineProps<{
  /** Filter entries to only this kind. When undefined shows all. */
  kind?: MintKind
}>(), {})

const emit = defineEmits<{
  /** Emits the chosen mint address. */
  select: [mint: string, entry: AddressBookEntry]
}>()

const { entries, loading, addressbookEnabled } = useAddressBook()

const open = ref(false)
const query = ref('')
const kindFilter = ref<'all' | MintKind>(props.kind ?? 'all')
const rootEl = ref<HTMLElement | null>(null)
const searchEl = ref<HTMLInputElement | null>(null)

const triggerTitle = 'Browse address book'

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return entries.value.filter((e) => {
    if (kindFilter.value !== 'all' && e.kind !== kindFilter.value) return false
    if (q) {
      const matchMint = e.mint.toLowerCase().includes(q)
      const matchLabel = (e.label ?? '').toLowerCase().includes(q)
      const matchName = (e.name ?? '').toLowerCase().includes(q)
      if (!matchMint && !matchLabel && !matchName) return false
    }
    return true
  })
})

function truncate(addr: string): string {
  if (addr.length <= 16) return addr
  return `${addr.slice(0, 8)}…${addr.slice(-4)}`
}

async function toggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    searchEl.value?.focus()
  }
}

function select(entry: AddressBookEntry) {
  emit('select', entry.mint, entry)
  open.value = false
  query.value = ''
}

function onClickOutside(e: MouseEvent) {
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) {
    open.value = false
  }
}

onMounted(() => document.addEventListener('click', onClickOutside, true))
onUnmounted(() => document.removeEventListener('click', onClickOutside, true))
</script>

<style scoped>
.ab-browser {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}

.ab-browser__trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--theme-input-height, 2.25rem);
  height: var(--theme-input-height, 2.25rem);
  padding: 0;
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  background: var(--theme-bg-primary);
  color: var(--theme-text-secondary);
  cursor: pointer;
  font-size: 1.1rem;
  flex-shrink: 0;
}

.ab-browser__trigger:hover {
  background: var(--theme-bg-secondary);
  color: var(--theme-text-primary);
}

.ab-browser__dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 500;
  width: 18rem;
  background: var(--theme-bg-card);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  box-shadow: var(--theme-shadow-card);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ab-browser__search-row {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
  padding: var(--theme-space-sm);
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.ab-browser__search {
  width: 100%;
  padding: var(--theme-space-xs) var(--theme-space-sm);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  background: var(--theme-bg-primary);
  color: var(--theme-text-primary);
  font: inherit;
  font-size: var(--theme-font-sm);
  box-sizing: border-box;
}

.ab-browser__search:focus {
  outline: none;
  border-color: var(--theme-primary);
}

.ab-browser__kind-tabs {
  display: flex;
  gap: var(--theme-space-xs);
}

.ab-browser__kind-tab {
  flex: 1;
  padding: 2px 0;
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  background: none;
  color: var(--theme-text-muted);
  font: inherit;
  font-size: var(--theme-font-xs);
  cursor: pointer;
}

.ab-browser__kind-tab--active {
  background: var(--theme-primary);
  border-color: var(--theme-primary);
  color: #fff;
}

.ab-browser__list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 14rem;
  overflow-y: auto;
}

.ab-browser__item {
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.ab-browser__item:last-child {
  border-bottom: none;
}

.ab-browser__entry {
  display: flex;
  align-items: center;
  width: 100%;
  padding: var(--theme-space-xs) var(--theme-space-sm);
  text-align: left;
  background: none;
  border: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
  gap: var(--theme-space-sm);
}

.ab-browser__entry:hover {
  background: var(--theme-bg-secondary);
}

.ab-browser__entry-thumb {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: var(--theme-radius-sm);
  overflow: hidden;
  background: var(--theme-bg-muted);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ab-browser__entry-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ab-browser__entry-thumb-icon {
  font-size: 0.9rem;
  color: var(--theme-text-muted);
}

.ab-browser__entry-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.ab-browser__entry-name {
  font-size: var(--theme-font-sm);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ab-browser__entry-kind {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.ab-browser__state {
  display: flex;
  align-items: center;
  gap: var(--theme-space-xs);
  padding: var(--theme-space-sm);
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}

.ab-browser__state--empty {
  justify-content: center;
}

.ab-browser__spinner {
  animation: ab-spin 0.8s linear infinite;
}

@keyframes ab-spin {
  to { transform: rotate(360deg); }
}
</style>
