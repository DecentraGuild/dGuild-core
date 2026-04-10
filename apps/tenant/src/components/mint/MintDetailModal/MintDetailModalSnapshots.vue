<template>
  <section class="mint-modal__section mint-modal__section--bordered">
    <h4 class="mint-modal__section-title">Snapshots</h4>
    <div v-if="loading" class="mint-modal__loading">
      <Icon icon="lucide:loader-2" class="mint-modal__spinner" />
    </div>
    <p v-else-if="!snapshots.length" class="mint-modal__muted">No snapshots yet.</p>
    <ul v-else class="mint-modal__snapshot-list">
      <li v-for="s in snapshots" :key="s.date" class="mint-modal__snapshot-item">
        <div class="mint-modal__snapshot-row-wrap">
          <button type="button" class="mint-modal__snapshot-row" @click="onToggle(s.date, snapshotAt(s))">
            <span>{{ s.date }}</span>
            <span class="mint-modal__snapshot-count">{{ s.holderCount }} holders</span>
            <Icon :icon="expandedDate === s.date ? 'lucide:chevron-down' : 'lucide:chevron-right'" />
          </button>
          <button
            v-if="s.holderCount > 0 && snapshotAt(s)"
            type="button"
            class="mint-modal__icon-btn mint-modal__icon-btn--sm"
            title="Download snapshot as CSV"
            :disabled="csvDownloading"
            @click.stop="emit('download-csv', snapshotAt(s)!)"
          >
            <Icon
              :icon="csvDownloading ? 'lucide:loader-2' : 'lucide:download'"
              :class="{ 'mint-modal__spinner': csvDownloading }"
            />
          </button>
        </div>
        <div v-if="expandedDate === s.date" class="mint-modal__wallets">
          <p v-if="walletsLoading" class="mint-modal__loading">
            <Icon icon="lucide:loader-2" class="mint-modal__spinner" /> Loading...
          </p>
          <p v-else-if="!holders.length" class="mint-modal__muted">No holders recorded.</p>
          <ul v-else class="mint-modal__wallet-list">
            <li
              v-for="(h, idx) in holders.slice(0, 50)"
              :key="`${h.wallet}-${h.mint ?? idx}`"
              class="mint-modal__wallet-item"
            >
              <span v-if="h.mint" class="mint-modal__snapshot-mint" :title="h.mint">{{ truncateAddress(h.mint, 4, 4) }}</span>
              <span class="mint-modal__holder-amount">{{ formatHolderAmount(h.amount) }}</span>
              <span class="mint-modal__holder-wallet">{{ resolveWallet(h.wallet, 6, 4) }}</span>
              <button type="button" class="mint-modal__icon-btn" aria-label="Copy" @click="onCopyWallet(h.wallet)">
                <Icon :icon="copiedWallet === h.wallet ? 'lucide:check' : 'lucide:copy'" />
              </button>
              <a :href="accountUrl(h.wallet)" target="_blank" rel="noopener" class="mint-modal__icon-btn" aria-label="Solscan">
                <Icon icon="lucide:external-link" />
              </a>
            </li>
            <li v-if="holders.length > 50" class="mint-modal__wallet-more">
              + {{ holders.length - 50 }} more
            </li>
          </ul>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { truncateAddress } from '@decentraguild/display'
import { useMemberProfiles } from '~/composables/members/useMemberProfiles'

const { resolveWallet } = useMemberProfiles()

interface HolderRow {
  wallet: string
  amount: string
  mint?: string
}

interface SnapshotItem {
  date: string
  holderCount: number
  snapshotAt?: string
}

defineProps<{
  snapshots: SnapshotItem[]
  loading?: boolean
  expandedDate: string | null
  holders: HolderRow[]
  walletsLoading?: boolean
  copiedWallet?: string | null
  formatHolderAmount: (amount: string) => string
  accountUrl: (addr: string) => string
  csvDownloading?: boolean
}>()

const emit = defineEmits<{
  toggle: [date: string, snapshotAt?: string]
  'copy-wallet': [wallet: string]
  'download-csv': [snapshotAt: string]
}>()

function snapshotAt(s: SnapshotItem): string {
  return (s as { snapshotAt?: string }).snapshotAt ?? s.date.replace(' ', 'T')
}

function onToggle(date: string, snapshotAtVal?: string) {
  emit('toggle', date, snapshotAtVal)
}

function onCopyWallet(wallet: string) {
  emit('copy-wallet', wallet)
}
</script>
