<template>
  <div class="theme-settings">
    <div class="theme-settings__preview">
      <p class="theme-settings__preview-label">Live preview</p>
      <div class="theme-settings__preview-card">
        <div class="theme-settings__preview-header">
          <span class="theme-settings__preview-name">Community name</span>
          <span class="theme-settings__preview-badge">Active</span>
        </div>
        <p class="theme-settings__preview-body">
          Body text and <span class="theme-settings__preview-link">a primary link</span>. Below are the key UI states.
        </p>
        <p class="theme-settings__preview-muted">Muted caption text — for hints and secondary info.</p>
        <div class="theme-settings__preview-actions">
          <button type="button" class="theme-settings__preview-btn theme-settings__preview-btn--primary">Primary</button>
          <button type="button" class="theme-settings__preview-btn theme-settings__preview-btn--brand">Secondary</button>
          <button type="button" class="theme-settings__preview-btn theme-settings__preview-btn--outline">Outline</button>
        </div>
        <div class="theme-settings__preview-error">
          <span class="theme-settings__preview-error-dot" />
          Error state — e.g. invalid wallet or failed action.
        </div>
      </div>
    </div>

    <div class="theme-settings__form">
      <details class="theme-settings__section" open>
        <summary class="theme-settings__heading">Brand colours</summary>
        <p class="theme-settings__hint">
          Primary is the main actions and links. Secondary is the second brand colour (gradients and outline-style actions). Surfaces below are separate.
        </p>
        <div class="theme-settings__grid admin__card-grid--auto-dense">
          <div class="theme-settings__group">
            <ColorInput v-model="inputs.primary" label="Primary" @update:model-value="apply" />
            <ColorInput v-model="inputs.brandSecondary" label="Secondary (brand)" @update:model-value="apply" />
          </div>
        </div>
      </details>

      <details class="theme-settings__section" open>
        <summary class="theme-settings__heading">Surfaces and text</summary>
        <p class="theme-settings__hint">
          Page background, elevated panels, cards, and text. Leave optional fields empty to derive from background and foreground.
        </p>
        <div class="theme-settings__grid admin__card-grid--auto-dense">
          <div class="theme-settings__group">
            <h4 class="theme-settings__sub">Surfaces</h4>
            <ColorInput v-model="inputs.background" label="Page background" @update:model-value="apply" />
            <ColorInput v-model="inputs.elevatedSurface" label="Elevated / panel surface" @update:model-value="apply" />
            <ColorInput v-model="inputs.card" label="Card (modals, popovers)" @update:model-value="apply" />
          </div>
          <div class="theme-settings__group">
            <h4 class="theme-settings__sub">Text and border</h4>
            <ColorInput v-model="inputs.foreground" label="Foreground (main text)" @update:model-value="apply" />
            <ColorInput v-model="inputs.mutedForeground" label="Muted text (optional)" @update:model-value="apply" />
            <ColorInput v-model="inputs.border" label="Border (optional)" @update:model-value="apply" />
          </div>
        </div>
      </details>

      <details class="theme-settings__section">
        <summary class="theme-settings__heading">Semantic</summary>
        <p class="theme-settings__hint">Status and danger colours for feedback and marketplace labels.</p>
        <div class="theme-settings__grid admin__card-grid--auto-dense">
          <div class="theme-settings__group">
            <ColorInput v-model="statusSuccess" label="Positive / success" @update:model-value="applyStatus" />
            <ColorInput v-model="statusError" label="Negative / error" @update:model-value="applyStatus" />
            <ColorInput v-model="statusWarning" label="Warning" @update:model-value="applyStatus" />
            <ColorInput v-model="statusDestructive" label="Destructive (danger actions)" @update:model-value="applyStatus" />
          </div>
        </div>
      </details>

      <details class="theme-settings__section">
        <summary class="theme-settings__heading">Typography</summary>
        <p class="theme-settings__hint">Body font and size scale: small (labels), body (main text), heading (titles).</p>
        <div class="theme-settings__group">
          <OptionsSelect v-model="fontFamilyId" label="Font" :options="FONT_OPTIONS" @update:model-value="applyFont" />
        </div>
        <div class="theme-settings__typography-row admin__card-grid--3">
          <FormInput v-model="typographySmall" label="Small (rem)" placeholder="0.875" @update:model-value="applyTypography" />
          <FormInput v-model="typographyBody" label="Body (rem)" placeholder="1" @update:model-value="applyTypography" />
          <FormInput v-model="typographyHeading" label="Heading (rem)" placeholder="1.25" @update:model-value="applyTypography" />
        </div>
      </details>

      <details class="theme-settings__section">
        <summary class="theme-settings__heading">Rounding and border</summary>
        <p class="theme-settings__hint">Corner radius and border width.</p>

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
          Background pattern and glow on interactive elements (buttons, cards). Glow follows your primary colour.
        </p>
        <div class="theme-settings__grid admin__card-grid--2-sm">
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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, nextTick, useId } from 'vue'
import FormInput from '~/components/ui/form-input/FormInput.vue'
import OptionsSelect from '~/components/ui/options-select/OptionsSelect.vue'
import { deriveTheme, themeToInputs, parseRem } from '@decentraguild/ui'
import type { TenantTheme } from '@decentraguild/core'

const props = defineProps<{
  branding: {
    logo: string
    theme: TenantTheme
  }
}>()

const sliderId = useId()
const borderSliderId = useId()
const patternSizeId = useId()

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

const inputs = reactive({
  primary: '#dc2626',
  brandSecondary: '#ea580c',
  background: '#0c0a0a',
  foreground: '#fafafa',
  mutedForeground: '',
  card: '',
  elevatedSurface: '',
  border: '',
  radiusLevel: 3,
  borderWidthPx: 1,
})

const statusSuccess = ref('')
const statusError = ref('')
const statusWarning = ref('')
const statusDestructive = ref('')

const fontFamilyId = ref('inter')
const typographySmall = ref('0.875')
const typographyBody = ref('1')
const typographyHeading = ref('1.25')

const effectPattern = ref<'none' | 'dots' | 'grid'>('none')
const effectPatternSize = ref(24)
const effectGlow = ref<'none' | 'subtle' | 'medium' | 'strong'>('subtle')

function syncFromTheme() {
  const extracted = themeToInputs(props.branding.theme)
  inputs.primary = extracted.primary
  inputs.brandSecondary = extracted.brandSecondary
  inputs.background = extracted.background
  inputs.foreground = extracted.foreground
  inputs.mutedForeground = extracted.mutedForeground ?? ''
  inputs.card = extracted.card ?? ''
  inputs.elevatedSurface = extracted.elevatedSurface ?? ''
  inputs.border = extracted.border ?? ''
  inputs.radiusLevel = extracted.radiusLevel ?? 3
  inputs.borderWidthPx = extracted.borderWidthPx ?? 1

  const c = props.branding.theme.colors ?? {}
  statusSuccess.value = c.status?.success ?? ''
  statusError.value = c.status?.error ?? ''
  statusWarning.value = c.status?.warning ?? ''
  statusDestructive.value = c.status?.destructive ?? ''

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
    brandSecondary: inputs.brandSecondary,
    background: inputs.background,
    foreground: inputs.foreground,
    mutedForeground: inputs.mutedForeground || undefined,
    card: inputs.card || undefined,
    elevatedSurface: inputs.elevatedSurface || undefined,
    border: inputs.border || undefined,
    status: {
      success: statusSuccess.value || undefined,
      error: statusError.value || undefined,
      warning: statusWarning.value || undefined,
    },
    destructive: statusDestructive.value || undefined,
    radiusLevel: inputs.radiusLevel,
    borderWidthPx: inputs.borderWidthPx,
    glowIntensity: effectGlow.value,
    fontPrimary: FONT_STACKS[fontFamilyId.value] ?? FONT_STACKS.inter,
    fontMono: props.branding.theme.fonts?.mono ?? DEFAULT_MONO,
  })

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

/* eslint-disable vue/no-mutating-props -- parent passes mutable branding draft for theme edits */
function apply() {
  const theme = buildTheme()
  Object.assign(props.branding.theme, theme)
  delete props.branding.theme.spacing
}
/* eslint-enable vue/no-mutating-props */

function applyStatus() {
  apply()
}
function applyFont() {
  apply()
}
function applyTypography() {
  apply()
}
function applyEffects() {
  apply()
}

watch(
  () => props.branding,
  async () => {
    syncFromTheme()
    await nextTick()
  },
  { immediate: true, deep: false },
)
</script>

<style scoped>
.theme-settings {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xl);
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
  color: var(--theme-secondary);
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
  margin-bottom: var(--theme-space-md);
}

.theme-settings__grid:last-child {
  margin-bottom: 0;
}

.theme-settings__group {
  margin-bottom: var(--theme-space-md);
}

.theme-settings__group .color-input,
.theme-settings__group .form-input {
  margin-bottom: var(--theme-space-sm);
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

/* Preview section */
.theme-settings__preview {
  margin-bottom: var(--theme-space-md);
}

.theme-settings__preview-label {
  font-size: var(--theme-font-xs);
  font-weight: 600;
  color: var(--theme-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0 0 var(--theme-space-sm);
}

.theme-settings__preview-card {
  padding: var(--theme-space-md);
  background: var(--theme-bg-card);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-top: var(--theme-border-medium) solid var(--theme-primary);
  border-radius: var(--theme-radius-md);
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-sm);
  box-shadow: var(--theme-shadow-card);
}

.theme-settings__preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.theme-settings__preview-name {
  font-size: var(--theme-font-base);
  font-weight: 700;
  background: var(--theme-gradient-primary, var(--theme-primary));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: var(--theme-primary);
}

.theme-settings__preview-badge {
  font-size: var(--theme-font-xs);
  font-weight: 600;
  padding: 2px var(--theme-space-sm);
  border-radius: var(--theme-radius-full);
  background: var(--theme-surface-success);
  color: var(--theme-success);
}

.theme-settings__preview-body {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-primary);
  margin: 0;
}

.theme-settings__preview-link {
  color: var(--theme-primary);
}

.theme-settings__preview-muted {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
  margin: 0;
}

.theme-settings__preview-actions {
  display: flex;
  gap: var(--theme-space-sm);
  flex-wrap: wrap;
}

.theme-settings__preview-btn {
  padding: var(--theme-space-xs) var(--theme-space-md);
  font-size: var(--theme-font-sm);
  font-weight: 500;
  border-radius: var(--theme-radius-md);
  cursor: default;
  border: var(--theme-border-thin) solid transparent;
  transition: none;
}

.theme-settings__preview-btn--primary {
  background: var(--theme-primary);
  color: var(--theme-primary-inverse, #fff);
}

.theme-settings__preview-btn--brand {
  background: var(--theme-secondary);
  color: var(--theme-secondary-inverse, #fff);
}

.theme-settings__preview-btn--outline {
  background: transparent;
  border-color: var(--theme-border);
  color: var(--theme-text-primary);
}

.theme-settings__preview-error {
  display: flex;
  align-items: center;
  gap: var(--theme-space-xs);
  font-size: var(--theme-font-xs);
  color: var(--theme-text-error);
  padding: var(--theme-space-xs) var(--theme-space-sm);
  background: var(--theme-surface-error);
  border: var(--theme-border-thin) solid var(--theme-error);
  border-radius: var(--theme-radius-sm);
}

.theme-settings__preview-error-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--theme-error);
  flex-shrink: 0;
}

.theme-settings__typography-row {
  margin-bottom: var(--theme-space-md);
}
</style>
