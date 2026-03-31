import type { Ref } from 'vue'
import { useSubmitInFlightLock } from '@decentraguild/nuxt-composables'
import { getEscrowWalletFromConnector, sendAndConfirmTransaction } from '@decentraguild/web3'
import type { Connection } from '@solana/web3.js'
import type { Transaction } from '@solana/web3.js'
import { useTransactionNotificationsStore } from '~/stores/transactionNotifications'

const TX_STATUS_LABELS: Record<string, string> = {
  signing: 'Signing...',
  sending: 'Sending...',
  confirming: 'Confirming...',
}

function humanizeRaffleChainError(message: string): string {
  if (/StateMismatch|6024|0x1788/i.test(message)) {
    return 'The raffle is not in a state that allows closing on-chain. You can close after the raffle reaches Done, or cancel while it is still Created and you have not added rewards yet.'
  }
  return message
}

export interface AdminRaffleActionsOptions {
  connection: Ref<Connection | null>
  onSuccess?: () => Promise<void>
}

/**
 * Composable for admin raffle transaction handling: status feedback, error state, send + run actions.
 */
export function useAdminRaffleActions(options: AdminRaffleActionsOptions) {
  const { connection, onSuccess } = options
  const raffleAdminTxLock = useSubmitInFlightLock()

  const actionSubmitting = ref<string | null>(null)
  const actionTxStatus = ref<string | null>(null)
  const actionError = ref<string | null>(null)
  const actionErrorRaffle = ref<string | null>(null)
  const txNotifications = useTransactionNotificationsStore()

  function clearActionError(rafflePubkey?: string) {
    actionError.value = null
    if (!rafflePubkey || actionErrorRaffle.value === rafflePubkey) {
      actionErrorRaffle.value = null
    }
  }

  async function sendWithTxStatus(
    conn: Connection,
    tx: Transaction,
    wallet: { publicKey: import('@solana/web3.js').PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
    feePayer: import('@solana/web3.js').PublicKey
  ): Promise<string> {
    const notificationId = `raffle-${Date.now()}`
    txNotifications.add(notificationId, {
      status: 'pending',
      message: 'Raffle transaction. Confirm the transaction in your wallet.',
      signature: null,
    })

    try {
      const sig = await sendAndConfirmTransaction(conn, tx, wallet, feePayer, {
        onStatus: (s) => {
          const label = TX_STATUS_LABELS[s] ?? s
          actionTxStatus.value = label
          txNotifications.update(notificationId, {
            status: 'pending',
            message: `Raffle transaction: ${label}`,
          })
        },
      })

      txNotifications.update(notificationId, {
        status: 'success',
        message: 'Raffle transaction confirmed.',
        signature: sig,
      })

      return sig
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Transaction failed'
      const msg = humanizeRaffleChainError(raw)
      txNotifications.update(notificationId, {
        status: 'error',
        message: msg,
        signature: null,
      })
      throw new Error(msg, { cause: e })
    }
  }

  async function runRaffleAction(
    rafflePubkey: string,
    fn: () => Promise<void>,
    errMsg: string,
    afterSuccess?: () => Promise<void>
  ): Promise<void> {
    if (!connection.value) return
    const wallet = getEscrowWalletFromConnector()
    if (!wallet?.publicKey) return

    const exclusive = await raffleAdminTxLock.runExclusive(async () => {
      actionSubmitting.value = rafflePubkey
      actionTxStatus.value = null
      clearActionError()
      try {
        await fn()
        clearActionError(rafflePubkey)
        await (afterSuccess ?? onSuccess)?.()
      } catch (e) {
        const raw = e instanceof Error ? e.message : errMsg
        actionError.value = humanizeRaffleChainError(raw)
        actionErrorRaffle.value = rafflePubkey
      } finally {
        actionSubmitting.value = null
        actionTxStatus.value = null
      }
    })
    if (!exclusive.ok) return
  }

  return {
    actionSubmitting,
    actionTxStatus,
    actionError,
    actionErrorRaffle,
    clearActionError,
    sendWithTxStatus,
    runRaffleAction,
  }
}
