<template>
  <div class="theme-settings">
    <div class="theme-settings__form">
      <details class="theme-settings__section" open>
        <summary class="theme-settings__heading">Colors</summary>
        <p class="theme-settings__hint">
          Core colours used across the app. All shades and variants are derived automatically.
        </p>
        <div class="theme-settings__grid theme-settings__grid--two">
          <div class="theme-settings__group">
            <h4 class="theme-settings__sub">Core</h4>
            <ColorInput v-model="inputs.primary" label="Primary (buttons, links)" @update:model-value="apply" />
            <ColorInput v-model="inputs.background" label="Background (page)" @update:model-value="apply" />
            <ColorInput v-model="inputs.text" label="Text" @update:model-value="apply" />
            <ColorInput v-model="inputs.textMuted" label="Text muted (leave empty to derive)" @update:model-value="apply" />
            <ColorInput v-model="inputs.border" label="Border (leave empty to derive)" @update:model-value="apply" />
          </div>
          <div class="theme-settings__group">
            <h4 class="theme-settings__sub">Status</h4>
            <ColorInput v-model="statusSuccess" label="Success" @update:model-value="applyStatus" />
            <ColorInput v-model="statusError" label="Error" @update:model-value="applyStatus" />
            <ColorInput v-model="statusWarning" label="Warning" @update:model-value="applyStatus" />
            <ColorInput v-model="statusInfo" label="Info" @update:model-value="applyStatus" />
          </div>
          <div class="theme-settings__group">
            <h4 class="theme-settings__sub">Trade (marketplace)</h4>
            <ColorInput v-model="tradeBuy" label="Buy" @update:model-value="applyTrade" />
            <ColorInput v-model="tradeSell" label="Sell" @update:model-value="applyTrade" />
            <ColorInput v-model="tradeTrade" label="Trade" @update:model-value="applyTrade" />
          </div>
        </div>
      </details>

      <details class="theme-settings__section">
        <summary class="theme-settings__heading">Typography</summary>
        <p class="theme-settings__hint">Font family and size scale: small (labels), body (main text), heading (titles).</p>
        <div class="theme-settings__group">
          <Select v-model="fontFamilyId" label="Font" :options="FONT_OPTIONS" @update:model-value="applyFont" />
        </div>
        <div class="theme-settings__typography-row">
          <TextInput v-model="typographySmall" label="Small (rem)" placeholder="0.875" @update:model-value="applyTypography" />
          <TextInput v-model="typographyBody" label="Body (rem)" placeholder="1" @update:model-value="applyTypography" />
          <TextInput v-model="typographyHeading" label="Heading (rem)" placeholder="1.25" @update:model-value="applyTypography" />
        </div>
      </details>

      <details class="theme-settings__section">
        <summary class="theme-settings__heading">Spacing &amp; rounding</summary>
        <p class="theme-settings__hint">
          Corner radius, spacing scale, and border width. One value controls each.
        </p>

        <h4 class="theme-settings__sub">Corner radius</h4>
        <div class="theme-settings__slider-row">
          <label class="theme-settings__slider-label" :for="sliderId">Sharp</label>
          <input
            :id="sliderId"
            v-model.number="inputs.radiusLevel"
            type="range"
            min="0"
            max="4"
            step="1"
            class="theme-settings__slider"
            @input="apply"
          />
          <label class="theme-settings__slider-label">Round</label>
          <span class="theme-settings__slider-value">{{ radiusLabels[inputs.radiusLevel ?? 3] }}</span>
        </div>

        <h4 class="theme-settings__sub">Spacing</h4>
        <div class="theme-settings__slider-row">
          <label :for="spacingSliderId" class="theme-settings__slider-label">Tight</label>
          <input
            :id="spacingSliderId"
            v-model.number="inputs.spacingLevel"
            type="range"
            min="0"
            max="10"
            step="1"
            class="theme-settings__slider"
            @input="apply"
          />
          <label class="theme-settings__slider-label">Loose</label>
          <span class="theme-settings__slider-value">{{ spacingBaseLabel }} base</span>
        </div>

        <h4 class="theme-settings__sub">Border width (px)</h4>
        <div class="theme-settings__slider-row">
          <label :for="borderSliderId" class="theme-settings__slider-label">1px</label>
          <input
            :id="borderSliderId"
            v-model.number="inputs.borderWidthPx"
            type="range"
            min="1"
            max="10"
            step="1"
            class="theme-settings__slider"
            @input="apply"
          />
          <label class="theme-settings__slider-label">10px</label>
          <span class="theme-settings__slider-value">{{ inputs.borderWidthPx ?? 1 }}px</span>
        </div>
      </details>

      <details class="theme-settings__section">
        <summary class="theme-settings__heading">Effects</summary>
        <p class="theme-settings__hint">
          Optional visual enhancements. Patterns and glow intensity are purely aesthetic and do not
          affect functionality.
        </p>
        <div class="theme-settings__grid theme-settings__grid--two">
          <div class="theme-settings__group">
            <Select v-model="effectPattern" label="Background pattern" :options="PATTERN_OPTIONS" @update:model-value="applyEffects" />
          </div>
          <div class="theme-settings__group">
            <Select v-model="effectGlow" label="Glow intensity" :options="GLOW_OPTIONS" @update:model-value="applyEffects" />
          </div>
        </div>

        <template v-if="effectPattern !== 'none'">
          <h4 class="theme-settings__sub">Pattern size</h4>
          <div class="theme-settings__slider-row">
            <label :for="patternSizeId" class="theme-settings__slider-label">Fine</label>
            <input
              :id="patternSizeId"
              v-model.number="effectPatternSize"
              type="range"
              min="4"
              max="64"
              step="2"
              class="theme-settings__slider"
              @input="applyEffects"
            />
            <label class="theme-settings__slider-label">Coarse</label>
            <span class="theme-settings__slider-value">{{ effectPatternSize }}px</span>
          </div>
        </template>
      </details>
    </div>

    <aside class="theme-settings__preview" :style="previewStyle">
      <p class="theme-settings__preview-label">Preview</p>
      <div class="theme-settings__preview-content">
        <div class="theme-settings__preview-buttons">
          <button type="button" class="theme-settings__btn theme-settings__btn--primary">
            Primary
          </button>
          <button type="button" class="theme-settings__btn theme-settings__btn--secondary">
            Secondary
          </button>
        </div>
        <div class="theme-settings__preview-card">
          <p class="theme-settings__preview-title">Card title</p>
          <p class="theme-settings__preview-body">Body text and secondary text.</p>
          <p class="theme-settings__preview-muted">Muted caption</p>
        </div>
        <div class="theme-settings__preview-status">
          <span class="theme-settings__pill theme-settings__pill--success">Success</span>
          <span class="theme-settings__pill theme-settings__pill--error">Error</span>
          <span class="theme-settings__pill theme-settings__pill--warning">Warning</span>
          <span class="theme-settings__pill theme-settings__pill--info">Info</span>
        </div>
        <div class="theme-settings__preview-trade">
          <span class="theme-settings__chip theme-settings__chip--buy">Buy</span>
          <span class="theme-settings__chip theme-settings__chip--sell">Sell</span>
          <span class="theme-settings__chip theme-settings__chip--trade">Trade</span>
        </div>
        <div class="theme-settings__preview-glow">
          <button type="button" class="theme-settings__btn--glow">Glow button</button>
        </div>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { TextInput, ColorInput, Select } from '@decentraguild/ui/components'
import { themeToCssVars, deriveTheme, themeToInputs, parseRem } from '@decentraguild/ui'
import type { TenantTheme } from '@decentraguild/core'

const props = defineProps<{
  branding: {
    logo: string
    theme: TenantTheme
  }
}>()

const sliderId = `radius-slider-${Math.random().toString(36).slice(2)}`
const spacingSliderId = `spacing-slider-${Math.random().toString(36).slice(2)}`
const borderSliderId = `border-slider-${Math.random().toString(36).slice(2)}`
const patternSizeId = `pattern-size-slider-${Math.random().toString(36).slice(2)}`

const radiusLabels = ['None', 'Slight', 'Medium', 'Rounded', 'Full']

const FONT_OPTIONS: { value: string; label: string }[] = [
  { value: 'inter', label: 'Inter' },
  { value: 'system', label: 'System' },
  { value: 'roboto', label: 'Roboto' },
  { value: 'open-sans', label: 'Open Sans' },
  { value: 'dm-sans', label: 'DM Sans' },
]

const FONT_STACKS: Record<string, string[]> = {
  inter: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
  system: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
  roboto: ['Roboto', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
  'open-sans': ['Open Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
  'dm-sans': ['DM Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
}

const DEFAULT_MONO = ['JetBrains Mono', 'Fira Code', 'monospace']

const PATTERN_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'dots', label: 'Dots' },
  { value: 'grid', label: 'Grid' },
  { value: 'noise', label: 'Noise' },
]

const GLOW_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'subtle', label: 'Subtle' },
  { value: 'medium', label: 'Medium' },
  { value: 'strong', label: 'Strong' },
]

function fontStackToId(stack: string[] | undefined): string {
  const first = (stack?.[0] ?? '').toLowerCase()
  if (first.startsWith('system')) return 'system'
  if (first.startsWith('roboto')) return 'roboto'
  if (first.startsWith('open')) return 'open-sans'
  if (first.startsWith('dm')) return 'dm-sans'
  return 'inter'
}

// Derived inputs synced from the stored theme
const inputs = reactive({
  primary: '#00951a',
  background: '#0a0a0f',
  text: '#ffffff',
  textMuted: '',
  border: '',
  radiusLevel: 3,
  spacingLevel: 5,
  borderWidthPx: 1,
})

// Status and trade as flat refs (optional overrides)
const statusSuccess = ref('')
const statusError = ref('')
const statusWarning = ref('')
const statusInfo = ref('')
const tradeBuy = ref('')
const tradeSell = ref('')
const tradeTrade = ref('')

const fontFamilyId = ref('inter')
const typographySmall = ref('0.875')
const typographyBody = ref('1')
const typographyHeading = ref('1.25')

const effectPattern = ref<'none' | 'dots' | 'grid' | 'noise'>('none')
const effectPatternSize = ref(24)
const effectGlow = ref<'none' | 'subtle' | 'medium' | 'strong'>('subtle')

const spacingBaseLabel = computed(() => {
  const base = 0.5 + ((inputs.spacingLevel ?? 5) / 10) * 1.5
  return `${base.toFixed(2)}rem`
})

function syncFromTheme() {
  const extracted = themeToInputs(props.branding.theme)
  inputs.primary = extracted.primary
  inputs.background = extracted.background
  inputs.text = extracted.text
  inputs.textMuted = extracted.textMuted ?? ''
  inputs.border = extracted.border ?? ''
  inputs.radiusLevel = extracted.radiusLevel ?? 3
  inputs.spacingLevel = extracted.spacingLevel ?? 5
  inputs.borderWidthPx = extracted.borderWidthPx ?? 1

  const c = props.branding.theme.colors ?? {}
  statusSuccess.value = c.status?.success ?? ''
  statusError.value = c.status?.error ?? ''
  statusWarning.value = c.status?.warning ?? ''
  statusInfo.value = c.status?.info ?? ''
  tradeBuy.value = c.trade?.buy ?? ''
  tradeSell.value = c.trade?.sell ?? ''
  tradeTrade.value = c.trade?.trade ?? ''

  fontFamilyId.value = fontStackToId(props.branding.theme.fonts?.primary)

  const fs = props.branding.theme.fontSize ?? {}
  typographySmall.value = String(parseRem(fs.sm ?? '0.875rem'))
  typographyBody.value = String(parseRem(fs.base ?? '1rem'))
  typographyHeading.value = String(parseRem(fs.lg ?? '1.125rem'))

  const effects = props.branding.theme.effects ?? {}
  effectPattern.value = (effects.pattern ?? 'none') as typeof effectPattern.value
  effectPatternSize.value = effects.patternSize ?? 24
  effectGlow.value = (effects.glowIntensity ?? 'subtle') as typeof effectGlow.value
}

function buildTheme(): TenantTheme {
  const derived = deriveTheme({
    primary: inputs.primary,
    background: inputs.background,
    text: inputs.text,
    textMuted: inputs.textMuted || undefined,
    border: inputs.border || undefined,
    status: {
      success: statusSuccess.value || undefined,
      error: statusError.value || undefined,
      warning: statusWarning.value || undefined,
      info: statusInfo.value || undefined,
    },
    trade: {
      buy: tradeBuy.value || undefined,
      sell: tradeSell.value || undefined,
      trade: tradeTrade.value || undefined,
    },
    radiusLevel: inputs.radiusLevel,
    spacingLevel: inputs.spacingLevel,
    borderWidthPx: inputs.borderWidthPx,
    fontPrimary: FONT_STACKS[fontFamilyId.value] ?? FONT_STACKS.inter,
    fontMono: props.branding.theme.fonts?.mono ?? DEFAULT_MONO,
  })

  // Apply typography overrides if user changed them manually
  const small = parseFloat(typographySmall.value) || 0.875
  const body = parseFloat(typographyBody.value) || 1
  const heading = parseFloat(typographyHeading.value) || 1.25
  const r = (v: number) => `${v}rem`
  derived.fontSize = {
    xs: r(small * 0.9),
    sm: r(small),
    base: r(body),
    lg: r(heading),
    xl: r(heading * 1.1),
    '2xl': r(heading * 1.25),
    '3xl': r(heading * 1.5),
    '4xl': r(heading * 1.75),
    '5xl': r(heading * 2),
  }

  derived.effects = {
    pattern: effectPattern.value,
    patternSize: effectPatternSize.value,
    glowIntensity: effectGlow.value,
  }

  return derived
}

function apply() {
  const theme = buildTheme()
  Object.assign(props.branding.theme, theme)
}

function applyStatus() { apply() }
function applyTrade() { apply() }
function applyFont() { apply() }
function applyTypography() { apply() }
function applyEffects() { apply() }

let isSyncing = false
watch(
  () => props.branding,
  async () => {
    isSyncing = true
    syncFromTheme()
    await nextTick()
    isSyncing = false
  },
  { immediate: true, deep: false },
)

const previewStyle = computed(() => {
  const vars = themeToCssVars(props.branding.theme)
  const style: Record<string, string> = {}
  for (const [key, value] of Object.entries(vars)) {
    if (value) style[key] = value
  }
  return style
})
</script>

<style scoped>
.theme-settings {
  display: grid;
  gap: var(--theme-space-xl);
}

@media (min-width: var(--theme-breakpoint-lg)) {
  .theme-settings {
    grid-template-columns: 1fr minmax(280px, 360px);
  }
  .theme-settings__preview {
    position: sticky;
    top: var(--theme-space-lg);
    align-self: start;
  }
}

.theme-settings__form {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}

.theme-settings__section {
  padding: var(--theme-space-md);
  background: var(--theme-bg-secondary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
}

.theme-settings__section > summary {
  list-style: none;
  cursor: pointer;
}

.theme-settings__section > summary::-webkit-details-marker {
  display: none;
}

.theme-settings__heading {
  font-size: var(--theme-font-lg);
  margin: 0 0 var(--theme-space-sm);
  color: var(--theme-text-primary);
}

.theme-settings__section[open] .theme-settings__heading {
  margin-bottom: var(--theme-space-md);
}

.theme-settings__hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin: 0 0 var(--theme-space-md);
}

.theme-settings__sub {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  margin: 0 0 var(--theme-space-xs);
}

.theme-settings__grid {
  display: grid;
  gap: var(--theme-space-md);
  margin-bottom: var(--theme-space-md);
}

.theme-settings__grid:last-child {
  margin-bottom: 0;
}

.theme-settings__grid--two {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}

.theme-settings__group {
  margin-bottom: var(--theme-space-md);
}

.theme-settings__group .color-input,
.theme-settings__group .text-input {
  margin-bottom: var(--theme-space-sm);
}

.theme-settings__typography-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--theme-space-md);
}

.theme-settings__slider-row {
  display: flex;
  align-items: center;
  gap: var(--theme-space-md);
  margin-bottom: var(--theme-space-xs);
}

.theme-settings__slider-label {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  flex-shrink: 0;
}

.theme-settings__slider {
  flex: 1;
  min-width: 0;
  height: 0.5rem;
  accent-color: var(--theme-primary);
}

.theme-settings__slider-value {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin: 0;
  min-width: 3rem;
  text-align: right;
}

.theme-settings__preview {
  padding: var(--theme-space-lg);
  background: var(--theme-bg-primary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  box-shadow: var(--theme-shadow-card);
}

.theme-settings__preview-label {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin: 0 0 var(--theme-space-md);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.theme-settings__preview-content {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-lg);
}

.theme-settings__preview-buttons {
  display: flex;
  gap: var(--theme-space-sm);
  flex-wrap: wrap;
}

.theme-settings__btn {
  padding: var(--theme-space-sm) var(--theme-space-md);
  font-size: var(--theme-font-sm);
  border-radius: var(--theme-radius-sm);
  border: var(--theme-border-thin) solid transparent;
  cursor: default;
  transition: box-shadow 0.2s;
}

.theme-settings__btn--primary {
  background: var(--theme-primary);
  color: var(--theme-primary-inverse);
  border-color: var(--theme-primary);
}

.theme-settings__btn--secondary {
  background: var(--theme-bg-secondary);
  color: var(--theme-text-primary);
  border-color: var(--theme-border);
}

.theme-settings__btn--glow {
  padding: var(--theme-space-sm) var(--theme-space-md);
  font-size: var(--theme-font-sm);
  border-radius: var(--theme-radius-sm);
  border: var(--theme-border-thin) solid var(--theme-primary);
  background: transparent;
  color: var(--theme-primary);
  cursor: default;
  box-shadow: var(--theme-shadow-glow);
  transition: box-shadow 0.2s;
}

.theme-settings__preview-card {
  padding: var(--theme-space-md);
  background: var(--theme-bg-card);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
}

.theme-settings__preview-title {
  font-size: var(--theme-font-lg);
  color: var(--theme-text-primary);
  margin: 0 0 var(--theme-space-xs);
}

.theme-settings__preview-body {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  margin: 0 0 var(--theme-space-xs);
}

.theme-settings__preview-muted {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
  margin: 0;
}

.theme-settings__preview-status,
.theme-settings__preview-trade,
.theme-settings__preview-glow {
  display: flex;
  flex-wrap: wrap;
  gap: var(--theme-space-xs);
}

.theme-settings__pill {
  padding: var(--theme-space-xs) var(--theme-space-sm);
  font-size: var(--theme-font-xs);
  border-radius: var(--theme-radius-sm);
}

.theme-settings__pill--success {
  background: var(--theme-success);
  color: var(--theme-text-primary);
}

.theme-settings__pill--error {
  background: var(--theme-error);
  color: var(--theme-text-primary);
}

.theme-settings__pill--warning {
  background: var(--theme-warning);
  color: var(--theme-text-primary);
}

.theme-settings__pill--info {
  background: var(--theme-info);
  color: var(--theme-text-primary);
}

.theme-settings__chip {
  padding: var(--theme-space-xs) var(--theme-space-sm);
  font-size: var(--theme-font-xs);
  border-radius: var(--theme-radius-sm);
}

.theme-settings__chip--buy {
  background: var(--theme-trade-buy);
  color: var(--theme-text-primary);
}

.theme-settings__chip--sell {
  background: var(--theme-trade-sell);
  color: var(--theme-text-primary);
}

.theme-settings__chip--trade {
  background: var(--theme-trade-trade);
  color: var(--theme-text-primary);
}
</style>
