<template>
  <Dialog :open="modelValue" @update:open="onOpenChange">
    <DialogContent
      :show-close-button="false"
      class="raffle-battle-reveal__shell !flex !flex-col !gap-3 !overflow-hidden !min-h-0 sm:!max-w-none"
    >
      <DialogTitle class="sr-only">Raffle battle reveal</DialogTitle>
      <div ref="themeRef" class="raffle-battle-reveal">
        <div class="raffle-battle-reveal__toolbar">
          <span v-if="raffleName" class="raffle-battle-reveal__title">{{ raffleName }}</span>
          <div class="raffle-battle-reveal__toolbar-actions">
            <Button v-if="phase === 'battle'" type="button" variant="ghost" size="sm" @click="skipBattle">
              Skip
            </Button>
            <Button type="button" variant="ghost" size="sm" @click="closeAll">
              Close
            </Button>
          </div>
        </div>

        <div v-if="phase === 'roster'" class="raffle-battle-reveal__roster">
          <p v-if="loading" class="raffle-battle-reveal__hint">Loading entries…</p>
          <p v-else-if="loadError" class="raffle-battle-reveal__err">{{ loadError }}</p>
          <template v-else>
            <p v-if="!matchesSold" class="raffle-battle-reveal__warn">
              Holder totals from the indexer do not match sold tickets yet. You can still run the reveal for display.
            </p>
            <p v-if="winnerMissingFromHolders" class="raffle-battle-reveal__warn">
              The on-chain winner is not in the holder list (indexing lag). The animation may not match the real winner; the overlay still shows the chain winner.
            </p>
            <p class="raffle-battle-reveal__hint">
              Each wallet is one squad (colour + label); more tickets mean more health. Member nicknames show when your community has them. The on-chain winner cannot be eliminated. Presentation only — the draw is already settled on-chain.
            </p>
            <div class="raffle-battle-reveal__table-wrap">
              <table class="raffle-battle-reveal__table">
                <thead>
                  <tr>
                    <th class="raffle-battle-reveal__th-swatch" aria-hidden="true" />
                    <th>Squad</th>
                    <th>Fighters</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in displayRows" :key="r.owner">
                    <td class="raffle-battle-reveal__td-swatch">
                      <span
                        class="raffle-battle-reveal__swatch"
                        :style="{ background: squadColorForOwner(r.owner) }"
                        :title="formatWallet(r.owner, 8, 8)"
                      />
                    </td>
                    <td>{{ formatWallet(r.owner, 10, 6) }}</td>
                    <td>{{ r.tickets }}</td>
                    <td>{{ r.sharePercent.toFixed(1) }}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="raffle-battle-reveal__roster-actions">
              <Button type="button" variant="default" :disabled="!canStartBattle" @click="startBattle">
                Start battle
              </Button>
              <Button type="button" variant="ghost" @click="closeAll">Skip</Button>
            </div>
          </template>
        </div>

        <div v-show="phase === 'battle' || phase === 'done'" class="raffle-battle-reveal__canvas-wrap">
          <canvas ref="canvasRef" class="raffle-battle-reveal__canvas" />
          <div v-if="phase === 'done'" class="raffle-battle-reveal__victory">
            <div class="raffle-battle-reveal__victory-panel">
              <p class="raffle-battle-reveal__victory-label">Winner</p>
              <p class="raffle-battle-reveal__victory-wallet">{{ formatWallet(winnerWalletLabel) }}</p>
            </div>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '~/components/ui/dialog'
import {
  assignSquadColors,
  buildSoldierSeedsFromHolders,
  createRaffleBattleSimulator,
  holderRowMatchesChainWinner,
  type RaffleBattleSimulator,
  type SlashEffect,
} from '~/composables/raffle/raffleBattleEngine'
import type { RaffleHolderBalanceRow } from '@decentraguild/web3'

export interface HolderDisplayRow {
  owner: string
  tickets: string
  sharePercent: number
}

const props = defineProps<{
  modelValue: boolean
  raffleName?: string
  rafflePubkey?: string
  winnerPubkey: string
  loading: boolean
  loadError: string | null
  matchesSold: boolean
  displayRows: HolderDisplayRow[]
  rawHolderRows: RaffleHolderBalanceRow[]
  formatWallet: (pubkey: string, head?: number, tail?: number) => string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const phase = ref<'roster' | 'battle' | 'done'>('roster')
const themeRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let sim: RaffleBattleSimulator | null = null
let rafId = 0
let lastT = 0

const canStartBattle = computed(
  () =>
    !props.loading &&
    !props.loadError &&
    props.rawHolderRows.length > 0 &&
    props.winnerPubkey.length > 0,
)

const winnerMissingFromHolders = computed(
  () =>
    Boolean(
      props.winnerPubkey &&
        props.rawHolderRows.length > 0 &&
        !props.rawHolderRows.some((r) =>
          holderRowMatchesChainWinner(r.owner, props.winnerPubkey, props.rafflePubkey),
        ),
    ),
)

const winnerWalletLabel = computed(() => {
  const w = props.winnerPubkey?.trim() ?? ''
  if (!w) return w
  const row = props.rawHolderRows.find((r) =>
    holderRowMatchesChainWinner(r.owner, w, props.rafflePubkey),
  )
  return row?.owner ?? w
})

const battleColorSalt = computed(() => `${props.winnerPubkey}|${props.raffleName ?? ''}`)

const squadColorByOwner = computed(() =>
  assignSquadColors(
    props.rawHolderRows.map((r) => r.owner),
    battleColorSalt.value,
  ),
)

function squadColorForOwner(owner: string): string {
  return squadColorByOwner.value.get(owner) ?? 'hsl(210, 55%, 55%)'
}

/** Short label for canvas (nickname from formatWallet when set; cap length). */
function squadCanvasLabel(owner: string): string {
  const s = props.formatWallet(owner, 5, 4)
  if (s.length <= 14) return s
  return `${s.slice(0, 12)}…`
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      phase.value = 'roster'
      stopLoop()
      sim = null
    } else {
      stopLoop()
      sim = null
    }
  },
)

onUnmounted(() => stopLoop())

function onOpenChange(v: boolean) {
  emit('update:modelValue', v)
}

function closeAll() {
  emit('update:modelValue', false)
}

function skipBattle() {
  stopLoop()
  phase.value = 'done'
}

function stopLoop() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
  lastT = 0
}

function readColors() {
  const el = themeRef.value
  if (!el) {
    return { primary: '#c9a227', fg: '#e8e8ec', muted: '#8890a0', mortal: '#6b7fd7' }
  }
  const cs = getComputedStyle(el)
  return {
    primary: cs.getPropertyValue('--theme-primary').trim() || '#c9a227',
    fg: cs.getPropertyValue('--theme-text-primary').trim() || '#e8e8ec',
    muted: cs.getPropertyValue('--theme-text-muted').trim() || '#8890a0',
    mortal: cs.getPropertyValue('--theme-text-secondary').trim() || '#6b7fd7',
  }
}

function resizeCanvas() {
  const c = canvasRef.value
  if (!c) return
  const wrap = c.parentElement
  if (!wrap) return
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const w = wrap.clientWidth
  const h = wrap.clientHeight
  c.width = Math.max(1, Math.floor(w * dpr))
  c.height = Math.max(1, Math.floor(h * dpr))
  c.style.width = `${w}px`
  c.style.height = `${h}px`
}

function drawSlashEffects(ctx: CanvasRenderingContext2D, effects: SlashEffect[], scale: number) {
  for (const fx of effects) {
    const life = 1 - fx.age / fx.ttl
    if (life <= 0) continue
    ctx.save()
    ctx.translate(fx.x, fx.y)
    ctx.rotate(fx.ang)
    const wobble = Math.sin((fx.age / fx.ttl) * Math.PI)
    const len = 24 + 20 * life
    const bend = -8 * wobble * life

    ctx.beginPath()
    ctx.moveTo(-3, 0)
    ctx.quadraticCurveTo(len * 0.4, bend * 1.35, len + 2, bend * 0.4)
    ctx.strokeStyle = fx.color
    ctx.globalAlpha = 0.42 * life
    ctx.lineWidth = 10 / scale
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(len * 0.36, bend, len * 0.95, bend * 0.28)
    const g = ctx.createLinearGradient(0, -2, len, 2)
    g.addColorStop(0, `rgba(255,255,255,${0.98 * life})`)
    g.addColorStop(0.45, `rgba(255,248,230,${0.88 * life})`)
    g.addColorStop(1, 'rgba(255,190,120,0)')
    ctx.strokeStyle = g
    ctx.globalAlpha = 1
    ctx.lineWidth = 3.4 / scale
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(len * 0.88, bend * 0.22, 2.2 * life, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,255,255,${0.75 * life})`
    ctx.fill()

    ctx.restore()
  }
  ctx.globalAlpha = 1
}

function draw(simInst: RaffleBattleSimulator) {
  const c = canvasRef.value
  if (!c) return
  const ctx = c.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const cssW = c.width / dpr
  const cssH = c.height / dpr
  const { cx, cy, scale } = simInst.cameraForCanvas(cssW, cssH)
  const colors = readColors()

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = 'rgba(8,10,14,0.96)'
  ctx.fillRect(0, 0, c.width, c.height)

  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, (cssW / 2 - cx * scale) * dpr, (cssH / 2 - cy * scale) * dpr)

  const bodyR = 8
  const labelOffset = ringRLabel(bodyR)
  const fontPx = Math.max(7, 10.5 / scale)
  ctx.font = `600 ${fontPx}px ui-sans-serif, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'

  for (const u of simInst.units) {
    if (!u.alive) continue
    const ringR = bodyR + 5
    if (u.maxHp > 0) {
      const frac = Math.max(0, Math.min(1, u.hp / u.maxHp))
      ctx.beginPath()
      ctx.arc(u.x, u.y, ringR, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2)
      ctx.strokeStyle = u.squadColor
      ctx.lineWidth = 2.8 / scale
      ctx.lineCap = 'round'
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(u.x, u.y, ringR, 0, Math.PI * 2)
      ctx.strokeStyle = `${colors.muted}55`
      ctx.lineWidth = 1.4 / scale
      ctx.stroke()
    }

    ctx.beginPath()
    ctx.arc(u.x, u.y, bodyR, 0, Math.PI * 2)
    ctx.fillStyle = u.squadColor
    ctx.fill()
    ctx.strokeStyle = colors.fg
    ctx.lineWidth = 1.2 / scale
    ctx.stroke()

    const sx = u.x + Math.cos(u.ang) * (bodyR + 1.5)
    const sy = u.y + Math.sin(u.ang) * (bodyR + 1.5)
    ctx.beginPath()
    ctx.moveTo(u.x, u.y)
    ctx.lineTo(sx, sy)
    ctx.strokeStyle = colors.fg
    ctx.globalAlpha = 0.45
    ctx.lineWidth = 1.4 / scale
    ctx.stroke()
    ctx.globalAlpha = 1

    const lab = squadCanvasLabel(u.owner)
    const ly = u.y - labelOffset
    ctx.strokeStyle = 'rgba(0,0,0,0.62)'
    ctx.lineWidth = 3 / scale
    ctx.strokeText(lab, u.x, ly)
    ctx.fillStyle = u.squadColor
    ctx.fillText(lab, u.x, ly)
  }

  drawSlashEffects(ctx, simInst.slashEffects, scale)
}

function ringRLabel(bodyR: number): number {
  return bodyR + 5 + 10
}

function loop(t: number) {
  if (!sim) return
  if (lastT === 0) lastT = t
  const dt = Math.min(0.05, (t - lastT) / 1000)
  lastT = t
  sim.step(dt)
  draw(sim)
  if (sim.finished) {
    phase.value = 'done'
    stopLoop()
    return
  }
  rafId = requestAnimationFrame(loop)
}

function startBattle() {
  const seeds = buildSoldierSeedsFromHolders(
    props.rawHolderRows,
    props.winnerPubkey,
    props.rafflePubkey,
  )
  if (seeds.length === 0) return
  phase.value = 'battle'
  nextTick(() => {
    resizeCanvas()
    sim = createRaffleBattleSimulator(seeds, squadColorByOwner.value)
    lastT = 0
    stopLoop()
    rafId = requestAnimationFrame(loop)
  })
}

function onResize() {
  if (phase.value === 'battle' && sim) {
    resizeCanvas()
    draw(sim)
  }
}

watch(
  () => phase.value,
  (p) => {
    if (p === 'battle') {
      window.addEventListener('resize', onResize)
    } else {
      window.removeEventListener('resize', onResize)
    }
  },
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onResize)
})

function onKeydown(e: KeyboardEvent) {
  if (!props.modelValue) return
  if (e.key === 'Escape') {
    e.preventDefault()
    closeAll()
  }
}
</script>

<style scoped>
.raffle-battle-reveal {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-sm);
  min-height: 0;
  min-width: 0;
  flex: 1;
  width: 100%;
}

.raffle-battle-reveal__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--theme-space-sm);
  flex-shrink: 0;
}

.raffle-battle-reveal__title {
  font-weight: 600;
  font-size: var(--theme-font-md);
}

.raffle-battle-reveal__toolbar-actions {
  display: flex;
  gap: var(--theme-space-xs);
}

.raffle-battle-reveal__roster {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-sm);
  min-height: 0;
  flex: 1;
  overflow: auto;
}

.raffle-battle-reveal__hint {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.raffle-battle-reveal__err {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-error, #e5484d);
}

.raffle-battle-reveal__warn {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-warning, #f5a623);
}

.raffle-battle-reveal__table-wrap {
  overflow: auto;
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  max-height: min(32dvh, 360px);
}

.raffle-battle-reveal__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--theme-font-sm);
}

.raffle-battle-reveal__table th,
.raffle-battle-reveal__table td {
  padding: var(--theme-space-xs) var(--theme-space-sm);
  text-align: left;
  border-bottom: 1px solid var(--theme-border);
}

.raffle-battle-reveal__table th {
  color: var(--theme-text-secondary);
  font-weight: 600;
}

.raffle-battle-reveal__th-swatch {
  width: 2rem;
  padding-right: 0;
}

.raffle-battle-reveal__td-swatch {
  width: 2rem;
  padding-right: 0;
  vertical-align: middle;
}

.raffle-battle-reveal__swatch {
  display: inline-block;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  vertical-align: middle;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
}

.raffle-battle-reveal__roster-actions {
  display: flex;
  gap: var(--theme-space-sm);
  flex-wrap: wrap;
  margin-top: auto;
}

.raffle-battle-reveal__canvas-wrap {
  position: relative;
  flex: 1;
  min-height: min(58dvh, 640px);
  border-radius: var(--theme-radius-md);
  overflow: hidden;
  border: var(--theme-border-thin) solid var(--theme-border);
}

.raffle-battle-reveal__canvas {
  display: block;
  width: 100%;
  height: 100%;
  min-height: min(58dvh, 640px);
}

.raffle-battle-reveal__victory {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--theme-space-md);
  background: rgba(0, 0, 0, 0.62);
  pointer-events: none;
}

.raffle-battle-reveal__victory-panel {
  pointer-events: auto;
  max-width: min(100%, 26rem);
  padding: var(--theme-space-lg) var(--theme-space-xl);
  border-radius: var(--theme-radius-lg);
  background: var(--theme-bg-card, var(--theme-background));
  color: var(--theme-text-primary);
  border: var(--theme-border-thin) solid var(--theme-border);
  box-shadow:
    var(--theme-shadow-card, 0 16px 48px rgba(0, 0, 0, 0.4)),
    0 0 0 1px rgba(255, 255, 255, 0.06);
  text-align: center;
}

.raffle-battle-reveal__victory-label {
  margin: 0 0 var(--theme-space-sm);
  font-size: var(--theme-font-sm);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--theme-text-secondary);
}

.raffle-battle-reveal__victory-wallet {
  margin: 0;
  padding-top: var(--theme-space-sm);
  border-top: 3px solid var(--theme-primary);
  font-size: var(--theme-font-lg);
  font-weight: 700;
  color: var(--theme-text-primary);
  font-family: var(--theme-font-mono, monospace);
  text-align: center;
  word-break: break-all;
  line-height: 1.45;
}
</style>

<style>
/* Portaled dialog root: scoped CSS does not apply; override sm:max-w-lg + fill ~80% viewport. */
[data-slot='dialog-content'].raffle-battle-reveal__shell {
  box-sizing: border-box;
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 101;
  width: min(80vw, calc(100vw - 1.5rem));
  max-width: min(80vw, calc(100vw - 1.5rem));
  height: 80dvh;
  max-height: 80dvh;
  min-height: 0;
}
</style>
