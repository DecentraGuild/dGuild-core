<template>
  <PageSection title="Member profile" module-id="gates">
    <div class="profile-page">
      <div v-if="!gatesVisible" class="profile-page__inactive">
        <p>Member lists is not enabled for this dGuild.</p>
      </div>

      <div v-else-if="!wallet" class="profile-page__inactive">
        <p>Connect your wallet to view your profile.</p>
      </div>

      <div v-else-if="loading" class="profile-page__loading">
        <Icon icon="lucide:loader-2" class="profile-page__spinner" />
        Loading…
      </div>

      <div v-else-if="profileLoadError" class="profile-page__inactive">
        <p>{{ profileLoadError }}</p>
      </div>

      <div v-else-if="!sessionAuthenticated" class="profile-page__inactive">
        <p>Sign in with your wallet (use the account menu above) to load your member profile. Connecting alone is not enough for profile and eligibility checks.</p>
      </div>

      <div v-else-if="!primaryListMeta" class="profile-page__inactive">
        <p>Your community hasn't enabled member profiles yet.</p>
      </div>

      <div v-else-if="!eligible" class="profile-page__inactive">
        <p>You need to be on the <strong>{{ primaryListDisplayName }}</strong> list to create a profile.</p>
      </div>

      <div v-else class="profile-page__form">
        <div class="profile-page__member-id">
          <span class="profile-page__label">Member ID</span>
          <code class="profile-page__id-value">{{ profile?.member_id ?? '—' }}</code>
        </div>

        <div v-if="fields.nickname" class="profile-page__field">
          <FormInput
            v-model="form.nickname"
            label="Nickname"
            placeholder="Your display name"
            :maxlength="32"
          />
        </div>

        <div v-if="fields.description" class="profile-page__field">
          <label class="profile-page__label">Description</label>
          <Textarea
            v-model="form.description"
            placeholder="About you"
            :maxlength="500"
            class="profile-page__textarea"
          />
        </div>

        <div v-if="fields.avatar_url" class="profile-page__field">
          <FormInput
            v-model="form.avatar_url"
            label="Avatar URL"
            placeholder="https://example.com/avatar.png"
          />
          <img
            v-if="form.avatar_url && isValidAvatarUrl"
            :src="form.avatar_url"
            alt="Avatar preview"
            class="profile-page__avatar-preview"
          >
        </div>

        <div class="profile-page__field">
          <span class="profile-page__label">Discord</span>
          <div class="profile-page__discord-chip">
            <template v-if="discordUserId">
              <Icon icon="simple-icons:discord" class="profile-page__discord-icon" />
              <span>Linked ({{ discordUserId }})</span>
            </template>
            <template v-else>
              <span class="profile-page__discord-not-linked">Not linked</span>
              <NuxtLink to="/discord" class="profile-page__discord-link">Link Discord</NuxtLink>
            </template>
          </div>
        </div>

        <div v-if="fields.x_handle" class="profile-page__field">
          <FormInput
            v-model="form.x_handle"
            label="X handle"
            placeholder="@username"
          />
        </div>

        <div v-if="fields.telegram_handle" class="profile-page__field">
          <FormInput
            v-model="form.telegram_handle"
            label="Telegram"
            placeholder="@username"
          />
        </div>

        <div v-if="fields.email" class="profile-page__field">
          <FormInput
            v-model="form.email"
            label="Email"
            placeholder="you@example.com"
          />
        </div>

        <div v-if="fields.phone" class="profile-page__field">
          <FormInput
            v-model="form.phone"
            label="Phone"
            placeholder="+1 555-1234"
          />
        </div>

        <div v-if="fields.linked_wallets" class="profile-page__field">
          <span class="profile-page__label">Linked wallets</span>
          <div class="profile-page__linked-wallets">
            <div
              v-for="(lw, i) in form.linked_wallets"
              :key="i"
              class="profile-page__linked-wallet-row"
            >
              <FormInput
                :model-value="lw"
                placeholder="Solana wallet address"
                @update:model-value="form.linked_wallets[i] = $event as string"
              />
              <Button variant="ghost" size="sm" @click="form.linked_wallets.splice(i, 1)">
                <Icon icon="lucide:x" />
              </Button>
            </div>
            <Button variant="secondary" size="sm" @click="form.linked_wallets.push('')">
              Add wallet
            </Button>
          </div>
        </div>

        <div class="profile-page__actions">
          <Button
            variant="brand"
            :disabled="saving"
            @click="saveProfile"
          >
            <Icon v-if="saving" icon="lucide:loader-2" class="profile-page__spinner" />
            Save profile
          </Button>
          <span v-if="saveSuccess" class="profile-page__success">Saved</span>
          <span v-if="saveError" class="profile-page__error">{{ saveError }}</span>
        </div>
      </div>
    </div>
  </PageSection>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'gates-module' })

import { getModuleState, isModuleVisibleToMembers } from '@decentraguild/core'
import type { ProfileFieldConfig } from '@decentraguild/core'
import { truncateAddress } from '@decentraguild/display'
import { Icon } from '@iconify/vue'
import { useAuth } from '@decentraguild/auth'
import { invokeEdgeFunction } from '@decentraguild/nuxt-composables'
import { useSupabase } from '~/composables/core/useSupabase'
import { useTenantStore } from '~/stores/tenant'
import { Button } from '~/components/ui/button'
import FormInput from '~/components/ui/form-input/FormInput.vue'
import { Textarea } from '~/components/ui/textarea'

const tenantStore = useTenantStore()
const auth = useAuth()

const tenant = computed(() => tenantStore.tenant)
const tenantId = computed(() => tenantStore.tenantId)
const wallet = computed(
  () => auth.connectorState.value?.account ?? auth.wallet.value ?? null,
)

const gatesState = computed(() => getModuleState(tenant.value?.modules?.gates))
const gatesVisible = computed(() => isModuleVisibleToMembers(gatesState.value))

const fields = computed<ProfileFieldConfig>(() => tenant.value?.profileFields ?? {})

const loading = ref(true)
const eligible = ref(false)
/** Present when a primary list row exists (address always set; name may be null). */
const primaryListMeta = ref<{ address: string; name: string | null } | null>(null)
/** False when the Edge Function could not read a wallet from the Supabase session JWT. */
const sessionAuthenticated = ref(true)
const profile = ref<Record<string, unknown> | null>(null)

const primaryListDisplayName = computed(() => {
  const m = primaryListMeta.value
  if (!m) return ''
  if (m.name?.trim()) return m.name.trim()
  return truncateAddress(m.address, 8, 4)
})
const discordUserId = ref<string | null>(null)

const form = reactive({
  nickname: '',
  description: '',
  avatar_url: '',
  x_handle: '',
  telegram_handle: '',
  email: '',
  phone: '',
  linked_wallets: [] as string[],
})

const saving = ref(false)
const saveSuccess = ref(false)
const saveError = ref<string | null>(null)
const profileLoadError = ref<string | null>(null)

const isValidAvatarUrl = computed(() => /^https?:\/\/.+/.test(form.avatar_url))

function loadProfileIntoForm(p: Record<string, unknown> | null) {
  form.nickname = (p?.nickname as string) ?? ''
  form.description = (p?.description as string) ?? ''
  form.avatar_url = (p?.avatar_url as string) ?? ''
  form.x_handle = (p?.x_handle as string) ?? ''
  form.telegram_handle = (p?.telegram_handle as string) ?? ''
  form.email = (p?.email as string) ?? ''
  form.phone = (p?.phone as string) ?? ''
  form.linked_wallets = Array.isArray(p?.linked_wallets)
    ? [...(p.linked_wallets as string[])]
    : []
  discordUserId.value = (p?.discord_user_id as string) ?? null
}

async function fetchMe() {
  const id = tenantId.value
  if (!id || !wallet.value || !gatesVisible.value) {
    loading.value = false
    primaryListMeta.value = null
    sessionAuthenticated.value = true
    profileLoadError.value = null
    eligible.value = false
    return
  }
  loading.value = true
  profileLoadError.value = null
  try {
    const supabase = useSupabase()
    const data = await invokeEdgeFunction<{
      profile: Record<string, unknown> | null
      eligible: boolean
      primaryList: { address: string; name: string | null } | null
      authenticated?: boolean
    }>(supabase, 'member-profile', { action: 'me', tenantId: id })

    sessionAuthenticated.value = data.authenticated !== false
    eligible.value = data.eligible
    primaryListMeta.value = data.primaryList ?? null
    profile.value = data.profile
    loadProfileIntoForm(data.profile)
  } catch (e) {
    eligible.value = false
    primaryListMeta.value = null
    sessionAuthenticated.value = true
    profileLoadError.value = e instanceof Error ? e.message : 'Could not load profile'
  } finally {
    loading.value = false
  }
}

async function saveProfile() {
  const id = tenantId.value
  if (!id || !wallet.value) return
  saving.value = true
  saveSuccess.value = false
  saveError.value = null
  try {
    const supabase = useSupabase()
    const payload: Record<string, unknown> = {}
    if (fields.value.nickname) payload.nickname = form.nickname
    if (fields.value.description) payload.description = form.description
    if (fields.value.avatar_url) payload.avatar_url = form.avatar_url
    if (fields.value.x_handle) payload.x_handle = form.x_handle
    if (fields.value.telegram_handle) payload.telegram_handle = form.telegram_handle
    if (fields.value.email) payload.email = form.email
    if (fields.value.phone) payload.phone = form.phone
    if (fields.value.linked_wallets) {
      payload.linked_wallets = form.linked_wallets.filter((w) => w.trim())
    }

    const data = await invokeEdgeFunction<{ profile: Record<string, unknown> }>(
      supabase,
      'member-profile',
      { action: 'upsert-me', tenantId: id, fields: payload },
    )
    profile.value = data.profile
    loadProfileIntoForm(data.profile)
    saveSuccess.value = true
    setTimeout(() => { saveSuccess.value = false }, 3000)
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Failed to save profile'
  } finally {
    saving.value = false
  }
}

watch([tenantId, gatesVisible, wallet], () => fetchMe(), { immediate: true })
</script>

<style scoped>
.profile-page__inactive,
.profile-page__loading {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}
.profile-page__inactive p {
  margin: 0;
}
.profile-page__spinner {
  animation: profile-spin 1s linear infinite;
}
@keyframes profile-spin {
  to { transform: rotate(360deg); }
}
.profile-page__form {
  max-width: 32rem;
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}
.profile-page__member-id {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
}
.profile-page__id-value {
  font-size: var(--theme-font-sm);
  background: var(--theme-bg-secondary);
  padding: 2px var(--theme-space-xs);
  border-radius: var(--theme-radius-sm);
  letter-spacing: 0.05em;
}
.profile-page__label {
  display: block;
  font-size: var(--theme-font-sm);
  font-weight: 500;
  margin-bottom: var(--theme-space-xs);
  color: var(--theme-text-primary);
}
.profile-page__field {
  display: flex;
  flex-direction: column;
}
.profile-page__textarea {
  min-height: 4rem;
}
.profile-page__avatar-preview {
  width: 4rem;
  height: 4rem;
  object-fit: cover;
  border-radius: var(--theme-radius-md);
  margin-top: var(--theme-space-xs);
  border: var(--theme-border-thin) solid var(--theme-border);
}
.profile-page__discord-chip {
  display: flex;
  align-items: center;
  gap: var(--theme-space-xs);
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}
.profile-page__discord-icon {
  font-size: 1rem;
}
.profile-page__discord-not-linked {
  color: var(--theme-text-muted);
}
.profile-page__discord-link {
  color: var(--theme-primary);
  text-decoration: underline;
  font-size: var(--theme-font-sm);
}
.profile-page__linked-wallets {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
}
.profile-page__linked-wallet-row {
  display: flex;
  gap: var(--theme-space-xs);
  align-items: center;
}
.profile-page__linked-wallet-row .form-input {
  flex: 1;
  margin-bottom: 0;
}
.profile-page__actions {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  padding-top: var(--theme-space-sm);
}
.profile-page__success {
  font-size: var(--theme-font-sm);
  color: var(--theme-status-success);
}
.profile-page__error {
  font-size: var(--theme-font-sm);
  color: var(--theme-status-error);
}
</style>
