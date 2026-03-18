import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'packages/core/src/address-book-defaults.data.ts')
const dest = path.join(root, 'supabase/functions/_shared/address-book-defaults.data.ts')
fs.copyFileSync(src, dest)
process.stdout.write(`Synced ${path.relative(root, dest)}\n`)
