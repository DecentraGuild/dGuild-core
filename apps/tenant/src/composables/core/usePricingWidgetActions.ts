/**
 * Action logic for AdminPricingWidget: period toggle visibility, deploy/save labels, hint text.
 */
import type { Ref } from 'vue'
import { computed } from 'vue'
import type { BillingPeriod } from '@decentraguild/billing'
import type { ModuleState } from '@decentraguild/core'
import { formatUsdc } from '@decentraguild/display'

export interface UsePricingWidgetActionsOptions {
  moduleId: string
  moduleState: Ref<ModuleState>
  deploying: Ref<boolean>
  saving: Ref<boolean>
  chargeAmount: Ref<number>
  recurringDisplayTotal: Ref<number>
  selectedTier: Ref<{ name: string } | null>
  yearlyOnly?: boolean
  hasActiveSubscription: Ref<boolean>
  isAddUnit: Ref<boolean>
  isTieredWithOneTime: Ref<boolean>
  upgradeRecurringAmount: Ref<number>
  selectedPeriod: Ref<BillingPeriod>
  /** Lowercase marginal unit label from billing (e.g. "raffle", "token"). */
  marginalUnitLabel: Ref<string>
}

export function usePricingWidgetActions(options: UsePricingWidgetActionsOptions) {
  const {
    moduleId,
    moduleState,
    deploying,
    saving,
    chargeAmount,
    recurringDisplayTotal,
    selectedTier: _selectedTier,
    yearlyOnly = false,
    hasActiveSubscription,
    isAddUnit,
    isTieredWithOneTime,
    upgradeRecurringAmount,
    selectedPeriod,
    marginalUnitLabel,
  } = options

  const periodLocked = computed(() => hasActiveSubscription.value)

  const showPeriodToggle = computed(() => {
    if (periodLocked.value || yearlyOnly || isAddUnit.value) return false
    if (isTieredWithOneTime.value) {
      return upgradeRecurringAmount.value > 0 || chargeAmount.value > 0
    }
    return chargeAmount.value > 0 || recurringDisplayTotal.value > 0
  })

  const deployLabel = computed(() => {
    if (deploying.value) return moduleId === 'slug' ? 'Claiming...' : 'Deploying...'
    if (saving.value) return 'Saving...'
    if (moduleId === 'slug') {
      return chargeAmount.value > 0 ? `Claim for ${formatUsdc(chargeAmount.value)} USDC/yr` : 'Claim slug'
    }
    if (isTieredWithOneTime.value) {
      const r = upgradeRecurringAmount.value
      const u = chargeAmount.value
      const period = selectedPeriod.value === 'yearly' ? '/yr' : '/mo'
      const ul = marginalUnitLabel.value
      if (r > 0 && u > 0) {
        return `Deploy for ${formatUsdc(r)} USDC${period} + ${formatUsdc(u)} USDC per ${ul}`
      }
      if (r > 0) {
        return `Deploy for ${formatUsdc(r)} USDC${period}`
      }
      if (u > 0) {
        return `Deploy for ${formatUsdc(u)} USDC`
      }
      return 'Deploy'
    }
    if (chargeAmount.value > 0) {
      return `Deploy for ${formatUsdc(chargeAmount.value)} USDC`
    }
    return 'Deploy'
  })

  const saveButtonLabel = computed(() => {
    if (saving.value) return 'Saving...'
    if (upgradeRecurringAmount.value > 0) {
      return `Upgrade for ${formatUsdc(upgradeRecurringAmount.value)} USDC${selectedPeriod.value === 'yearly' ? '/yr' : '/mo'}`
    }
    return 'Save'
  })

  const hintText = computed(() => {
    if (moduleState.value === 'staging' && isAddUnit.value) {
      if (chargeAmount.value > 0) {
        return `Deploy to activate. Create lists from the form (${formatUsdc(chargeAmount.value)} USDC each).`
      }
      return 'Deploy to activate. Create lists from the form; your entitlements cover the next list at no extra charge.'
    }
    if (moduleState.value === 'staging') {
      return moduleId === 'slug'
        ? 'Enter your desired slug and click the check to verify availability, then pay here to claim.'
        : 'Configure the module, then deploy to make it active for members.'
    }
    if (moduleState.value === 'deactivating') {
      return 'Module is deactivating.'
    }
    if (moduleState.value === 'active' && (isAddUnit.value || isTieredWithOneTime.value)) {
      if (isTieredWithOneTime.value) {
        return null
      }
      return `Create new lists from the form above (${formatUsdc(chargeAmount.value)} USDC each).`
    }
    return null
  })

  return {
    showPeriodToggle,
    deployLabel,
    saveButtonLabel,
    hintText,
  }
}
