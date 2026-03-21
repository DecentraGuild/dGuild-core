import { REST, Routes, SlashCommandBuilder, type Client } from 'discord.js'
import { getDiscordApplicationId, getDiscordBotToken } from './config.js'

export async function registerCommands(client: Client): Promise<void> {
  const token = getDiscordBotToken()
  if (!token) {
    console.error('Cannot register commands: bot token missing.')
    return
  }
  const rest = new REST().setToken(token)
  const commands = [
    new SlashCommandBuilder()
      .setName('verify')
      .setDescription('Link your Solana wallet to your Discord account for role verification')
      .toJSON(),
  ]
  let appId = client.application?.id ?? getDiscordApplicationId()
  if (!appId && client.application) {
    const app = await client.application.fetch()
    appId = app.id
  }
  if (!appId) {
    console.error('Cannot register commands: application id not available. Set the Discord application id env var.')
    return
  }
  await rest.put(Routes.applicationCommands(appId), { body: commands })
}
