import { useSupabase } from '@decentraguild/nuxt-composables'

export async function assertPlatformOpsAccess(): Promise<boolean> {
  const supabase = useSupabase()
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) {
    await navigateTo('/ops/login', { replace: true })
    return false
  }
  const { data: wallet, error } = await supabase.rpc('check_platform_admin')
  if (error || !wallet) {
    await navigateTo('/ops/login', { replace: true })
    return false
  }
  return true
}
