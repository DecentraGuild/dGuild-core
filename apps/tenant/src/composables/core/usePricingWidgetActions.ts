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
  selectedTier: Ref<{ name: string } | null>
  yearlyOnly?: boolean
  hasActiveSubscription: Ref<boolean>
  isAddUnit: Ref<boolean>
  isTieredWithOneTime: Ref<boolean>
  upgradeRecurringAmount: Ref<number>
  selectedPeriod: Ref<BillingPeriod>
}

export function usePricingWidgetActions(options: UsePricingWidgetActionsOptions) {
  const {
    moduleId,
    moduleState,
    deploying,
    saving,
    chargeAmount,
    selectedTier,
    yearlyOnly = false,
    hasActiveSubscription,
    isAddUnit,
    isTieredWithOneTime,
    upgradeRecurringAmount,
    selectedPeriod,
  } = options

  const periodLocked = computed(() => hasActiveSubscription.value)

  const showPeriodToggle = computed(() =>
    chargeAmount.value > 0 &&
    !periodLocked.value &&
    !yearlyOnly &&
    !isAddUnit.value &&
    !isTieredWithOneTime.value,
  )

  const deployLabel = computed(() => {
    if (deploying.value) return moduleId === 'slug' ? 'Claiming...' : 'Deploying...'
    if (moduleId === 'slug') {
      return chargeAmount.value > 0 ? `Claim for ${formatUsdc(chargeAmount.value)} USDC/yr` : 'Claim slug'
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
      return 'Deploy to activate. Create lists from the form (25 USDC each).'
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
      return isTieredWithOneTime.value
        ? `Create raffles from the form above (${formatUsdc(chargeAmount.value)} USDC each on ${selectedTier.value?.name ?? 'current'} tier).`
        : `Create new lists from the form above (${formatUsdc(chargeAmount.value)} USDC each).`
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
