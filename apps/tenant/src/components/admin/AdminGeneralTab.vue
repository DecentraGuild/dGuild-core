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
                @update:model-value="$emit('update:desiredSlug', $event)"
                @blur="$emit('slug-check-blur')"
              />
              <Button
                v-if="!tenant?.slug && desiredSlug.trim()"
                variant="secondary"
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
          v-model="form.branding.logo"
          label="Logo URL"
          placeholder="https://..."
        />
        <FormInput
          v-model="form.discordServerInviteLink"
          label="Invite link to Discord"
          placeholder="https://discord.gg/..."
        />
      </Card>
    </div>
    <slot name="sidebar" />
  </div>
</template>

<script setup lang="ts">
import { Card } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { FormInput } from '~/components/ui/form-input'
import { Icon } from '@iconify/vue'
import { getGateLabel } from '@decentraguild/config'
import type { AdminForm } from '~/composables/admin/useAdminForm'
import type { TenantConfig } from '@decentraguild/core'

const isProduction = import.meta.env.PROD
const gateLabel = getGateLabel()

defineProps<{
  form: AdminForm
  tenant: TenantConfig | null
  desiredSlug: string
  slugCheckStatus: 'idle' | 'checking' | 'available' | 'taken'
  slugChecking: boolean
  slugClaiming: boolean
}>()

defineEmits<{
  'update:desiredSlug': [value: string]
  'slug-check-blur': []
  'check-slug': []
}>()
</script>
