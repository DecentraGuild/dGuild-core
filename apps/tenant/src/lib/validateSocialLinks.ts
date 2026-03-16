export interface ValidationResult {
  valid: boolean
  error?: string
}

const DISCORD_PATTERN = /^https?:\/\/(discord\.gg|discord\.com\/invite)\/[a-zA-Z0-9]+$/
const X_PATTERN = /^https?:\/\/(x\.com|twitter\.com)\/[a-zA-Z0-9_]+(\/?)$/
const TELEGRAM_PATTERN = /^https?:\/\/(t\.me|telegram\.me)\/[a-zA-Z0-9_]+(\/?)$/
const HOMEPAGE_PATTERN = /^https?:\/\/.+\..+/

export function validateDiscordLink(value: string): ValidationResult {
  if (!value.trim()) return { valid: true }
  if (!DISCORD_PATTERN.test(value.trim())) {
    return { valid: false, error: 'Use a Discord invite link (e.g. https://discord.gg/abc123)' }
  }
  return { valid: true }
}

export function validateXLink(value: string): ValidationResult {
  if (!value.trim()) return { valid: true }
  if (!X_PATTERN.test(value.trim())) {
    return { valid: false, error: 'Use an X/Twitter profile URL (e.g. https://x.com/username)' }
  }
  return { valid: true }
}

export function validateTelegramLink(value: string): ValidationResult {
  if (!value.trim()) return { valid: true }
  if (!TELEGRAM_PATTERN.test(value.trim())) {
    return { valid: false, error: 'Use a Telegram channel/group URL (e.g. https://t.me/channel)' }
  }
  return { valid: true }
}

export function validateHomepage(value: string): ValidationResult {
  if (!value.trim()) return { valid: true }
  if (!HOMEPAGE_PATTERN.test(value.trim())) {
    return { valid: false, error: 'Enter a valid URL (e.g. https://example.com)' }
  }
  return { valid: true }
}
