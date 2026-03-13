/**
 * Ship wallet – create or import, store in IndexedDB.
 * Used only for signing compress transactions in Plan Shipment.
 */

import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'

const STORE_NAME = 'ship-wallet'
const DB_NAME = 'dguild-ship-wallet'
const KEY = 'secret'

let _db: IDBDatabase | null = null

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => {
      _db = req.result
      resolve(_db)
    }
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })
}

async function getStored(): Promise<string | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(KEY)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve((req.result as string) ?? null)
  })
}

async function setStored(secretBase58: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.put(secretBase58, KEY)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve()
  })
}

async function clearStored(): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.delete(KEY)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve()
  })
}

export function useShipWallet() {
  const hasWallet = ref(false)
  const address = ref<string | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      const stored = await getStored()
      hasWallet.value = !!stored
      if (stored) {
        const kp = Keypair.fromSecretKey(bs58.decode(stored))
        address.value = kp.publicKey.toBase58()
      } else {
        address.value = null
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load ship wallet'
      hasWallet.value = false
      address.value = null
    } finally {
      loading.value = false
    }
  }

  async function create() {
    loading.value = true
    error.value = null
    try {
      const kp = Keypair.generate()
      const secret = bs58.encode(kp.secretKey)
      await setStored(secret)
      hasWallet.value = true
      address.value = kp.publicKey.toBase58()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to create ship wallet'
    } finally {
      loading.value = false
    }
  }

  async function importWallet(secretBase58: string) {
    loading.value = true
    error.value = null
    try {
      const decoded = bs58.decode(secretBase58)
      if (decoded.length !== 64) throw new Error('Invalid secret key length')
      const kp = Keypair.fromSecretKey(decoded)
      await setStored(secretBase58)
      hasWallet.value = true
      address.value = kp.publicKey.toBase58()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Invalid private key'
    } finally {
      loading.value = false
    }
  }

  async function getKeypair(): Promise<Keypair | null> {
    const stored = await getStored()
    if (!stored) return null
    return Keypair.fromSecretKey(bs58.decode(stored))
  }

  async function exportSecret(): Promise<string | null> {
    return getStored()
  }

  async function remove() {
    await clearStored()
    hasWallet.value = false
    address.value = null
  }

  onMounted(() => load())

  return {
    hasWallet,
    address,
    loading,
    error,
    load,
    create,
    importWallet,
    getKeypair,
    exportSecret,
    remove,
  }
}
