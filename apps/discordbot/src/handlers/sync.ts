import type { Guild, GuildMember } from 'discord.js'
import {
  getBotContext,
  syncGuildRoles,
  getEligible,
  scheduleRemovals,
  getPendingRemovals,
  ApiError,
} from '../api-client.js'
import { hasBotSecret } from '../config.js'
import { GUILD_NOT_LINKED_CODE } from '../discord-errors.js'

/** Discord REST: 50001 Missing Access / 50013 Missing Permissions — usually role hierarchy or Manage Roles. */
function discordRoleActionHint(err: unknown): string {
  const code =
    err && typeof err === 'object' && 'code' in err ? (err as { code?: number }).code : undefined
  if (code === 50001 || code === 50013) {
    return ' → Bot must be above the role it assigns, and above the member’s top role (Discord blocks changes to users who outrank the bot). Check Manage Roles.'
  }
  return ''
}

/** Fetch all members and return member_roles (user id -> role ids, excluding @everyone) and a member map for reuse. */
async function fetchMemberRolesAndMap(guild: Guild): Promise<{
  memberRoles: Record<string, string[]>
  memberMap: Map<string, GuildMember>
}> {
  const members = await guild.members.fetch()
  const memberRoles: Record<string, string[]> = {}
  const memberMap = new Map<string, GuildMember>()
  const everyoneId = guild.id
  for (const [, member] of members) {
    memberMap.set(member.id, member)
    const roleIds = member.roles.cache
      .filter((r) => r.id !== everyoneId)
      .map((r) => r.id)
    memberRoles[member.id] = roleIds
  }
  return { memberRoles, memberMap }
}

/** Compute eligible members from DB (holder_current maintained by cron-tracker), then apply/remove roles. Requires GuildMembers intent. */
export async function runRoleSyncForGuild(guild: Guild): Promise<void> {
  if (!hasBotSecret()) return

  const { memberRoles, memberMap } = await fetchMemberRolesAndMap(guild)
  const { eligible } = await getEligible(guild.id, memberRoles)
  if (eligible.length === 0) {
    console.log(`[roles] ${guild.name}: no role rules (skip)`)
    return
  }

  const toRemove: Array<{ discord_user_id: string; discord_role_id: string }> = []

  for (const { discord_role_id, eligible_discord_user_ids } of eligible) {
    const role = guild.roles.cache.get(discord_role_id)
    if (!role) continue

    const eligibleSet = new Set(eligible_discord_user_ids)

    for (const userId of eligible_discord_user_ids) {
      try {
        const member = memberMap.get(userId) ?? (await guild.members.fetch(userId).catch(() => null))
        if (member && !member.roles.cache.has(discord_role_id)) {
          await member.roles.add(role)
        }
      } catch (err) {
        console.warn(
          `[roles] ${guild.name}: add role ${discord_role_id} for ${userId} failed${discordRoleActionHint(err)}:`,
          err,
        )
      }
    }

    for (const member of role.members.values()) {
      if (!eligibleSet.has(member.id)) toRemove.push({ discord_user_id: member.id, discord_role_id })
    }
  }

  if (toRemove.length > 0) {
    await scheduleRemovals(guild.id, toRemove)
  }

  const { removals } = await getPendingRemovals(guild.id)
  for (const { discord_user_id, discord_role_id } of removals) {
    try {
      const member =
        memberMap.get(discord_user_id) ?? (await guild.members.fetch(discord_user_id).catch(() => null))
      if (member) await member.roles.remove(discord_role_id)
    } catch (err) {
      console.warn(
        `[roles] ${guild.name}: remove role ${discord_role_id} for ${discord_user_id} failed${discordRoleActionHint(err)}:`,
        err,
      )
    }
  }

  console.log(`[roles] ${guild.name}: cycle complete`)
}

export async function syncLinkedGuild(guild: Guild): Promise<void> {
  if (!hasBotSecret()) return
  try {
    const ctx = await getBotContext(guild.id)
    const roles = guild.roles.cache
      .filter((r) => !r.managed && r.id !== guild.id)
      .map((r) => ({
        id: r.id,
        name: r.name,
        position: r.position,
        color: r.color ?? null,
        icon: r.icon ?? null,
        unicode_emoji: (r as { unicodeEmoji?: string | null }).unicodeEmoji ?? null,
      }))
    const me = guild.members.me
    const botRolePosition = me?.roles?.cache?.reduce((max, r) => Math.max(max, r.position), -1) ?? -1
    await syncGuildRoles(
      guild.id,
      roles,
      botRolePosition >= 0 ? botRolePosition : undefined,
    )

    if (ctx.discordModuleState === 'active') {
      await runRoleSyncForGuild(guild)
    } else {
      console.log(`[sync] ${guild.name}: Discord module not active (role rules skipped)`)
    }
  } catch (err) {
    if (err instanceof ApiError && (err.code === GUILD_NOT_LINKED_CODE || err.status === 404)) {
      console.log(`[sync] ${guild.name}: not linked in platform (skip)`)
      return
    }
    throw err
  }
}
