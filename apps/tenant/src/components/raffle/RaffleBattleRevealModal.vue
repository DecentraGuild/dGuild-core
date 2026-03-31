<template>
  <Dialog :open="modelValue" @update:open="onOpenChange">
    <DialogContent :show-close-button="false" class="raffle-battle-reveal__shell">
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
                Each ticket is one fighter. Winner’s side cannot be eliminated. This is a presentation only; the draw is already on-chain.
              </p>
              <div class="raffle-battle-reveal__table-wrap">
                <table class="raffle-battle-reveal__table">
                  <thead>
                    <tr>
                      <th>Wallet</th>
                      <th>Fighters</th>
                      <th>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in displayRows" :key="r.owner">
                      <td>{{ formatWallet(r.owner) }}</td>
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
              <p class="raffle-battle-reveal__victory-label">Winner</p>
              <p class="raffle-battle-reveal__victory-wallet">{{ formatWallet(winnerPubkey) }}</p>
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
  buildSoldierSeedsFromHolders,
  createRaffleBattleSimulator,
  type RaffleBattleSimulator,
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
        !props.rawHolderRows.some((r) => r.owner === props.winnerPubkey),
    ),
)

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

  for (const u of simInst.units) {
    if (!u.alive) continue
    const fill = u.invincible ? colors.primary : colors.mortal
    ctx.beginPath()
    ctx.arc(u.x, u.y, 7, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.strokeStyle = colors.fg
    ctx.lineWidth = 1.2 / scale
    ctx.stroke()
    const sx = u.x + Math.cos(u.ang) * 12
    const sy = u.y + Math.sin(u.ang) * 12
    ctx.beginPath()
    ctx.moveTo(u.x, u.y)
    ctx.lineTo(sx, sy)
    ctx.strokeStyle = colors.fg
    ctx.lineWidth = 2 / scale
    ctx.stroke()
  }
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
  const seeds = buildSoldierSeedsFromHolders(props.rawHolderRows, props.winnerPubkey)
  if (seeds.length === 0) return
  phase.value = 'battle'
  nextTick(() => {
    resizeCanvas()
    sim = createRaffleBattleSimulator(seeds)
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
.raffle-battle-reveal__shell {
  position: fixed !important;
  inset: var(--theme-space-md, 12px) !important;
  left: var(--theme-space-md, 12px) !important;
  top: var(--theme-space-md, 12px) !important;
  right: var(--theme-space-md, 12px) !important;
  bottom: var(--theme-space-md, 12px) !important;
  width: auto !important;
  height: auto !important;
  min-height: min(88dvh, 720px) !important;
  max-width: none !important;
  max-height: none !important;
  transform: none !important;
  translate: none !important;
  z-index: 101;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--theme-space-md);
  border-radius: var(--theme-radius-lg);
  background: var(--theme-bg-card);
  border: var(--theme-border-thin) solid var(--theme-border);
  color: var(--theme-text-primary);
}

.raffle-battle-reveal {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-sm);
  min-height: 0;
  flex: 1;
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
  max-height: min(40vh, 320px);
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

.raffle-battle-reveal__roster-actions {
  display: flex;
  gap: var(--theme-space-sm);
  flex-wrap: wrap;
  margin-top: auto;
}

.raffle-battle-reveal__canvas-wrap {
  position: relative;
  flex: 1;
  min-height: min(52dvh, 420px);
  border-radius: var(--theme-radius-md);
  overflow: hidden;
  border: var(--theme-border-thin) solid var(--theme-border);
}

.raffle-battle-reveal__canvas {
  display: block;
  width: 100%;
  height: 100%;
  min-height: min(52dvh, 420px);
}

.raffle-battle-reveal__victory {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--theme-space-sm);
  background: rgba(0, 0, 0, 0.55);
  pointer-events: none;
}

.raffle-battle-reveal__victory-label {
  margin: 0;
  font-size: var(--theme-font-sm);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--theme-text-secondary);
}

.raffle-battle-reveal__victory-wallet {
  margin: 0;
  font-size: var(--theme-font-lg);
  font-weight: 600;
  color: var(--theme-primary);
  font-family: var(--theme-font-mono, monospace);
  text-align: center;
  padding: 0 var(--theme-space-md);
  word-break: break-all;
}
</style>
