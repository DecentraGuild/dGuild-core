<template>
  <div class="role-cards">
    <h3 class="role-cards__title">Role requirements</h3>
    <div class="role-cards__grid">
      <article
        v-for="card in roleCards"
        :key="card.role_id"
        class="role-card"
        :class="{ 'role-card--not-eligible': card.eligible === false }"
        :style="roleCardStyle(card)"
      >
        <div class="role-card__icon-wrap">
          <img
            v-if="card.icon"
            :src="discordRoleIconUrl(card.role_id, card.icon)"
            :alt="card.name"
            class="role-card__icon role-card__icon--img"
          />
          <span
            v-else-if="card.unicode_emoji"
            class="role-card__emoji"
            aria-hidden="true"
          >{{ card.unicode_emoji }}</span>
          <Icon
            v-else
            icon="lucide:shield"
            class="role-card__icon role-card__icon--fallback"
          />
        </div>
        <h4 class="role-card__name">{{ card.name }}</h4>
        <span v-if="card.eligible === true" class="role-card__badge">
          <Icon icon="lucide:check-circle" class="role-card__badge-icon" />
          You qualify
        </span>
        <ul v-if="card.requirements?.length" class="role-card__requirements">
          <template v-for="(item, idx) in card.requirements" :key="idx">
            <li v-if="item.type === 'text'" class="role-card__req-item">
              {{ item.text }}
            </li>
            <li v-else-if="item.type === 'separator' && item.label === 'OR'" class="role-card__req-sep">
              OR
            </li>
          </template>
        </ul>
        <p v-else class="role-card__empty">No requirements</p>
        <div v-if="admin" class="role-card__actions">
          <Button variant="ghost" size="icon" aria-label="Edit rule" @click="emit('edit', card)">
            <Icon icon="lucide:pencil" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Delete rule" @click="emit('delete', card)">
            <Icon icon="lucide:trash-2" />
          </Button>
        </div>
      </article>
      <button
        v-if="admin"
        type="button"
        class="role-card role-card--create"
        @click="emit('create')"
      >
        <Icon icon="lucide:plus" class="role-card__create-icon" />
        <span class="role-card__create-label">Create role</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { Button } from '~/components/ui/button'

export interface RoleCardRequirementText {
  type: 'text'
  text: string
}

export interface RoleCardRequirementSeparator {
  type: 'separator'
  label: 'OR' | 'and'
}

export type RoleCardRequirementItem = RoleCardRequirementText | RoleCardRequirementSeparator

export interface RoleCard {
  role_id: string
  name: string
  position: number
  color?: number
  icon?: string
  unicode_emoji?: string
  requirements: RoleCardRequirementItem[]
  /** When signed in with Discord linked: true = qualifies, false = does not qualify, undefined = not computed */
  eligible?: boolean
  /** Admin only: rule id from discord_role_rules */
  rule_id?: number
  /** Admin only: condition_set_id for edit/navigate */
  condition_set_id?: number
}

defineProps<{
  roleCards: RoleCard[]
  admin?: boolean
}>()

const emit = defineEmits<{
  edit: [card: RoleCard]
  delete: [card: RoleCard]
  create: []
}>()

const DISCORD_CDN = 'https://cdn.discordapp.com'
const DISCORD_BLURPLE = 0x5865f2

function discordRoleIconUrl(roleId: string, iconHash: string): string {
  return `${DISCORD_CDN}/role-icons/${roleId}/${iconHash}.png`
}

function roleCardStyle(card: RoleCard): Record<string, string> {
  const color = card.color != null && card.color !== 0 ? card.color : DISCORD_BLURPLE
  const hex = `#${color.toString(16).padStart(6, '0')}`
  return {
    '--role-card-accent': hex,
  }
}
</script>

<style scoped>
.role-cards {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.role-cards__title {
  font-size: var(--theme-font-md);
  font-weight: 600;
  margin-bottom: var(--theme-space-md);
  color: var(--theme-text-primary);
}

.role-cards__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
  gap: var(--theme-space-md);
}

.role-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  background-color: var(--theme-bg-card);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  padding: var(--theme-space-xl);
  border-left: 4px solid var(--role-card-accent, var(--theme-primary));
  min-height: 16rem;
}

.role-card--not-eligible {
  opacity: 0.5;
  filter: grayscale(0.6);
}

.role-card--not-eligible .role-card__name {
  color: var(--theme-text-muted);
}

.role-card__badge {
  display: inline-flex;
  align-items: center;
  gap: var(--theme-space-xs);
  margin-bottom: var(--theme-space-sm);
  font-size: var(--theme-font-xs);
  font-weight: 600;
  color: var(--theme-status-success, #22c55e);
}

.role-card__badge-icon {
  font-size: 1rem;
}

.role-card__icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  margin-bottom: var(--theme-space-md);
  border-radius: var(--theme-radius-md);
  background-color: color-mix(in srgb, var(--role-card-accent, var(--theme-primary)) 20%, transparent);
}

.role-card__icon--img,
.role-card__icon--fallback {
  width: 85%;
  height: 85%;
  object-fit: contain;
}

.role-card__icon--fallback {
  color: var(--role-card-accent, var(--theme-primary));
}

.role-card__emoji {
  font-size: 2.5rem;
  line-height: 1;
}

.role-card__name {
  font-size: var(--theme-font-md);
  font-weight: 600;
  margin: 0 0 var(--theme-space-md);
  color: var(--theme-text-primary);
}

.role-card__requirements {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.role-card__req-item {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--theme-space-xs);
  margin-bottom: var(--theme-space-xs);
  text-align: center;
}

.role-card__req-item::before {
  content: '';
  flex-shrink: 0;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: var(--theme-text-muted);
}

.role-card__req-sep {
  font-weight: 600;
  color: var(--theme-text-muted);
  margin: var(--theme-space-xs) 0;
  text-align: center;
}

.role-card__empty {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  text-align: center;
}

.role-card__actions {
  display: flex;
  gap: var(--theme-space-xs);
  margin-top: auto;
  padding-top: var(--theme-space-md);
}

.role-card--create {
  cursor: pointer;
  border: var(--theme-border-medium) dashed var(--theme-border);
  background: var(--theme-bg-muted);
  justify-content: center;
  min-height: 16rem;
}

.role-card--create:hover {
  border-color: var(--theme-primary);
  background: var(--theme-bg-secondary);
}

.role-card__create-icon {
  font-size: 2.5rem;
  color: var(--theme-text-muted);
  margin-bottom: var(--theme-space-sm);
}

.role-card--create:hover .role-card__create-icon {
  color: var(--theme-primary);
}

.role-card__create-label {
  font-size: var(--theme-font-sm);
  font-weight: 500;
  color: var(--theme-text-secondary);
}

.role-card--create:hover .role-card__create-label {
  color: var(--theme-primary);
}
</style>
