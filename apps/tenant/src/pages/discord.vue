<template>
  <PageSection title="Discord" module-id="discord">
    <div class="discord-page__layout">
      <div v-if="!discordVisible" class="discord-page__inactive">
        <p>Discord is not enabled for this dGuild.</p>
      </div>
      <Card v-else class="discord-page__card">
        <p v-if="discordDeactivating" class="discord-page__banner">
          Discord module is winding down. You can unlink wallets only.
        </p>
        <p class="discord-page__intro">
          Your Discord link and linked wallets are shared across all communities. Role eligibility is based on the combined holdings of all linked wallets.
        </p>
        <p v-if="discordServerInviteLink" class="discord-page__server-invite">
          <a :href="discordServerInviteLink" target="_blank" rel="noopener" class="discord-page__server-invite-link">
            Join our Discord
          </a>
        </p>

        <template v-if="loadingMe">
          <p class="discord-page__loading">
            <Icon icon="lucide:loader-2" class="discord-page__spinner" />
            Loading…
          </p>
        </template>

        <template v-else-if="!signedIn">
          <p class="discord-page__hint">Sign in with your wallet to see your linked Discord and wallets.</p>
        </template>

        <template v-else-if="!me?.discord_user_id">
          <p class="discord-page__hint">
            You have not linked a wallet to Discord yet. Use <strong>/verify</strong> in your community's Discord server to get a link, then complete the flow to link this (or another) wallet.
          </p>
        </template>

        <template v-else>
          <div class="discord-page__section">
            <h3 class="discord-page__heading">Linked to Discord</h3>
            <p class="discord-page__id">Account ID: <code>{{ me.discord_user_id }}</code></p>
          </div>

          <div class="discord-page__section">
            <h3 class="discord-page__heading">Linked wallets ({{ me.linked_wallets?.length ?? 0 }})</h3>
            <p class="discord-page__hint-small">Holdings from these wallets are combined for role rules.</p>
            <ul v-if="me.linked_wallets?.length" class="discord-page__wallets">
              <li
                v-for="addr in me.linked_wallets"
                :key="addr"
                class="discord-page__wallet-row"
              >
                <code class="discord-page__address">{{ truncate(addr) }}</code>
                <span v-if="addr === me.session_wallet" class="discord-page__badge">Current</span>
                <Button
                  variant="ghost"
                  size="sm"
                  :disabled="revoking === addr"
                  @click="revokeWallet(addr)"
                >
                  Unlink
                </Button>
              </li>
            </ul>
            <p v-else class="discord-page__hint-small">No wallets linked.</p>

            <Button
              v-if="!discordDeactivating"
              variant="brand"
              size="sm"
              :disabled="addingWallet"
              class="discord-page__add"
              @click="showConnectModal = true"
            >
              <Icon v-if="addingWallet" icon="lucide:loader-2" class="discord-page__spinner" />
              Link another wallet
            </Button>
            <p v-if="addError" class="discord-page__error">{{ addError }}</p>
          </div>

          <div v-if="roleCards.length > 0" class="discord-page__role-cards">
            <DiscordRoleCardsCarousel :role-cards="roleCards" />
          </div>

          <ConnectWalletModal
            :open="showConnectModal"
            title="Link another wallet"
            description="Connect a wallet to add it to your Discord account. Its holdings will be combined with your other linked wallets for roles."
            :connectors="connectorState.connectors"
            :loading="addingWallet"
            :error="addError"
            :wallet-connect-uri="walletConnectUri"
            :wallet-scan-pending="walletScanPending"
            @close="showConnectModal = false; addError = null"
            @select="handleAddWallet"
          />
        </template>
      </Card>
    </div>
  </PageSection>
</template>

<script setup lang="ts">
import { getModuleState, isModuleVisibleToMembers } from '@decentraguild/core'
import { Card } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { Icon } from '@iconify/vue'
import DiscordRoleCardsCarousel from '~/components/DiscordRoleCardsCarousel.vue'
import { useTenantStore } from '~/stores/tenant'
import { useDiscordPage } from '~/composables/discord/useDiscordPage'

const tenantStore = useTenantStore()
const tenant = computed(() => tenantStore.tenant)
const discordState = computed(() => getModuleState(tenant.value?.modules?.discord))
const discordVisible = computed(() => isModuleVisibleToMembers(discordState.value))
const discordDeactivating = computed(() => discordState.value === 'deactivating')
const discordServerInviteLink = computed(() => {
  const link = tenant.value?.discordServerInviteLink
  return link && link.trim() ? link.trim() : ''
})

const {
  me,
  loadingMe,
  signedIn,
  showConnectModal,
  addingWallet,
  addError,
  revoking,
  roleCards,
  connectorState,
  walletConnectUri,
  walletScanPending,
  truncate,
  fetchRoleCards,
  handleAddWallet,
  revokeWallet,
  setup,
  teardown,
} = useDiscordPage()

onMounted(setup)
watch(
  () => tenantStore.tenantId,
  (id) => {
    if (id && discordVisible.value) void fetchRoleCards()
  },
  { immediate: false },
)
onUnmounted(teardown)
</script>

<style scoped>
.discord-page__inactive {
  padding: var(--theme-space-lg);
  color: var(--theme-text-muted);
}

.discord-page__banner {
  padding: var(--theme-space-md);
  margin-bottom: var(--theme-space-md);
  background: var(--theme-surface-warning);
  border: var(--theme-border-thin) solid var(--theme-warning);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-text-primary);
  font-size: var(--theme-font-sm);
}

.discord-page__layout {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xl);
}

.discord-page__card {
  max-width: 36rem;
}

.discord-page__role-cards {
  margin-top: var(--theme-space-md);
  min-width: 0;
}

.discord-page__intro {
  margin-bottom: var(--theme-space-md);
  color: var(--theme-text-secondary);
}

.discord-page__server-invite {
  margin: 0 0 var(--theme-space-md);
}

.discord-page__server-invite-link {
  color: var(--theme-primary);
  text-decoration: none;
}

.discord-page__server-invite-link:hover {
  text-decoration: underline;
}

.discord-page__loading,
.discord-page__hint {
  margin: var(--theme-space-md) 0;
}

.discord-page__section {
  margin-bottom: var(--theme-space-lg);
}

.discord-page__heading {
  font-size: var(--theme-font-md);
  font-weight: 600;
  color: var(--theme-secondary);
  margin-bottom: var(--theme-space-xs);
}

.discord-page__id {
  font-size: var(--theme-font-sm);
  word-break: break-all;
}

.discord-page__hint-small {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin-bottom: var(--theme-space-sm);
}

.discord-page__wallets {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--theme-space-md);
}

.discord-page__wallet-row {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  margin-bottom: var(--theme-space-xs);
}

.discord-page__address {
  font-size: var(--theme-font-sm);
}

.discord-page__badge {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
  margin-left: var(--theme-space-xs);
}

.discord-page__add {
  margin-top: var(--theme-space-xs);
}

.discord-page__error {
  color: var(--theme-error, #c00);
  font-size: var(--theme-font-sm);
  margin-top: var(--theme-space-sm);
}

.discord-page__spinner {
  vertical-align: middle;
  margin-right: var(--theme-space-xs);
  animation: discord-page-spin 1s linear infinite;
}

@keyframes discord-page-spin {
  to { transform: rotate(360deg); }
}
</style>
