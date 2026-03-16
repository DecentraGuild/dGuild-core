/**
 * Legacy types for backward compatibility during v2 adoption.
 * Used by AdminPricingWidget, usePricingDisplay, etc.
 */
export type BillingPeriod = 'monthly' | 'yearly'

export type ConditionSet = Record<string, number | boolean>

export interface PriceComponent {
  type: 'one-time' | 'recurring'
  name: string
  quantity: number
  unitPrice: number
  amount: number
}

export interface PriceResult {
  moduleId: string
  billable: boolean
  components: PriceComponent[]
  oneTimeTotal: number
  recurringMonthly: number
  recurringYearly: number
  appliedYearlyDiscount: number | null
  selectedTierId: string | null
  oneTimePerUnitForSelectedTier?: number
  oneTimeUnitName?: string
}

export interface TierDefinition {
  id: string
  name: string
  recurringPrice: number
  included: Record<string, number | boolean>
  features?: string[]
  oneTimePerUnit?: number
}

export interface TieredAddonsPricing {
  modelType: 'tiered_addons'
  tiers: TierDefinition[]
  addons: Array<{ conditionKey: string; name: string; unitSize: number; recurringPricePerUnit: number }>
  yearlyDiscountPercent: number
  conditionKeys: string[]
}

export interface TieredWithOneTimePerUnitPricing {
  modelType: 'tiered_with_one_time_per_unit'
  conditionKeys: string[]
  tiers: TierDefinition[]
  addons: Array<{ conditionKey: string; name: string; unitSize: number; recurringPricePerUnit: number }>
  yearlyDiscountPercent: number
  oneTimeUnitName?: string
}
