<template>
  <div v-if="uri" class="wallet-connect-qr">
    <div v-if="dataUrl" class="wallet-connect-qr__img-wrap">
      <img class="wallet-connect-qr__img" :src="dataUrl" alt="" width="220" height="220" />
    </div>
    <p v-else class="wallet-connect-qr__loading">Preparing QR code…</p>
    <button type="button" class="wallet-connect-qr__copy" :disabled="!uri" @click="copyUri">
      {{ copied ? 'Copied' : 'Copy link' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import QRCode from 'qrcode'

const props = defineProps<{
  uri: string | null
}>()

const dataUrl = ref('')
const copied = ref(false)

let copyReset: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.uri,
  async (uri) => {
    dataUrl.value = ''
    if (!uri) return
    try {
      dataUrl.value = await QRCode.toDataURL(uri, { width: 220, margin: 2, errorCorrectionLevel: 'M' })
    } catch {
      dataUrl.value = ''
    }
  },
  { immediate: true },
)

async function copyUri() {
  if (!props.uri) return
  try {
    await navigator.clipboard.writeText(props.uri)
    copied.value = true
    if (copyReset) clearTimeout(copyReset)
    copyReset = setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    copied.value = false
  }
}
</script>

<style scoped>
.wallet-connect-qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--theme-space-md);
  padding: var(--theme-space-sm) 0;
}

.wallet-connect-qr__img-wrap {
  padding: var(--theme-space-sm);
  background: var(--theme-bg-primary);
  border-radius: var(--theme-radius-md);
  border: var(--theme-border-thin) solid var(--theme-border);
}

.wallet-connect-qr__img {
  display: block;
  max-width: 100%;
  height: auto;
}

.wallet-connect-qr__loading {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.wallet-connect-qr__copy {
  min-height: 44px;
  padding: 0 var(--theme-space-lg);
  touch-action: manipulation;
  font-size: var(--theme-font-sm);
  font-weight: 500;
  color: var(--theme-text-primary);
  background: var(--theme-bg-secondary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  cursor: pointer;
}

.wallet-connect-qr__copy:hover:not(:disabled) {
  border-color: var(--theme-primary);
  background: var(--theme-bg-card);
}

.wallet-connect-qr__copy:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
