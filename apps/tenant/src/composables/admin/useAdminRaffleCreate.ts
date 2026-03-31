import type { Ref } from 'vue'
import { reactive, ref, toRef } from 'vue'
import type { Connection } from '@solana/web3.js'
import type { BillingPeriod, ConditionSet } from '@decentraguild/billing'
import type { EffectiveGateResult, TransactionGateOverride } from '@decentraguild/core'
import type { BillingSameTxPrepare } from '~/composables/admin/useAdminBilling'
import { resolveGateForTransaction } from '@decentraguild/core'
import { useMintMetadataForInput } from '~/composables/mint/useMintMetadataForInput'
import { useEnsureCatalogMint } from '~/composables/mint/useEnsureCatalogMint'
import {
  getEscrowWalletFromConnector,
  sendAndConfirmTransaction,
  buildInitializeRaffleTransaction,
  deriveRafflePda,
} from '@decentraguild/web3'
import { ComputeBudgetProgram, Transaction } from '@solana/web3.js'
import { invokeEdgeFunction, useSubmitInFlightLock } from '@decentraguild/nuxt-composables'
import { useSupabase } from '~/composables/core/useSupabase'

const BILLING_PLUS_PROGRAM_CU = 400_000

type WhitelistFormValue = TransactionGateOverride | 'admin-only' | null

export interface AdminRaffleCreateDeps {
  connection: Ref<Connection | null>
  tenantId: Ref<string | null | undefined>
  activeRaffleCount: Ref<number>
  effectiveRaffleGate: Ref<EffectiveGateResult | undefined>
  isDefaultGatePublic: Ref<boolean>
  whitelistFormValue: Ref<WhitelistFormValue>
  prepareBilling: Ref<
    | ((moduleId: string, period: BillingPeriod, slugToClaim?: string, conditions?: ConditionSet) => Promise<BillingSameTxPrepare>)
    | undefined
  >
  confirmBilling: Ref<
    | ((paymentId: string, txSignature: string, slugToClaim?: string) => Promise<void>)
    | undefined
  >
  closeRaffleModal: () => void
  openCreateModalBase: () => void
  fetchRaffles: () => Promise<void>
  fetchChainDataForRaffles: () => Promise<void>
  onCreated: () => void
  refreshPricing: () => void
}

export function useAdminRaffleCreate(deps: AdminRaffleCreateDeps) {
  const {
    connection,
    tenantId,
    activeRaffleCount,
    effectiveRaffleGate,
    isDefaultGatePublic,
    whitelistFormValue,
    prepareBilling,
    confirmBilling,
    closeRaffleModal,
    openCreateModalBase,
    fetchRaffles,
    fetchChainDataForRaffles,
    onCreated,
    refreshPricing,
  } = deps

  const createSubmitting = ref(false)
  const createError = ref<string | null>(null)
  const raffleCreateLock = useSubmitInFlightLock()

  const createForm = reactive({
    name: '',
    description: '',
    ticketMint: '',
    ticketPriceDisplay: '',
    maxTicketsDisplay: '',
    gate: null as TransactionGateOverride,
  })

  const ticketMintMeta = useMintMetadataForInput(
    toRef(createForm, 'ticketMint'),
    toRef(createForm, 'ticketPriceDisplay'),
    { fieldLabel: 'Ticket price' },
  )

  const { ensureMint } = useEnsureCatalogMint()

  function openCreateModal(_slotIndex: number) {
    createForm.name = ''
    createForm.description = ''
    createForm.ticketMint = ''
    createForm.ticketPriceDisplay = ''
    createForm.maxTicketsDisplay = ''
    if (isDefaultGatePublic.value) {
      createForm.gate = null
    } else {
      const wl = whitelistFormValue.value
      createForm.gate = wl === 'use-default' ? 'use-default' : (wl as TransactionGateOverride)
    }
    createError.value = null
    openCreateModalBase()
  }

  async function onCreateSubmit() {
    const name = createForm.name.trim()
    const ticketMint = createForm.ticketMint.trim()
    const maxTicketsParsed = parseInt(createForm.maxTicketsDisplay, 10)
    const maxTickets = maxTicketsParsed > 0 ? maxTicketsParsed : 0
    if (!name || !ticketMint) {
      createError.value = 'Name and ticket mint are required'
      return
    }
    if (maxTickets < 1) {
      createError.value = 'Total tickets is required (minimum 1)'
      return
    }
    const dec = ticketMintMeta.metadata.value?.decimals
    if (dec == null) {
      createError.value = 'Enter a valid ticket mint to load decimals first'
      return
    }
    try {
      await ensureMint(ticketMint, 'SPL')
    } catch {
      /* best-effort address book upsert */
    }
    const ticketPriceRaw = ticketMintMeta.toRawAmount()
    if (!ticketPriceRaw || ticketPriceRaw === '0') {
      createError.value = 'Ticket price is required'
      return
    }
    const ticketPriceNum = parseFloat(createForm.ticketPriceDisplay) || 0
    if (ticketPriceNum < 0) {
      createError.value = 'Ticket price must be zero or positive'
      return
    }

    const wallet = getEscrowWalletFromConnector()
    if (!wallet?.publicKey) {
      createError.value = 'Wallet not connected'
      return
    }
    if (!connection.value) {
      createError.value = 'Solana RPC not configured'
      return
    }
    const id = tenantId.value
    if (!id) {
      createError.value = 'Tenant not set'
      return
    }

    const exclusive = await raffleCreateLock.runExclusive(async () => {
      createSubmitting.value = true
      createError.value = null
      try {
        const conditions: ConditionSet = {
          raffleSlotsUsed: activeRaffleCount.value + 1,
        }
        const prepareFn = prepareBilling.value
        const confirmFn = confirmBilling.value
        if (!prepareFn || !confirmFn) throw new Error('Billing not configured')

        const billingPrep = await prepareFn('raffles', 'monthly', undefined, conditions)

        const gate = resolveGateForTransaction(
          effectiveRaffleGate.value ?? null,
          createForm.gate,
        )
        const useWhitelist = Boolean(gate?.account?.trim())
        const whitelist = useWhitelist && gate?.account ? gate.account : undefined

        const seed = crypto.getRandomValues(new Uint8Array(8))
        const raffleTx = await buildInitializeRaffleTransaction({
          name,
          description: createForm.description.trim() || '',
          seed,
          ticketMint,
          ticketPrice: ticketPriceRaw,
          ticketDecimals: dec,
          maxTickets,
          useWhitelist,
          whitelist: whitelist ?? null,
          connection: connection.value,
          wallet,
        })

        const tx = new Transaction()
        tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: BILLING_PLUS_PROGRAM_CU }))
        if (billingPrep.kind === 'usdc') {
          for (const ix of billingPrep.instructions) {
            tx.add(ix)
          }
        }
        for (const ix of raffleTx.instructions) {
          tx.add(ix)
        }

        const txSignature = await sendAndConfirmTransaction(
          connection.value,
          tx,
          wallet,
          wallet.publicKey,
        )

        if (billingPrep.kind === 'usdc') {
          await confirmFn(billingPrep.paymentId, txSignature)
        }

        const rafflePda = deriveRafflePda(name, seed)
        const supabase = useSupabase()
        await invokeEdgeFunction(supabase, 'platform', { action: 'raffle-bind-tenant', tenantId: id, rafflePubkey: rafflePda.toBase58() }, { errorFallback: 'Failed to bind raffle' })

        closeRaffleModal()
        await fetchRaffles()
        await fetchChainDataForRaffles()
        refreshPricing()
        onCreated()
      } catch (e) {
        createError.value = e instanceof Error ? e.message : 'Failed to create'
      } finally {
        createSubmitting.value = false
      }
    })
    if (!exclusive.ok) return
  }

  return {
    createForm,
    createSubmitting,
    createError,
    openCreateModal,
    onCreateSubmit,
  }
}
