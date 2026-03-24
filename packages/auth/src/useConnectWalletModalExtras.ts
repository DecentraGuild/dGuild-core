import { ref, onMounted, onUnmounted, watch, type Ref } from 'vue'
import {
  isMobileUserAgent,
  runConnectModalWalletWarmup,
  subscribeWalletConnectUri,
} from '@decentraguild/web3/wallet'

export function useConnectWalletModalExtras(options: {
  showModal: Ref<boolean>
  refreshConnectorState: () => void
}) {
  const walletConnectUri = ref<string | null>(null)
  const walletScanPending = ref(false)

  onMounted(() => {
    const unsub = subscribeWalletConnectUri((uri) => {
      walletConnectUri.value = uri
    })
    onUnmounted(unsub)
  })

  watch(
    () => options.showModal.value,
    async (open) => {
      if (!open) {
        walletScanPending.value = false
        return
      }
      options.refreshConnectorState()
      if (isMobileUserAgent()) walletScanPending.value = true
      try {
        await runConnectModalWalletWarmup()
        options.refreshConnectorState()
      } finally {
        walletScanPending.value = false
      }
    },
  )

  return { walletConnectUri, walletScanPending }
}
