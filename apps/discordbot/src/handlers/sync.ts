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

/** Bot member is not always in cache when sync runs; fetch ensures we can read roles.highest.position. */
async function resolveBotMember(guild: Guild): Promise<GuildMember | null> {
  const cached = guild.members.me
  if (cached) return cached
  const uid = guild.client.user?.id
  if (!uid) return null
  try {
    return await guild.members.fetch(uid)
  } catch {
    return null
  }
}

/** Discord REST: 50001 Missing Access / 50013 Missing Permissions — usually role hierarchy or Manage Roles. */
function discordRoleActionHint(err: unknown): string {
  const code =
    err && typeof err === 'object' && 'code' in err ? (err as { code?: number }).code : undefined
  if (code === 50001 || code === 50013) {
    return ' → Bot must be above the role it assigns, and above the member’s top role (Discord blocks changes to users who outrank the bot). Check Manage Roles.'
  }
  return ''
}

const MEMBER_FETCH_TIMEOUT_MS = 180_000
const MEMBER_FETCH_RETRIES = 2

/** Fetch all members and return member_roles (user id -> role ids, excluding @everyone) and a member map for reuse. */
async function fetchMemberRolesAndMap(guild: Guild): Promise<{
  memberRoles: Record<string, string[]>
  memberMap: Map<string, GuildMember>
}> {
  let members: Awaited<ReturnType<Guild['members']['fetch']>> | null = null
  for (let attempt = 0; attempt <= MEMBER_FETCH_RETRIES; attempt++) {
    try {
      members = await guild.members.fetch({ time: MEMBER_FETCH_TIMEOUT_MS })
      break
    } catch (err) {
      const isTimeout = err instanceof Error && err.message.includes('didn\'t arrive in time')
      if (isTimeout && attempt < MEMBER_FETCH_RETRIES) {
        console.warn(`[roles] ${guild.name}: member fetch timeout, retry ${attempt + 1}/${MEMBER_FETCH_RETRIES}`)
        continue
      }
      throw err
    }
  }
  if (!members) throw new Error('member fetch returned null after retries')

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
      let member: GuildMember | null = null
      try {
        member = memberMap.get(userId) ?? (await guild.members.fetch(userId).catch(() => null))
        if (member && !member.roles.cache.has(discord_role_id)) {
          await member.roles.add(role)
        }
      } catch (err) {
        const code =
          err && typeof err === 'object' && 'code' in err ? (err as { code?: number }).code : undefined
        if (code === 50001 && member) {
          const me = guild.members.me
          const mh = member.roles.highest
          const bh = me?.roles.highest
          console.warn(
            `[roles] ${guild.name}: 50001 add blocked — user ${userId} memberTop="${mh?.name}" pos=${mh?.position}; botTop="${bh?.name}" pos=${bh?.position}; adding="${role.name}" pos=${role.position} (Discord: bot must rank above member’s top role to change their roles)`,
          )
        } else {
          console.warn(
            `[roles] ${guild.name}: add role ${discord_role_id} for ${userId} failed${discordRoleActionHint(err)}:`,
            err,
          )
        }
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
    const me = await resolveBotMember(guild)
    const rawPos = me?.roles.highest?.position
    const botRolePosition =
      typeof rawPos === 'number' && Number.isFinite(rawPos) && rawPos >= 0 ? rawPos : -1
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
