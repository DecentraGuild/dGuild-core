/**
 * Invoke a Supabase Edge Function and throw on `error` so callers use one pattern.
 */

/** Best-effort message from `functions.invoke` error (JSON body `error`, then `message`). */
export function messageFromSupabaseInvokeError(
  error: { message?: string; context?: { body?: string } } | null | undefined,
  fallback: string,
): string {
  if (!error) return fallback
  const body = error.context?.body
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body) as { error?: string }
      if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error
    } catch {
      /* ignore */
    }
  }
  if (typeof error.message === 'string' && error.message.trim()) return error.message
  return fallback
}

export type EdgeInvokeOptions = {
  /** Passed through to `functions.invoke` (e.g. `Authorization` for JWT). */
  headers?: Record<string, string>
  /** Used when the invoke fails and the response has no clearer message. */
  errorFallback?: string
}

type InvokeErrorShape = {
  message?: string
  context?: { body?: string; text?: () => Promise<string> }
} | null

export type EdgeInvokeClient = {
  functions: {
    invoke: (
      name: string,
      options: { body?: Record<string, unknown>; headers?: Record<string, string> },
    ) => Promise<{ data: unknown; error: InvokeErrorShape }>
  }
}

async function messageFromSupabaseInvokeErrorAsync(
  error: InvokeErrorShape,
  fallback: string,
): Promise<string> {
  if (!error) return fallback
  const ctx = error.context
  if (ctx && typeof ctx.text === 'function') {
    try {
      const text = await ctx.text()
      const parsed = JSON.parse(text) as { error?: string }
      if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error
    } catch {
      /* ignore */
    }
  }
  return messageFromSupabaseInvokeError(error, fallback)
}

export async function invokeEdgeFunction<T = unknown>(
  client: EdgeInvokeClient,
  functionName: string,
  body: Record<string, unknown>,
  invokeOptions?: EdgeInvokeOptions,
): Promise<T> {
  const { data, error } = await client.functions.invoke(functionName, {
    body,
    ...(invokeOptions?.headers ? { headers: invokeOptions.headers } : {}),
  })
  if (error) {
    const fb = invokeOptions?.errorFallback ?? 'Edge function failed'
    throw new Error(await messageFromSupabaseInvokeErrorAsync(error, fb))
  }
  return data as T
}
