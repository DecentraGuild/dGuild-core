import 'dotenv/config'
import { Client, Events, GatewayIntentBits } from 'discord.js'
import { registerCommands } from './commands.js'
import { handleVerify } from './handlers/verify.js'
import { syncLinkedGuild } from './handlers/sync.js'
import { fetchDiscordRoleSyncIntervalMs, waitForSupabaseReady } from './api-client.js'
import {
  assertSupabaseEnvOrExit,
  getApiReadinessMaxWaitMs,
  getApiReadinessPollMs,
  getDiscordBotToken,
  getDiscordRoleSyncIntervalEnvRaw,
  getRoleSyncIntervalMsDefault,
  hasBotSecret,
} from './config.js'

const GUILD_SYNC_STAGGER_MS = 2_000

async function main(): Promise<void> {
  const discordToken = getDiscordBotToken()
  if (!discordToken) {
    console.error('Discord bot: set DISCORD_BOT_TOKEN on Railway, redeploy.')
    process.exit(1)
  }
  assertSupabaseEnvOrExit()
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  })

  let syncIntervalId: ReturnType<typeof setInterval> | null = null

  function clearSyncInterval(): void {
    if (syncIntervalId != null) {
      clearInterval(syncIntervalId)
      syncIntervalId = null
    }
  }

  const apiReadinessMaxWait = getApiReadinessMaxWaitMs()
  const apiReadinessPoll = getApiReadinessPollMs()

  client.once(Events.ClientReady, async () => {
    await registerCommands(client)
    if (!hasBotSecret()) return

    if (apiReadinessMaxWait > 0) {
      try {
        await waitForSupabaseReady({
          timeoutMs: apiReadinessMaxWait,
          intervalMs: apiReadinessPoll,
        })
      } catch (err) {
        console.error('Supabase did not become ready in time:', err)
      }
    }

    const guilds = [...client.guilds.cache.values()]
    for (let i = 0; i < guilds.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, GUILD_SYNC_STAGGER_MS))
      const guild = guilds[i]
      try {
        await syncLinkedGuild(guild)
      } catch (err) {
        console.error(`Sync failed for guild ${guild.name}:`, err)
      }
    }

    const defaultRoleSyncMs = getRoleSyncIntervalMsDefault()
    let roleSyncMs = defaultRoleSyncMs
    const rawIntervalEnv = getDiscordRoleSyncIntervalEnvRaw()
    if (rawIntervalEnv !== undefined && String(rawIntervalEnv).trim() !== '') {
      const n = Number(rawIntervalEnv)
      if (Number.isFinite(n) && n > 0) roleSyncMs = n
    } else {
      try {
        roleSyncMs = await fetchDiscordRoleSyncIntervalMs(defaultRoleSyncMs)
      } catch {
        /* keep defaultRoleSyncMs */
      }
    }

    syncIntervalId = setInterval(() => {
      if (!hasBotSecret()) return
      const guilds = [...client.guilds.cache.values()]
      guilds.forEach((guild, i) => {
        const delayMs = i * GUILD_SYNC_STAGGER_MS
        const run = () => syncLinkedGuild(guild).catch((err) => console.error(`Sync interval error ${guild.name}:`, err))
        if (delayMs === 0) run()
        else setTimeout(run, delayMs)
      })
    }, roleSyncMs)
  })

  client.on('guildCreate', async (guild) => {
    if (!hasBotSecret()) return
    try {
      await syncLinkedGuild(guild)
    } catch (err) {
      console.error(`Sync failed for guild ${guild.name}:`, err)
    }
  })

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return
    if (interaction.commandName === 'verify') {
      await handleVerify(interaction)
    }
  })

  process.on('SIGINT', () => {
    clearSyncInterval()
    client.destroy()
    process.exit(0)
  })
  process.on('SIGTERM', () => {
    clearSyncInterval()
    client.destroy()
    process.exit(0)
  })

  await client.login(discordToken)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
