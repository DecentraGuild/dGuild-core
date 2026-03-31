export interface BattleSoldierSeed {
  id: string
  owner: string
  isWinnerSide: boolean
}

const WORLD_W = 960
const WORLD_H = 540
const SPEED = 90
const ATTACK_R = 16
const COOLDOWN = 0.4
const NO_KILL_NUDGE_SEC = 12
const MAX_BATTLE_SEC = 90
const NUDGE_AMP = 22

export interface SimUnit {
  id: string
  x: number
  y: number
  owner: string
  invincible: boolean
  cooldown: number
  alive: boolean
  ang: number
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

export function buildSoldierSeedsFromHolders(
  rows: { owner: string; tickets: bigint }[],
  winnerPubkey: string,
): BattleSoldierSeed[] {
  const out: BattleSoldierSeed[] = []
  let seq = 0
  for (const r of rows) {
    const n = Number(r.tickets)
    if (!Number.isFinite(n) || n < 1) continue
    const win = r.owner === winnerPubkey
    for (let i = 0; i < n; i++) {
      out.push({
        id: `u-${seq++}`,
        owner: r.owner,
        isWinnerSide: win,
      })
    }
  }
  return out
}

export function createRaffleBattleSimulator(seeds: BattleSoldierSeed[]) {
  const units: SimUnit[] = seeds.map((s, i) => {
    const { x, y } = spawnXY(i, seeds.length)
    return {
      id: s.id,
      x,
      y,
      owner: s.owner,
      invincible: s.isWinnerSide,
      cooldown: 0,
      alive: true,
      ang: 0,
    }
  })

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

  function nearestEnemy(u: SimUnit): SimUnit | null {
    let best: SimUnit | null = null
    let bestD = Infinity
    for (const v of units) {
      if (!v.alive || v.owner === u.owner) continue
      const dx = v.x - u.x
      const dy = v.y - u.y
      const d2 = dx * dx + dy * dy
      if (d2 < bestD) {
        bestD = d2
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
        if (!target.invincible) {
          target.alive = false
          killedThisStep = true
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
    minX -= pad
    minY -= pad
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
