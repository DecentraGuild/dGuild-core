import { PublicKey } from '@solana/web3.js'
import { deriveEntrantPda } from '@decentraguild/web3'

export interface BattleSoldierSeed {
  id: string
  owner: string
  isWinnerSide: boolean
  /** Ticket count for this wallet; drives squad HP and (for winner) hit strength. */
  tickets: number
}

const WORLD_W = 960
const WORLD_H = 540
/** Slower pacing so the canvas is readable. */
const SPEED = 36
const ATTACK_R = 20
const COOLDOWN = 0.64
const NO_KILL_NUDGE_SEC = 16
const MAX_BATTLE_SEC = 120
const NUDGE_AMP = 16

/** Mortal HP scales with tickets but stays bounded so huge holders do not stall the fight. */
const HP_BASE = 10
const HP_PER_TICKET = 4
const MAX_MORTAL_HP = 56

/** Hero HP can drop from hits but never below this fraction of max (never dies / never empty ring). */
const HERO_HP_MIN_FRAC = 0.14

export interface SimUnit {
  id: string
  x: number
  y: number
  owner: string
  squadColor: string
  invincible: boolean
  ticketCount: number
  hp: number
  maxHp: number
  cooldown: number
  alive: boolean
  ang: number
}

export interface SlashEffect {
  /** World-space origin (between attacker and target). */
  x: number
  y: number
  /** Slash arc direction (radians). */
  ang: number
  age: number
  ttl: number
  /** Attacker squad color for glow. */
  color: string
}

function fnv1a(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Distinct, deterministic HSL colours per wallet for this battle (cheer / canvas / roster).
 */
export function assignSquadColors(owners: string[], salt: string): Map<string, string> {
  const unique = [...new Set(owners)].sort()
  const map = new Map<string, string>()
  const n = unique.length || 1
  const saltTwist = fnv1a(salt) % 40
  for (let i = 0; i < unique.length; i += 1) {
    const owner = unique[i]!
    const spread = (i * (360 / n) + saltTwist) % 360
    const jitter = fnv1a(owner) % 28
    const h = (spread + jitter) % 360
    const light = 48 + (fnv1a(`${owner}|L`) % 14)
    map.set(owner, `hsl(${Math.round(h)}, 72%, ${light}%)`)
  }
  return map
}

function mortalMaxHp(tickets: number): number {
  const t = Math.max(1, Math.floor(tickets))
  return Math.min(MAX_MORTAL_HP, HP_BASE + t * HP_PER_TICKET)
}

function heroHpFloor(maxHp: number): number {
  return Math.max(1, Math.ceil(maxHp * HERO_HP_MIN_FRAC))
}

function damageDealt(attacker: SimUnit): number {
  if (attacker.invincible) {
    return Math.max(3, 2 + Math.floor(attacker.ticketCount / 3))
  }
  return 1
}

/** Extra chip when a mortal swings at the hero so the bar can reach the floor before the fight ends. */
function damageDealtToTarget(attacker: SimUnit, target: SimUnit): number {
  const base = damageDealt(attacker)
  if (target.invincible && !attacker.invincible) {
    const ticketBonus = Math.floor(attacker.ticketCount / 5)
    return Math.min(7, Math.max(3, base + 2 + ticketBonus))
  }
  return base
}

function spawnXY(index: number, total: number): { x: number; y: number } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(total * (WORLD_W / WORLD_H))))
  const rows = Math.max(1, Math.ceil(total / cols))
  const cellW = WORLD_W / (cols + 1)
  const cellH = WORLD_H / (rows + 1)
  const col = index % cols
  const row = Math.floor(index / cols)
  const jx = (Math.random() - 0.5) * cellW * 0.4
  const jy = (Math.random() - 0.5) * cellH * 0.4
  return {
    x: cellW * (col + 1) + jx,
    y: cellH * (row + 1) + jy,
  }
}

export function holderRowMatchesChainWinner(
  rowOwner: string,
  winnerPubkey: string,
  rafflePubkey: string | undefined,
): boolean {
  if (!winnerPubkey.trim()) return false
  if (rowOwner === winnerPubkey) return true
  if (!rafflePubkey?.trim()) return false
  try {
    const entrant = deriveEntrantPda(new PublicKey(rafflePubkey), new PublicKey(rowOwner))
    return entrant.toBase58() === winnerPubkey
  } catch {
    return false
  }
}

/** One squad per wallet so tickets add durability instead of many 1-shot pawns. */
export function buildSoldierSeedsFromHolders(
  rows: { owner: string; tickets: bigint }[],
  winnerPubkey: string,
  rafflePubkey?: string,
): BattleSoldierSeed[] {
  const out: BattleSoldierSeed[] = []
  let seq = 0
  for (const r of rows) {
    const n = Number(r.tickets)
    if (!Number.isFinite(n) || n < 1) continue
    out.push({
      id: `squad-${seq++}`,
      owner: r.owner,
      isWinnerSide: holderRowMatchesChainWinner(r.owner, winnerPubkey, rafflePubkey),
      tickets: Math.floor(n),
    })
  }
  return out
}

export function createRaffleBattleSimulator(
  seeds: BattleSoldierSeed[],
  colorByOwner: Map<string, string>,
) {
  const defaultColor = 'hsl(210, 55%, 55%)'
  const units: SimUnit[] = seeds.map((s, i) => {
    const { x, y } = spawnXY(i, seeds.length)
    const inv = s.isWinnerSide
    const maxHp = mortalMaxHp(s.tickets)
    return {
      id: s.id,
      x,
      y,
      owner: s.owner,
      squadColor: colorByOwner.get(s.owner) ?? defaultColor,
      invincible: inv,
      ticketCount: s.tickets,
      hp: maxHp,
      maxHp,
      cooldown: Math.random() * COOLDOWN * 0.85,
      alive: true,
      ang: 0,
    }
  })

  const slashEffects: SlashEffect[] = []

  let finished = false
  let noKillTimer = 0
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0

  function aliveUnits(): SimUnit[] {
    return units.filter((u) => u.alive)
  }

  function checkVictory(): void {
    const alive = aliveUnits()
    if (alive.length === 0) {
      finished = true
      return
    }
    const anyMortal = alive.some((u) => !u.invincible)
    if (!anyMortal) finished = true
  }

  function dist2(a: SimUnit, b: SimUnit): number {
    const dx = b.x - a.x
    const dy = b.y - a.y
    return dx * dx + dy * dy
  }

  function nearestEnemy(u: SimUnit): SimUnit | null {
    let best: SimUnit | null = null
    let bestD2 = Infinity
    for (const v of units) {
      if (!v.alive || v.owner === u.owner) continue
      const d2 = dist2(u, v)
      if (d2 < bestD2) {
        bestD2 = d2
        best = v
      }
    }
    return best
  }

  function step(dt: number): void {
    if (finished) return
    const now = typeof performance !== 'undefined' ? performance.now() : t0
    if ((now - t0) / 1000 > MAX_BATTLE_SEC) {
      finished = true
      return
    }

    for (let i = slashEffects.length - 1; i >= 0; i -= 1) {
      const fx = slashEffects[i]!
      fx.age += dt
      if (fx.age >= fx.ttl) slashEffects.splice(i, 1)
    }

    let killedThisStep = false
    const order = units.map((_, i) => i)
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[order[i], order[j]] = [order[j]!, order[i]!]
    }

    for (const idx of order) {
      const u = units[idx]!
      if (!u.alive) continue
      if (u.cooldown > 0) u.cooldown = Math.max(0, u.cooldown - dt)
      const target = nearestEnemy(u)
      if (!target) continue
      const dx = target.x - u.x
      const dy = target.y - u.y
      const dist = Math.hypot(dx, dy) || 0.001
      u.ang = Math.atan2(dy, dx)
      if (dist > ATTACK_R) {
        u.x += (dx / dist) * SPEED * dt
        u.y += (dy / dist) * SPEED * dt
        u.x = Math.max(8, Math.min(WORLD_W - 8, u.x))
        u.y = Math.max(8, Math.min(WORLD_H - 8, u.y))
      } else if (u.cooldown <= 0) {
        u.cooldown = COOLDOWN
        const mx = u.x + dx * 0.52
        const my = u.y + dy * 0.52
        const arcJitter = ((fnv1a(`${u.id}|${target.id}`) % 200) / 200 - 0.5) * 0.55
        slashEffects.push({
          x: mx,
          y: my,
          ang: u.ang + arcJitter,
          age: 0,
          ttl: target.invincible ? 0.14 : 0.2,
          color: u.squadColor,
        })
        const dmg = damageDealtToTarget(u, target)
        if (!target.invincible) {
          target.hp -= dmg
          if (target.hp <= 0) {
            target.alive = false
            killedThisStep = true
          }
        } else {
          const floor = heroHpFloor(target.maxHp)
          target.hp = Math.max(floor, target.hp - dmg)
        }
      }
    }

    if (killedThisStep) noKillTimer = 0
    else noKillTimer += dt

    if (noKillTimer > NO_KILL_NUDGE_SEC) {
      noKillTimer = 0
      for (const u of units) {
        if (!u.alive) continue
        u.x += (Math.random() - 0.5) * NUDGE_AMP
        u.y += (Math.random() - 0.5) * NUDGE_AMP
        u.x = Math.max(8, Math.min(WORLD_W - 8, u.x))
        u.y = Math.max(8, Math.min(WORLD_H - 8, u.y))
      }
    }

    checkVictory()
  }

  function cameraForCanvas(cssW: number, cssH: number): { cx: number; cy: number; scale: number } {
    const alive = aliveUnits()
    if (alive.length === 0) {
      return { cx: WORLD_W / 2, cy: WORLD_H / 2, scale: Math.min(cssW / WORLD_W, cssH / WORLD_H, 2.2) }
    }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const u of alive) {
      minX = Math.min(minX, u.x)
      minY = Math.min(minY, u.y)
      maxX = Math.max(maxX, u.x)
      maxY = Math.max(maxY, u.y)
    }
    const pad = 48
    const padTop = 62
    minX -= pad
    minY -= padTop
    maxX += pad
    maxY += pad
    const bw = Math.max(120, maxX - minX)
    const bh = Math.max(120, maxY - minY)
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const scale = Math.min(cssW / bw, cssH / bh)
    const clamped = Math.max(0.35, Math.min(2.2, scale))
    return { cx, cy, scale: clamped }
  }

  return {
    units,
    slashEffects,
    WORLD_W,
    WORLD_H,
    step,
    get finished() {
      return finished
    },
    cameraForCanvas,
  }
}

export type RaffleBattleSimulator = ReturnType<typeof createRaffleBattleSimulator>
