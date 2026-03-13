/**
 * Discord member page: linked account, wallets, role cards.
 * Fetches via discord-verify and discord-server Edge Functions.
 */
import type { WalletConnectorId } from '@solana/connector/headless'
import {
  getConnectorState,
  connectWallet,
  subscribeToConnectorState,
} from '@decentraguild/web3/wallet'
import { truncateAddress } from '@decentraguild/display'
import { useAuth } from '@decentraguild/auth'
import { useSupabase } from '~/composables/core/useSupabase'
import { useTenantStore } from '~/stores/tenant'
import type { RoleCard } from '~/components/DiscordRoleCardsCarousel.vue'

export interface DiscordMe {
  discord_user_id: string | null
  linked_wallets: string[]
  session_wallet: string
}

export function useDiscordPage() {
  const auth = useAuth()
  const tenantStore = useTenantStore()

  const me = ref<DiscordMe | null>(null)
  const loadingMe = ref(true)
  const signedIn = ref(false)
  const showConnectModal = ref(false)
  const addingWallet = ref(false)
  const addError = ref<string | null>(null)
  const revoking = ref<string | null>(null)
  const roleCards = ref<RoleCard[]>([])
  const connectorState = ref(getConnectorState())

  const truncate = (addr: string) => truncateAddress(addr, 6, 4)

  async function fetchMe() {
    loadingMe.value = true
    try {
      const supabase = useSupabase()
      const { data, error } = await supabase.functions.invoke('discord-verify', {
        body: { action: 'me' },
      })
      if (error || !(data as { linked?: boolean }).linked) {
        signedIn.value = Boolean(auth.wallet.value)
        me.value = null
        return
      }
      signedIn.value = true
      const result = data as {
        linked: boolean
        discordUserId: string
        linkedWallets: Array<{ wallet: string; linkedAt: string }>
      }
      me.value = {
        discord_user_id: result.discordUserId,
        linked_wallets: result.linkedWallets.map((w) => w.wallet),
        session_wallet: auth.wallet.value ?? '',
      }
    } catch {
      me.value = null
    } finally {
      loadingMe.value = false
    }
  }

  async function fetchRoleCards() {
    const id = tenantStore.tenantId
    if (!id) return
    try {
      const supabase = useSupabase()
      const { data, error } = await supabase.functions.invoke('discord-server', {
        body: { action: 'role-cards', tenantId: id },
      })
      if (error) return
      roleCards.value = (data as { cards?: RoleCard[] }).cards ?? []
    } catch {
      roleCards.value = []
    }
  }

  async function doLinkAdditionalWallet(connectorId: WalletConnectorId) {
    const discordUserId = me.value?.discord_user_id
    if (!discordUserId) throw new Error('Not linked to Discord')

    const ok = await auth.connectAndSignIn(connectorId)
    if (!ok) throw new Error(auth.error.value ?? 'Sign-in failed')

    const supabase = useSupabase()
    const { data, error } = await supabase.functions.invoke('discord-verify', {
      body: { action: 'link-additional', discordUserId },
    })
    if (error) throw new Error(error.message ?? 'Link failed')
    const result = data as { ok?: boolean; error?: string }
    if (result.error) throw new Error(result.error)
  }

  async function handleAddWallet(connectorId: WalletConnectorId) {
    addError.value = null
    addingWallet.value = true
    try {
      await connectWallet(connectorId)
      connectorState.value = getConnectorState()
      if (!connectorState.value.account) {
        addError.value = 'Wallet not connected'
        return
      }
      await doLinkAdditionalWallet(connectorId)
      showConnectModal.value = false
      await fetchMe()
      await fetchRoleCards()
    } catch (e) {
      addError.value = e instanceof Error ? e.message : 'Something went wrong'
    } finally {
      addingWallet.value = false
    }
  }

  async function revokeWallet(addr: string) {
    revoking.value = addr
    try {
      const supabase = useSupabase()
      const { error } = await supabase.functions.invoke('discord-verify', {
        body: { action: 'revoke', wallet: addr },
      })
      if (!error) {
        await fetchMe()
        await fetchRoleCards()
      }
    } finally {
      revoking.value = null
    }
  }

  let unsubscribe: (() => void) | null = null
  function setup() {
    unsubscribe = subscribeToConnectorState(() => {
      connectorState.value = getConnectorState()
    })
    fetchMe()
    fetchRoleCards()
  }
  function teardown() {
    unsubscribe?.()
  }

  return {
    me,
    loadingMe,
    signedIn,
    showConnectModal,
    addingWallet,
    addError,
    revoking,
    roleCards,
    connectorState,
    truncate,
    fetchMe,
    fetchRoleCards,
    handleAddWallet,
    revokeWallet,
    setup,
    teardown,
  }
}
