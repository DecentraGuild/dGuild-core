import type { Ref } from 'vue'
import { reactive, ref, toRef } from 'vue'
import type { Connection } from '@solana/web3.js'
import type { RaffleItem, SlotCard } from '~/composables/raffles/useRaffleSlots'
import { PublicKey, Transaction } from '@solana/web3.js'
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { useMintMetadataForInput } from '~/composables/mint/useMintMetadataForInput'
import {
  getEscrowWalletFromConnector,
  buildPrepareRaffleTransaction,
  buildCloseRaffleTransaction,
  buildEnableRaffleTransaction,
  buildDisableRaffleTransaction,
  buildEditRaffleTransaction,
  buildRevealWinnersTransaction,
  buildClaimPrizeTransaction,
  buildClaimTicketsTransaction,
} from '@decentraguild/web3'
import { invokeEdgeFunction } from '@decentraguild/nuxt-composables'
import { useSupabase } from '~/composables/core/useSupabase'

export interface AdminRaffleSlotActionsDeps {
  connection: Ref<Connection | null>
  tenantId: Ref<string | null | undefined>
  selectedRaffleForStart: Ref<SlotCard | null>
  selectedRaffleForReward: Ref<RaffleItem | null>
  selectedRaffleForEdit: Ref<SlotCard | null>
  closeRaffleModal: () => void
  openStartRaffleModalBase: (slot: SlotCard) => void
  openEditRaffleModalBase: (slot: SlotCard) => void
  openAddRewardModalBase: (raffle: RaffleItem) => void
  sendWithTxStatus: (
    conn: Connection,
    tx: Transaction,
    wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
    feePayer: PublicKey,
  ) => Promise<string>
  runRaffleAction: (
    rafflePubkey: string,
    fn: () => Promise<void>,
    errMsg: string,
    afterSuccess?: () => Promise<void>,
  ) => Promise<void>
  actionTxStatus: Ref<string | null>
  fetchRaffles: () => Promise<void>
}

export function useAdminRaffleSlotActions(deps: AdminRaffleSlotActionsDeps) {
  const {
    connection,
    tenantId,
    selectedRaffleForStart,
    selectedRaffleForReward,
    selectedRaffleForEdit,
    closeRaffleModal,
    openStartRaffleModalBase,
    openEditRaffleModalBase,
    openAddRewardModalBase,
    sendWithTxStatus,
    runRaffleAction,
    actionTxStatus,
    fetchRaffles,
  } = deps

  const editForm = reactive({ name: '', description: '', url: '' })
  const addRewardForm = reactive({
    prizeMint: '',
    amountDisplay: '',
    imageUrl: '',
  })
  const addRewardSubmitting = ref(false)
  const addRewardError = ref<string | null>(null)

  const prizeMintMeta = useMintMetadataForInput(
    toRef(addRewardForm, 'prizeMint'),
    toRef(addRewardForm, 'amountDisplay'),
    { fieldLabel: 'Amount' },
  )

  function openStartRaffleModal(slot: SlotCard) {
    openStartRaffleModalBase(slot)
  }

  async function onConfirmStartRaffle() {
    const slot = selectedRaffleForStart.value
    if (!slot?.raffle || !connection.value) return
    const wallet = getEscrowWalletFromConnector()
    if (!wallet?.publicKey) return
    closeRaffleModal()
    await runRaffleAction(slot.raffle.rafflePubkey, async () => {
      const tx = await buildEnableRaffleTransaction({ rafflePubkey: slot.raffle!.rafflePubkey, wallet })
      const sig = await sendWithTxStatus(connection.value!, tx, wallet, wallet.publicKey)
      if (!sig) throw new Error('Transaction failed')
    }, 'Failed to start raffle')
  }

  function onCancelStartRaffle() {
    closeRaffleModal()
  }

  async function onPauseRaffle(slot: SlotCard) {
    if (!slot.raffle) return
    await runRaffleAction(slot.raffle.rafflePubkey, async () => {
      const wallet = getEscrowWalletFromConnector()!
      const tx = await buildDisableRaffleTransaction({ rafflePubkey: slot.raffle!.rafflePubkey, wallet })
      const sig = await sendWithTxStatus(connection.value!, tx, wallet, wallet.publicKey)
      if (!sig) throw new Error('Transaction failed')
    }, 'Failed to pause raffle')
  }

  async function onResumeRaffle(slot: SlotCard) {
    if (!slot.raffle) return
    await runRaffleAction(slot.raffle.rafflePubkey, async () => {
      const wallet = getEscrowWalletFromConnector()!
      const tx = await buildEnableRaffleTransaction({ rafflePubkey: slot.raffle!.rafflePubkey, wallet })
      const sig = await sendWithTxStatus(connection.value!, tx, wallet, wallet.publicKey)
      if (!sig) throw new Error('Transaction failed')
    }, 'Failed to resume raffle')
  }

  function openEditRaffleModal(slot: SlotCard) {
    editForm.name = slot.chainData?.name ?? ''
    editForm.description = slot.chainData?.description ?? ''
    editForm.url = slot.chainData?.url ?? ''
    openEditRaffleModalBase(slot)
  }

  async function onEditRaffleSubmit() {
    const slot = selectedRaffleForEdit.value
    if (!slot?.raffle || !connection.value) return
    const wallet = getEscrowWalletFromConnector()
    if (!wallet?.publicKey) return
    closeRaffleModal()
    await runRaffleAction(slot.raffle.rafflePubkey, async () => {
      const tx = await buildEditRaffleTransaction({
        rafflePubkey: slot.raffle!.rafflePubkey,
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        url: editForm.url.trim(),
        wallet,
      })
      const sig = await sendWithTxStatus(connection.value!, tx, wallet, wallet.publicKey)
      if (!sig) throw new Error('Transaction failed')
    }, 'Failed to edit raffle')
  }

  async function onRevealWinner(slot: SlotCard) {
    if (!slot.raffle) return
    await runRaffleAction(slot.raffle.rafflePubkey, async () => {
      const wallet = getEscrowWalletFromConnector()!
      const tx = await buildRevealWinnersTransaction({ rafflePubkey: slot.raffle!.rafflePubkey, wallet })
      const sig = await sendWithTxStatus(connection.value!, tx, wallet, wallet.publicKey)
      if (!sig) throw new Error('Transaction failed')
    }, 'Failed to reveal winner')
  }

  async function onDistributeReward(slot: SlotCard) {
    if (!slot.raffle || !slot.chainData?.winner || !connection.value) return
    const wallet = getEscrowWalletFromConnector()
    if (!wallet?.publicKey) return
    const prizeMintPk = new PublicKey(slot.chainData.prizeMint)
    const winnerPk = new PublicKey(slot.chainData.winner)
    const winnerAta = getAssociatedTokenAddressSync(prizeMintPk, winnerPk, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
    await runRaffleAction(slot.raffle.rafflePubkey, async () => {
      const conn = connection.value!
      const claimTx = await buildClaimPrizeTransaction({
        rafflePubkey: slot.raffle!.rafflePubkey,
        prizeMint: slot.chainData!.prizeMint,
        winnerAta,
        connection: conn,
        wallet,
      })
      const tx = new Transaction()
      const winnerAtaInfo = await conn.getAccountInfo(winnerAta)
      if (!winnerAtaInfo) {
        tx.add(createAssociatedTokenAccountInstruction(wallet.publicKey, winnerAta, winnerPk, prizeMintPk, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID))
      }
      tx.add(...claimTx.instructions)
      const sig = await sendWithTxStatus(conn, tx, wallet, wallet.publicKey)
      if (!sig) throw new Error('Transaction failed')
    }, 'Failed to distribute reward')
  }

  async function onClaimProceeds(slot: SlotCard) {
    if (!slot.raffle || !slot.chainData || !connection.value) return
    const wallet = getEscrowWalletFromConnector()
    if (!wallet?.publicKey) return
    const ticketMintPk = new PublicKey(slot.chainData.ticketMint)
    const creatorAta = getAssociatedTokenAddressSync(ticketMintPk, wallet.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
    await runRaffleAction(slot.raffle.rafflePubkey, async () => {
      const conn = connection.value!
      const claimTx = await buildClaimTicketsTransaction({
        rafflePubkey: slot.raffle!.rafflePubkey,
        ticketMint: slot.chainData!.ticketMint,
        creatorAta,
        wallet,
      })
      const tx = new Transaction()
      const creatorAtaInfo = await conn.getAccountInfo(creatorAta)
      if (!creatorAtaInfo) {
        tx.add(createAssociatedTokenAccountInstruction(wallet.publicKey, creatorAta, wallet.publicKey, ticketMintPk, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID))
      }
      tx.add(...claimTx.instructions)
      const sig = await sendWithTxStatus(conn, tx, wallet, wallet.publicKey)
      if (!sig) throw new Error('Transaction failed')
    }, 'Failed to claim proceeds')
  }

  async function onCloseRaffle(raffle: RaffleItem) {
    await runRaffleAction(
      raffle.rafflePubkey,
      async () => {
        const wallet = getEscrowWalletFromConnector()
        if (!wallet?.publicKey) throw new Error('Wallet not connected')
        const tx = await buildCloseRaffleTransaction({
          rafflePubkey: raffle.rafflePubkey,
          connection: connection.value!,
          wallet,
        })
        const sig = await sendWithTxStatus(connection.value!, tx, wallet, wallet.publicKey)
        if (!sig) throw new Error('Transaction failed')
        const id = tenantId.value
        if (!id) throw new Error('Tenant not set')
        const supabase = useSupabase()
        await invokeEdgeFunction(
          supabase,
          'platform',
          { action: 'raffle-close-tenant', tenantId: id, rafflePubkey: raffle.rafflePubkey },
          { errorFallback: 'Failed to record raffle closed' },
        )
      },
      'Failed to close raffle',
      fetchRaffles,
    )
  }

  function openAddRewardModal(raffle: RaffleItem) {
    addRewardForm.prizeMint = ''
    addRewardForm.amountDisplay = ''
    addRewardForm.imageUrl = ''
    addRewardError.value = null
    openAddRewardModalBase(raffle)
  }

  async function onAddRewardSubmit() {
    const raffle = selectedRaffleForReward.value
    if (!raffle || !connection.value) return

    const prizeMint = addRewardForm.prizeMint.trim()
    if (!prizeMint) {
      addRewardError.value = 'Prize mint is required'
      return
    }
    const dec = prizeMintMeta.metadata.value?.decimals
    if (dec == null) {
      addRewardError.value = 'Enter a valid prize mint to load decimals first'
      return
    }
    const amountRaw = prizeMintMeta.toRawAmount()
    if (!amountRaw || amountRaw === '0') {
      addRewardError.value = 'Amount is required'
      return
    }

    const wallet = getEscrowWalletFromConnector()
    if (!wallet?.publicKey) {
      addRewardError.value = 'Wallet not connected'
      return
    }

    addRewardSubmitting.value = true
    addRewardError.value = null
    try {
      const raffleTx = await buildPrepareRaffleTransaction({
        rafflePubkey: raffle.rafflePubkey,
        prizeMint,
        amount: BigInt(amountRaw),
        imageUrl: addRewardForm.imageUrl.trim() || undefined,
        connection: connection.value,
        wallet,
      })

      const sig = await sendWithTxStatus(connection.value, raffleTx, wallet, wallet.publicKey)
      if (!sig) throw new Error('Transaction failed')

      closeRaffleModal()
      await fetchRaffles()
    } catch (e) {
      addRewardError.value = e instanceof Error ? e.message : 'Failed to add reward'
    } finally {
      addRewardSubmitting.value = false
      actionTxStatus.value = null
    }
  }

  return {
    editForm,
    addRewardForm,
    addRewardSubmitting,
    addRewardError,
    prizeMintMeta,
    openStartRaffleModal,
    onConfirmStartRaffle,
    onCancelStartRaffle,
    onPauseRaffle,
    onResumeRaffle,
    openEditRaffleModal,
    onEditRaffleSubmit,
    onRevealWinner,
    onDistributeReward,
    onClaimProceeds,
    onCloseRaffle,
    openAddRewardModal,
    onAddRewardSubmit,
  }
}
