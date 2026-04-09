import { useAuth } from '@decentraguild/auth'
import { useSupabase } from '@decentraguild/nuxt-composables'
import { getConnectorState } from '@decentraguild/web3/wallet'

function sameSolanaAddress(a: string, b: string): boolean {
  return a.trim() === b.trim()
}

async function waitForConnectorAccount(expected: string, maxMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    const s = getConnectorState()
    if (s.connected && s.account && sameSolanaAddress(s.account, expected)) return true
    await new Promise((r) => setTimeout(r, 50))
  }
  return false
}

export async function assertPlatformOpsAccess(): Promise<boolean> {
  const supabase = useSupabase()
  const auth = useAuth()

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) {
    await navigateTo('/ops/login', { replace: true })
    return false
  }

  const { data: adminWallet, error: rpcErr } = await supabase.rpc('check_platform_admin')
  if (rpcErr || !adminWallet || typeof adminWallet !== 'string') {
    await navigateTo('/ops/login', { replace: true })
    return false
  }

  await auth.fetchMe()
  auth.refreshConnectorState()

  const connectorOk = await waitForConnectorAccount(adminWallet, 5000)
  if (!connectorOk) {
    await navigateTo('/ops/login', { replace: true })
    return false
  }

  return true
}
