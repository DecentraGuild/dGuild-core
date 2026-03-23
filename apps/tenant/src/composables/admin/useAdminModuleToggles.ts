import type { BillingPeriod } from '@decentraguild/billing'
import { getModuleCatalogEntry } from '@decentraguild/catalog'
import type { useAdminSubscriptions, SubscriptionInfo, WatchtowerSubscriptionByScope } from './useAdminSubscriptions'
import type { useAdminForm } from './useAdminForm'
import type { useAdminBilling } from './useAdminBilling'

type SubscriptionsMap = ReturnType<typeof useAdminSubscriptions>['subscriptions']
type FormRef = ReturnType<typeof useAdminForm>
type BillingRef = ReturnType<typeof useAdminBilling>

interface Options {
  subscriptions: SubscriptionsMap
  save: FormRef['save']
  form: FormRef['form']
  handleBillingPayment: BillingRef['handleBillingPayment']
  fetchSubscription: ReturnType<typeof useAdminSubscriptions>['fetchSubscription']
  extendModule: BillingRef['extendModule']
  reactivateModule: BillingRef['reactivateModule']
  deploying: Ref<boolean>
  extending: Ref<boolean>
  saving: Ref<boolean>
  saveError: Ref<string | null>
}

export function useAdminModuleToggles(opts: Options) {
  const {
    subscriptions, save, form, handleBillingPayment, fetchSubscription,
    extendModule, reactivateModule, deploying, extending, saving, saveError,
  } = opts

  const showActivationModal = ref(false)
  const activationModalModuleId = ref<string | null>(null)
  const showDeactivateConfirm = ref(false)
  const pendingDeactivateModuleId = ref<string | null>(null)
  const extendingModuleId = ref<string | null>(null)
  const extendPeriod = ref<BillingPeriod>('monthly')

  function getSubscriptionPeriodEnd(moduleId: string): string | null {
    const s = subscriptions[moduleId]
    if (!s) return null
    if (typeof (s as SubscriptionInfo).periodEnd === 'string') return (s as SubscriptionInfo).periodEnd
    const byScope = s as WatchtowerSubscriptionByScope
    const ends = Object.values(byScope).map((x) => x.periodEnd).filter(Boolean) as string[]
    if (ends.length === 0) return null
    return ends.reduce((a, b) => (a < b ? a : b))
  }

  function isWithinPaidPeriod(moduleId: string): boolean {
    const periodEnd = getSubscriptionPeriodEnd(moduleId)
    if (!periodEnd) return false
    try { return new Date(periodEnd) > new Date() } catch { return false }
  }

  function formatDeactivationDate(iso: string): string {
    try {
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return iso
      return date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
    } catch { return iso }
  }

  function onModuleToggle(id: string, on: boolean) {
    if (on) {
      const entry = getModuleCatalogEntry(id)
      if (entry?.pricing && isWithinPaidPeriod(id)) {
        form.modulesById[id] = 'active'
        save()
      } else {
        activationModalModuleId.value = id
        showActivationModal.value = true
      }
    } else {
      const current = form.modulesById[id] ?? 'off'
      if (current === 'staging' || current === 'active') {
        pendingDeactivateModuleId.value = id
        showDeactivateConfirm.value = true
      }
    }
  }

  async function confirmDeactivate() {
    const id = pendingDeactivateModuleId.value
    if (id) {
      form.modulesById[id] = isWithinPaidPeriod(id) ? 'deactivating' : 'off'
      await save()
    }
    pendingDeactivateModuleId.value = null
    showDeactivateConfirm.value = false
  }

  function cancelDeactivate() {
    pendingDeactivateModuleId.value = null
    showDeactivateConfirm.value = false
  }

  function onActivationModalClose(open: boolean) {
    if (!open && activationModalModuleId.value) {
      form.modulesById[activationModalModuleId.value] = 'off'
    }
    showActivationModal.value = open
    if (!open) activationModalModuleId.value = null
  }

  async function confirmModuleActivate() {
    const id = activationModalModuleId.value
    if (!id) return
    const entry = getModuleCatalogEntry(id)
    if (isWithinPaidPeriod(id)) {
      form.modulesById[id] = 'active'
    } else {
      form.modulesById[id] = entry?.goActiveImmediately === true ? 'active' : 'staging'
    }
    showActivationModal.value = false
    activationModalModuleId.value = null
    await save()
  }

  function startExtend(moduleId: string) {
    extendingModuleId.value = moduleId
    extendPeriod.value = 'monthly'
  }

  async function confirmExtend(moduleId: string) {
    extending.value = true
    try { await extendModule(moduleId, extendPeriod.value) }
    finally { extending.value = false }
    extendingModuleId.value = null
  }

  function cancelExtend() {
    extendingModuleId.value = null
    extendPeriod.value = 'monthly'
  }

  function setExtendPeriod(v: BillingPeriod) {
    extendPeriod.value = v
  }

  async function handleRaffleBilling(
    period: BillingPeriod,
    conditions: Record<string, number> | undefined,
    clearRaffleFn: (() => void) | undefined,
  ) {
    deploying.value = true
    saveError.value = null
    try {
      await handleBillingPayment('raffles', period, undefined, conditions)
      await fetchSubscription('raffles')
      clearRaffleFn?.()
    } catch (e) {
      saveError.value = e instanceof Error ? e.message : 'Billing failed'
    } finally { deploying.value = false }
  }

  async function handleWatchtowerSave(
    period: BillingPeriod,
    conditions: Record<string, number> | undefined,
    saveWatchesFn: (() => Promise<boolean | undefined>) | undefined,
  ) {
    saving.value = true
    deploying.value = true
    saveError.value = null
    try {
      await handleBillingPayment('watchtower', period, undefined, conditions)
      const ok = await saveWatchesFn?.()
      if (!ok) { saveError.value = 'Failed to save watchtower settings'; return }
      await fetchSubscription('watchtower')
    } catch (e) {
      saveError.value = e instanceof Error ? e.message : 'Billing failed'
    } finally { saving.value = false; deploying.value = false }
  }

  async function handleReactivate(moduleId: string, period: BillingPeriod) {
    if (isWithinPaidPeriod(moduleId)) {
      form.modulesById[moduleId] = 'active'
      await save()
      await fetchSubscription(moduleId)
    } else {
      await reactivateModule(moduleId, period)
      await fetchSubscription(moduleId)
    }
  }

  return {
    showActivationModal, activationModalModuleId,
    showDeactivateConfirm, pendingDeactivateModuleId,
    extendingModuleId, extendPeriod,
    getSubscriptionPeriodEnd, isWithinPaidPeriod, formatDeactivationDate,
    onModuleToggle, confirmDeactivate, cancelDeactivate,
    onActivationModalClose, confirmModuleActivate,
    startExtend, confirmExtend, cancelExtend, setExtendPeriod,
    handleRaffleBilling, handleWatchtowerSave, handleReactivate,
  }
}
