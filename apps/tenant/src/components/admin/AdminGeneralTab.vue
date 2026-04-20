<!-- eslint-disable vue/no-mutating-props -->
<template>
  <div class="admin__split">
    <div class="admin__panel">
      <Card>
        <GateSelectRowModule
          layout="stacked"
          :slug="tenant?.slug ?? tenant?.id ?? null"
          :model-value="form.defaultGate"
          :title="`${gateLabel} your Community`"
          hint="Base gate for your community. Use dGuild default, admins only, public, or a specific list."
          show-admin-only
          @update:model-value="form.defaultGate = ($event === 'use-default' ? null : $event)"
        />
        <h3>General</h3>
        <div v-if="tenant?.id" class="admin__ids-row">
          <div class="admin__ids-item">
            <span class="admin__ids-label">Tenant ID</span>
            <code>{{ tenant.id }}</code>
          </div>
          <div class="admin__ids-item admin__slug-field">
            <span class="admin__ids-label">Slug</span>
            <div class="admin__slug-input-row">
              <FormInput
                v-if="tenant?.slug"
                :model-value="tenant.slug"
                label=""
                disabled
              />
              <FormInput
                v-else
                :model-value="desiredSlug"
                label=""
                placeholder="e.g. my-community"
                :error="slugError ?? undefined"
                @update:model-value="$emit('update:desiredSlug', $event)"
                @blur="$emit('slug-check-blur')"
              />
              <Button
                v-if="!tenant?.slug && desiredSlug.trim()"
                variant="brand"
                size="sm"
                :disabled="slugChecking || slugClaiming"
                class="admin__slug-check-btn"
                :title="slugCheckStatus === 'available' ? 'Available – pay in sidebar to claim' : (slugCheckStatus === 'taken' ? 'Taken' : 'Check availability')"
                @click="$emit('check-slug')"
              >
                <Icon v-if="slugChecking" icon="lucide:loader-2" class="admin__slug-spinner" />
                <Icon v-else-if="slugCheckStatus === 'available'" icon="lucide:check-circle" class="admin__slug-check-icon admin__slug-check-icon--success" />
                <Icon v-else-if="slugCheckStatus === 'taken'" icon="lucide:x-circle" class="admin__slug-check-icon admin__slug-check-icon--taken" />
                <Icon v-else icon="lucide:check" />
              </Button>
            </div>
            <div v-if="!tenant?.slug && desiredSlug.trim() && slugCheckStatus === 'available'" class="admin__slug-available-hint">
              Available. Pay in the sidebar to claim.
            </div>
          </div>
        </div>
        <p v-if="tenant?.id && isProduction" class="admin__tenant-domain">
          <code>{{ (tenant.slug ?? (desiredSlug.trim() || tenant.id)) }}.dguild.org</code>
        </p>
        <FormInput
          v-model="form.name"
          label="Name"
        />
        <FormInput
          v-model="form.description"
          label="Description"
        />
        <FormInput
          v-model="form.welcomeMessage"
          label="Welcome message"
        />
        <FormInput
          v-model="form.branding.logo"
          label="Logo URL"
          placeholder="https://..."
        />
        <FormInput
          v-model="form.discordServerInviteLink"
          label="Invite link to Discord"
          placeholder="https://discord.gg/..."
          :error="discordError"
          @blur="discordError = validateDiscordLink(form.discordServerInviteLink).error ?? undefined"
        />
        <FormInput
          v-model="form.homepage"
          label="Homepage"
          placeholder="https://..."
          :error="homepageError"
          @blur="homepageError = validateHomepage(form.homepage).error ?? undefined"
        />
        <FormInput
          v-model="form.xLink"
          label="X (Twitter)"
          placeholder="https://x.com/username or https://twitter.com/username"
          :error="xError"
          @blur="xError = validateXLink(form.xLink).error ?? undefined"
        />
        <FormInput
          v-model="form.telegramLink"
          label="Telegram"
          placeholder="https://t.me/channel"
          :error="telegramError"
          @blur="telegramError = validateTelegramLink(form.telegramLink).error ?? undefined"
        />

        <template v-if="tenant?.slug">
          <h3 class="admin-pwa__heading">Install app (PWA)</h3>
          <p class="admin-pwa__hint">
            Shown when visitors add your dGuild to their home screen on your subdomain. Icons are served from your manifest.
          </p>
          <FormInput
            v-model="form.branding.pwa.displayName"
            label="PWA display name"
            placeholder="Optional; defaults to community name"
          />
          <FormInput
            v-model="form.branding.pwa.shortName"
            label="PWA short name"
            placeholder="Up to 12 characters"
          />
          <div class="admin-pwa__row">
            <input
              ref="pwaFileRef"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              class="admin-pwa__file"
              @change="onPwaIconFile"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              :disabled="pwaUploading"
              @click="pwaFileRef?.click()"
            >
              {{ pwaUploading ? 'Processing…' : 'Upload square icon' }}
            </Button>
            <span v-if="pwaUploadHint" class="admin-pwa__hint-text">{{ pwaUploadHint }}</span>
          </div>
          <p v-if="pwaUploadError" class="admin-pwa__error">{{ pwaUploadError }}</p>
          <FormInput
            v-model="form.branding.pwa.icon192"
            label="PWA icon 192 URL"
            placeholder="https://… (set automatically after upload)"
          />
          <FormInput
            v-model="form.branding.pwa.icon512"
            label="PWA icon 512 URL"
            placeholder="https://… (set automatically after upload)"
          />
        </template>
      </Card>
    </div>
    <slot name="sidebar" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Card } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { FormInput } from '~/components/ui/form-input'
import { Icon } from '@iconify/vue'
import { getGateLabel } from '@decentraguild/catalog'
import {
  validateDiscordLink,
  validateHomepage,
  validateXLink,
  validateTelegramLink,
} from '~/lib/validateSocialLinks'
import { resizeImageFileToPngBlob } from '~/lib/pwaIconResize'
import { useSupabase } from '~/composables/core/useSupabase'
import type { AdminForm } from '~/composables/admin/useAdminForm'
import type { TenantConfig } from '@decentraguild/core'

const isProduction = import.meta.env.PROD
const discordError = ref<string>()
const homepageError = ref<string>()
const xError = ref<string>()
const telegramError = ref<string>()
const pwaFileRef = ref<HTMLInputElement | null>(null)
const pwaUploading = ref(false)
const pwaUploadError = ref<string | null>(null)
const gateLabel = getGateLabel()

const props = defineProps<{
  form: AdminForm
  tenant: TenantConfig | null
  desiredSlug: string
  slugCheckStatus: 'idle' | 'checking' | 'available' | 'taken'
  slugChecking: boolean
  slugClaiming: boolean
  slugError: string | null
}>()

const pwaUploadHint = computed(() => {
  if (props.form.branding.pwa.icon192 && props.form.branding.pwa.icon512) return '192 and 512 icons ready.'
  return ''
})

async function onPwaIconFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  const id = props.tenant?.id
  if (!file || !id) return
  pwaUploadError.value = null
  pwaUploading.value = true
  try {
    const b192 = await resizeImageFileToPngBlob(file, 192)
    const b512 = await resizeImageFileToPngBlob(file, 512)
    const supabase = useSupabase()
    const up192 = await supabase.storage
      .from('tenant-pwa-icons')
      .upload(`${id}/icon-192.png`, b192, { contentType: 'image/png', upsert: true })
    if (up192.error) throw new Error(up192.error.message)
    const up512 = await supabase.storage
      .from('tenant-pwa-icons')
      .upload(`${id}/icon-512.png`, b512, { contentType: 'image/png', upsert: true })
    if (up512.error) throw new Error(up512.error.message)
    const u192 = supabase.storage.from('tenant-pwa-icons').getPublicUrl(`${id}/icon-192.png`)
    const u512 = supabase.storage.from('tenant-pwa-icons').getPublicUrl(`${id}/icon-512.png`)
    props.form.branding.pwa.icon192 = u192.data.publicUrl
    props.form.branding.pwa.icon512 = u512.data.publicUrl
  } catch (e) {
    pwaUploadError.value = e instanceof Error ? e.message : 'Upload failed'
  } finally {
    pwaUploading.value = false
    input.value = ''
  }
}

defineEmits<{
  'update:desiredSlug': [value: string]
  'slug-check-blur': []
  'check-slug': []
}>()
</script>

<style scoped>
.admin-pwa__heading {
  margin: var(--theme-space-lg) 0 var(--theme-space-sm);
  font-size: var(--theme-font-md);
  font-weight: 600;
}

.admin-pwa__hint {
  margin: 0 0 var(--theme-space-sm);
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.admin-pwa__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--theme-space-sm);
  margin-bottom: var(--theme-space-sm);
}

.admin-pwa__file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.admin-pwa__hint-text {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-secondary);
}

.admin-pwa__error {
  margin: 0 0 var(--theme-space-sm);
  font-size: var(--theme-font-xs);
  color: var(--theme-error);
}
</style>
