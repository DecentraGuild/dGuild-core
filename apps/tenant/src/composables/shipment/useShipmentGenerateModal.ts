import { useConditionSetCatalog } from '~/composables/conditions/useConditionSetCatalog'
import { useShipmentJsonGenerator } from '~/composables/shipment/useShipmentJsonGenerator'
import type { CatalogMint } from '~/types/mints'

export function useShipmentGenerateModal(
  tenantId: Ref<string | null | undefined>,
  onGenerated: (json: unknown) => void,
) {
  const { generate: generateShipmentJson } = useShipmentJsonGenerator()

  const catalogMintsRef = ref<CatalogMint[]>([])
  const gateListsRef = ref<Array<{ address: string; name: string }>>([])

  const {
    filteredItems: rulesCatalogFilteredItems,
    filter: rulesCatalogFilter,
    setFilter: setRulesCatalogFilter,
    loading: rulesCatalogLoading,
    error: rulesCatalogError,
    fetchCatalog: fetchRulesCatalog,
  } = useConditionSetCatalog({ catalogMints: catalogMintsRef, gateLists: gateListsRef })

  const open = ref(false)
  const addressBookModalOpen = ref(false)
  const generateRuleId = ref<number | null>(null)
  const generateFixedAmountStr = ref('100')
  const generateTotalAmountStr = ref('10000')
  const generateMint = ref('')
  const generating = ref(false)
  let generationEpoch = 0

  const rulesCatalogItems = computed(() => rulesCatalogFilteredItems.value)

  const selectedRule = computed(() =>
    rulesCatalogItems.value.find((r) => r.id === generateRuleId.value),
  )

  const isWeightedRule = computed(() => selectedRule.value?.ruleType === 'weighted')

  const generateFixedAmount = computed(() => {
    const n = Number.parseInt(generateFixedAmountStr.value, 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  })

  const generateTotalAmount = computed(() => {
    const n = Number.parseInt(generateTotalAmountStr.value, 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  })

  const canGenerate = computed(() => {
    const amountOk = isWeightedRule.value
      ? generateTotalAmount.value >= 0
      : generateFixedAmount.value >= 0
    return !!(
      tenantId.value &&
      generateRuleId.value != null &&
      generateRuleId.value > 0 &&
      generateMint.value.trim().length >= 32 &&
      amountOk
    )
  })

  function openModal() {
    generateRuleId.value = null
    generateFixedAmountStr.value = '100'
    generateTotalAmountStr.value = '10000'
    generateMint.value = ''
    open.value = true
    fetchRulesCatalog()
  }

  function closeModal() {
    generationEpoch++
    generating.value = false
    open.value = false
  }

  function setGenerateMint(m: string) {
    generateMint.value = m
  }

  async function generateJson() {
    const id = tenantId.value
    if (!id || !canGenerate.value) return
    const epoch = generationEpoch
    generating.value = true
    try {
      const generated = await generateShipmentJson({
        tenantId: id,
        conditionSetId: generateRuleId.value!,
        mint: generateMint.value.trim(),
        fixedAmount: generateFixedAmount.value,
        totalAmount: generateTotalAmount.value,
        isWeighted: isWeightedRule.value,
      })
      if (epoch !== generationEpoch) return
      if (generated) {
        onGenerated(generated)
        open.value = false
      }
    } catch (e) {
      if (epoch !== generationEpoch) return
      alert(e instanceof Error ? e.message : 'Failed to generate JSON')
    } finally {
      if (epoch === generationEpoch) generating.value = false
    }
  }

  return {
    open,
    addressBookModalOpen,
    generateRuleId,
    generateFixedAmountStr,
    generateTotalAmountStr,
    generateMint,
    generating,
    rulesCatalogFilteredItems,
    rulesCatalogFilter,
    setRulesCatalogFilter,
    rulesCatalogLoading,
    rulesCatalogError,
    isWeightedRule,
    canGenerate,
    openModal,
    closeModal,
    setGenerateMint,
    generateJson,
  }
}
