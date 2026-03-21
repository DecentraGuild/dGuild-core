/**
 * Discord bot → Edge Function auth. Bot may send:
 * - x-bot-secret (preferred when DISCORD_BOT_SECRET is set on both sides), or
 * - Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY> (must match Edge env exactly).
 */
export function isBotAuthorized(req: Request): boolean {
  const botSecret = (Deno.env.get('DISCORD_BOT_SECRET') ?? '').trim()
  const xBot = (req.headers.get('x-bot-secret') ?? '').trim()
  const auth = (req.headers.get('authorization') ?? '').trim()

  if (botSecret) {
    if (xBot === botSecret) return true
    if (auth === botSecret) return true
    if (auth === `Bearer ${botSecret}`) return true
  }

  const serviceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
  if (!serviceKey) return false
  return auth === `Bearer ${serviceKey}`
}
