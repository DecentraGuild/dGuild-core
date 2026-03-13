<template>
  <div class="theme-settings">
    <div class="theme-settings__form">
      <details class="theme-settings__section" open>
        <summary class="theme-settings__heading">Colors</summary>
        <p class="theme-settings__hint">
          Core colours and surfaces. Leave optional fields empty to derive from primary and background.
        </p>
        <div class="theme-settings__grid theme-settings__grid--two">
          <div class="theme-settings__group">
            <h4 class="theme-settings__sub">Core</h4>
            <ColorInput v-model="inputs.primary" label="Primary (buttons, links)" @update:model-value="apply" />
            <ColorInput v-model="inputs.background" label="Background (page)" @update:model-value="apply" />
            <ColorInput v-model="inputs.foreground" label="Foreground (text)" @update:model-value="apply" />
            <ColorInput v-model="inputs.mutedForeground" label="Muted text (leave empty to derive)" @update:model-value="apply" />
            <ColorInput v-model="inputs.border" label="Border (leave empty to derive)" @update:model-value="apply" />
          </div>
          <div class="theme-settings__group">
            <h4 class="theme-settings__sub">Surfaces</h4>
            <ColorInput v-model="inputs.card" label="Card (modals, popovers)" @update:model-value="apply" />
            <ColorInput v-model="inputs.secondary" label="Secondary surface (ghost hover)" @update:model-value="apply" />
            <ColorInput v-model="inputs.accent" label="Accent highlight" @update:model-value="apply" />
            <ColorInput v-model="inputs.destructive" label="Destructive (danger actions)" @update:model-value="apply" />
          </div>
        </div>
        <div class="theme-settings__grid theme-settings__grid--two">
          <div class="theme-settings__group">
            <h4 class="theme-settings__sub">Status</h4>
            <ColorInput v-model="statusSuccess" label="Positive" @update:model-value="applyStatus" />
            <ColorInput v-model="statusError" label="Negative" @update:model-value="applyStatus" />
            <ColorInput v-model="statusWarning" label="Warning" @update:model-value="applyStatus" />
            <ColorInput v-model="statusInfo" label="Info" @update:model-value="applyStatus" />
          </div>
        </div>
      </details>

      <details class="theme-settings__section">
        <summary class="theme-settings__heading">Typography</summary>
        <p class="theme-settings__hint">Font family and size scale: small (labels), body (main text), heading (titles).</p>
        <div class="theme-settings__group">
          <OptionsSelect v-model="fontFamilyId" label="Font" :options="FONT_OPTIONS" @update:model-value="applyFont" />
        </div>
        <div class="theme-settings__typography-row">
          <FormInput v-model="typographySmall" label="Small (rem)" placeholder="0.875" @update:model-value="applyTypography" />
          <FormInput v-model="typographyBody" label="Body (rem)" placeholder="1" @update:model-value="applyTypography" />
          <FormInput v-model="typographyHeading" label="Heading (rem)" placeholder="1.25" @update:model-value="applyTypography" />
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
            <OptionsSelect v-model="effectPattern" label="Background pattern" :options="PATTERN_OPTIONS" @update:model-value="applyEffects" />
          </div>
          <div class="theme-settings__group">
            <OptionsSelect v-model="effectGlow" label="Glow intensity" :options="GLOW_OPTIONS" @update:model-value="applyEffects" />
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

    <ThemePreview :theme="props.branding.theme" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from 'vue'
import FormInput from '~/components/ui/form-input/FormInput.vue'
import OptionsSelect from '~/components/ui/options-select/OptionsSelect.vue'
import ThemePreview from '~/components/admin/ThemePreview.vue'
import { deriveTheme, themeToInputs, parseRem } from '@decentraguild/ui'
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
  foreground: '#ffffff',
  mutedForeground: '',
  card: '',
  secondary: '',
  accent: '',
  destructive: '',
  border: '',
  radiusLevel: 3,
  spacingLevel: 5,
  borderWidthPx: 1,
})

// Status refs (trade uses these: Sell=Positive, Buy=Negative, Trade=Warning)
const statusSuccess = ref('')
const statusError = ref('')
const statusWarning = ref('')
const statusInfo = ref('')

const fontFamilyId = ref('inter')
const typographySmall = ref('0.875')
const typographyBody = ref('1')
const typographyHeading = ref('1.25')

const effectPattern = ref<'none' | 'dots' | 'grid'>('none')
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
  inputs.foreground = extracted.foreground
  inputs.mutedForeground = extracted.mutedForeground ?? ''
  inputs.card = extracted.card ?? ''
  inputs.secondary = extracted.secondary ?? ''
  inputs.accent = extracted.accent ?? ''
  inputs.destructive = extracted.destructive ?? ''
  inputs.border = extracted.border ?? ''
  inputs.radiusLevel = extracted.radiusLevel ?? 3
  inputs.spacingLevel = extracted.spacingLevel ?? 5
  inputs.borderWidthPx = extracted.borderWidthPx ?? 1

  const c = props.branding.theme.colors ?? {}
  statusSuccess.value = c.status?.success ?? ''
  statusError.value = c.status?.error ?? ''
  statusWarning.value = c.status?.warning ?? ''
  statusInfo.value = c.status?.info ?? ''

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
    foreground: inputs.foreground,
    mutedForeground: inputs.mutedForeground || undefined,
    card: inputs.card || undefined,
    secondary: inputs.secondary || undefined,
    accent: inputs.accent || undefined,
    destructive: inputs.destructive || undefined,
    border: inputs.border || undefined,
    status: {
      success: statusSuccess.value || undefined,
      error: statusError.value || undefined,
      warning: statusWarning.value || undefined,
      info: statusInfo.value || undefined,
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
  // eslint-disable-next-line vue/no-mutating-props -- parent passes mutable branding for theme edits
  Object.assign(props.branding.theme, theme)
}

function applyStatus() { apply() }
function applyFont() { apply() }
function applyTypography() { apply() }
function applyEffects() { apply() }

let _isSyncing = false
watch(
  () => props.branding,
  async () => {
    _isSyncing = true
    syncFromTheme()
    await nextTick()
    _isSyncing = false
  },
  { immediate: true, deep: false },
)

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
.theme-settings__group .form-input {
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

</style>
