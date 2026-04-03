import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import { useTenantStore } from '~/stores/tenant'

const STORE_NAME = 'ship-wallet'
const DB_NAME = 'dguild-ship-wallet'
const DB_VERSION = 3
const LEGACY_KEY = 'secret'

let _db: IDBDatabase | null = null

function isValidTenantScope(id: string | null | undefined): id is string {
  return typeof id === 'string' && id.trim().length > 0
}

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
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

function readKey(db: IDBDatabase, key: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(key)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve((req.result as string) ?? null)
  })
}

async function getStored(tenantId: string): Promise<string | null> {
  const db = await openDb()
  const primary = await readKey(db, tenantId)
  if (primary) return primary
  const legacy = await readKey(db, LEGACY_KEY)
  if (typeof legacy === 'string' && legacy.length > 0) {
    await setStored(tenantId, legacy)
    await clearStoredKey(db, LEGACY_KEY)
    return legacy
  }
  return null
}

async function clearStoredKey(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.objectStore(STORE_NAME).delete(key)
  })
}

async function setStored(tenantId: string, secretBase58: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.objectStore(STORE_NAME).put(secretBase58, tenantId)
  })
}

async function clearStored(tenantId: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.objectStore(STORE_NAME).delete(tenantId)
  })
}

export function useShipWallet() {
  const tenantStore = useTenantStore()
  const hasWallet = ref(false)
  const address = ref<string | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const id = tenantStore.tenantId
    if (!isValidTenantScope(id)) {
      hasWallet.value = false
      address.value = null
      loading.value = false
      return
    }
    try {
      const stored = await getStored(id)
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
    const id = tenantStore.tenantId
    if (!isValidTenantScope(id)) {
      error.value = 'Tenant not loaded'
      return
    }
    loading.value = true
    error.value = null
    try {
      const kp = Keypair.generate()
      const secret = bs58.encode(kp.secretKey)
      await setStored(id, secret)
      hasWallet.value = true
      address.value = kp.publicKey.toBase58()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to create ship wallet'
    } finally {
      loading.value = false
    }
  }

  async function importWallet(secretBase58: string) {
    const id = tenantStore.tenantId
    if (!isValidTenantScope(id)) {
      error.value = 'Tenant not loaded'
      return
    }
    loading.value = true
    error.value = null
    try {
      const decoded = bs58.decode(secretBase58)
      if (decoded.length !== 64) throw new Error('Invalid secret key length')
      const kp = Keypair.fromSecretKey(decoded)
      await setStored(id, secretBase58)
      hasWallet.value = true
      address.value = kp.publicKey.toBase58()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Invalid private key'
    } finally {
      loading.value = false
    }
  }

  async function getKeypair(): Promise<Keypair | null> {
    const id = tenantStore.tenantId
    if (!isValidTenantScope(id)) return null
    const stored = await getStored(id)
    if (!stored) return null
    return Keypair.fromSecretKey(bs58.decode(stored))
  }

  async function exportSecret(): Promise<string | null> {
    const id = tenantStore.tenantId
    if (!isValidTenantScope(id)) return null
    return getStored(id)
  }

  async function remove() {
    const id = tenantStore.tenantId
    if (!isValidTenantScope(id)) return
    await clearStored(id)
    hasWallet.value = false
    address.value = null
  }

  const scopedToTenant = computed(() => Boolean(tenantStore.tenant?.id))

  watch(
    () => tenantStore.tenantId,
    () => {
      void load()
    },
    { immediate: true }
  )

  return {
    hasWallet,
    address,
    loading,
    error,
    scopedToTenant,
    load,
    create,
    importWallet,
    getKeypair,
    exportSecret,
    remove,
  }
}
