/**
 * CORS headers for Edge Function responses.
 * Supabase Edge Functions require explicit CORS handling for browser clients.
 */

const DEFAULT_ORIGINS = 'https://dguild.org,https://dapp.dguild.org'

const ALLOWED_ORIGINS = (
  Deno.env.get('CORS_ALLOWED_ORIGINS') ?? DEFAULT_ORIGINS
).split(',').map(o => o.trim()).filter(Boolean)

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const isAllowed =
    ALLOWED_ORIGINS.includes(origin) ||
    /^https:\/\/[a-z0-9-]+\.dguild\.org$/.test(origin) ||
    origin.includes('localhost')

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  }
}

export function handlePreflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null
  return new Response(null, { status: 204, headers: getCorsHeaders(req) })
}

export function jsonResponse(
  data: unknown,
  req: Request,
  status = 200,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
  })
}

export function errorResponse(
  message: string,
  req: Request,
  status = 400,
  code?: string,
): Response {
  const body = code ? { error: message, code } : { error: message }
  return jsonResponse(body, req, status)
}
