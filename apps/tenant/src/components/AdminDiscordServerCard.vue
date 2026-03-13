<template>
  <Card>
    <h3>Discord server</h3>
    <p class="discord-server-card__hint">
      Connect one Discord server to this community. Members can use /verify to link their wallet and receive roles based on token and NFT rules.
    </p>

    <template v-if="loading">
      <p class="discord-server-card__loading">
        <Icon icon="lucide:loader-2" class="discord-server-card__spinner" />
        Loading…
      </p>
    </template>

    <template v-else-if="server.connected">
      <div class="discord-server-card__connected">
        <p class="discord-server-card__status">
          <Icon icon="lucide:check-circle" class="discord-server-card__status-icon" />
          Connected: {{ server.guild_name || server.discord_guild_id }}
        </p>
        <p v-if="server.guild_name" class="discord-server-card__guild-id">
          Server ID: <code>{{ server.discord_guild_id }}</code>
        </p>
        <Button
          variant="secondary"
          :disabled="disconnecting"
          @click="$emit('disconnect')"
        >
          Disconnect
        </Button>
      </div>
    </template>

    <template v-else>
      <div class="discord-server-card__connect">
        <p class="discord-server-card__step">
          1. Invite the DecentraGuild bot to your Discord server.
        </p>
        <p v-if="inviteUrl" class="discord-server-card__invite">
          <a :href="inviteUrl" target="_blank" rel="noopener">
            Invite bot to server
          </a>
        </p>
        <p v-if="inviteUrl" class="discord-server-card__permissions-hint">
          This link requests only two permissions: Manage Roles (to assign/remove roles) and Use Application Commands (for /verify). After inviting the bot, move it above the roles you want it to assign and create any new roles you plan to use.
        </p>
        <p v-else class="discord-server-card__hint">
          Invite URL not configured. Set DISCORD_CLIENT_ID on the API.
        </p>
        <p class="discord-server-card__step">
          2. Enable Developer Mode in Discord (User Settings → App Settings → Advanced), then right‑click your server name and choose "Copy Server ID".
        </p>
        <div class="discord-server-card__link-row">
          <FormInput
            :model-value="guildIdInput"
            placeholder="Paste Discord Server ID"
            label="Server ID"
            :error="linkError ?? undefined"
            @update:model-value="$emit('update:guildIdInput', $event)"
          />
          <Button
            variant="default"
            :disabled="!guildIdInput.trim() || linking"
            @click="$emit('link', { guildId: guildIdInput.trim() })"
          >
            Link server
          </Button>
        </div>
        <p class="discord-server-card__permissions-hint">
          Holder snapshots and role checks run on a schedule (around every 15 minutes for typical collections). After changing roles or bot position, allow up to 15 minutes for updates to take effect.
        </p>
      </div>
    </template>
  </Card>
</template>

<script setup lang="ts">
import { Card } from '~/components/ui/card'
import { FormInput } from '~/components/ui/form-input'
import { Button } from '~/components/ui/button'
import { Icon } from '@iconify/vue'

defineProps<{
  slug: string
  loading: boolean
  server: {
    connected: boolean
    discord_guild_id?: string
    guild_name?: string | null
    connected_at?: string
  }
  inviteUrl: string | null
  guildIdInput: string
  linkError: string | null
  linking: boolean
  disconnecting: boolean
}>()

defineEmits<{
  'update:guildIdInput': [value: string]
  link: [payload: { guildId: string }]
  disconnect: []
}>()
</script>

<style scoped>
.discord-server-card__hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin-bottom: var(--theme-space-md);
}

.discord-server-card__loading {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
}

.discord-server-card__spinner {
  animation: discord-server-spin 1s linear infinite;
}

@keyframes discord-server-spin {
  to { transform: rotate(360deg); }
}

.discord-server-card__connected {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}

.discord-server-card__status {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
}

.discord-server-card__status-icon {
  color: var(--theme-status-success);
}

.discord-server-card__guild-id {
  font-size: var(--theme-font-sm);
}

.discord-server-card__guild-id code {
  background: var(--theme-bg-secondary);
  padding: 2px 6px;
  border-radius: var(--theme-radius-sm);
}

.discord-server-card__connect {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}

.discord-server-card__step {
  margin: 0;
}

.discord-server-card__invite {
  margin: 0;
}

.discord-server-card__invite a {
  color: var(--theme-primary);
  text-decoration: underline;
}

.discord-server-card__invite a:hover {
  text-decoration: none;
}

.discord-server-card__permissions-hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin-top: var(--theme-space-sm);
  margin-bottom: 0;
  max-width: 42rem;
}

.discord-server-card__link-row {
  display: flex;
  align-items: center;
  gap: var(--theme-space-md);
  flex-wrap: wrap;
}

.discord-server-card__link-row :deep(.form-input) {
  flex: 1;
  min-width: 200px;
  margin-bottom: 0;
}

.discord-server-card__link-row :deep(.form-input__field) {
  height: var(--theme-input-height, 2.25rem);
  min-height: var(--theme-input-height, 2.25rem);
  box-sizing: border-box;
}

.discord-server-card__link-row :deep(button) {
  height: var(--theme-input-height, 2.25rem);
  min-height: var(--theme-input-height, 2.25rem);
  flex-shrink: 0;
}
</style>
