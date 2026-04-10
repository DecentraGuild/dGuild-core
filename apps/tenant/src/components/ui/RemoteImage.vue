<template>
  <div ref="rootEl" class="remote-image" :class="rootClass">
    <img
      v-if="showImg"
      :src="committedSrc"
      :alt="alt"
      :class="imgClass"
      :referrerpolicy="referrerPolicy"
      decoding="async"
      loading="lazy"
      @error="onImgTagError"
    />
    <div v-show="!showImg" class="remote-image__placeholder">
      <slot name="placeholder" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { acquireRemoteImageSlot, releaseRemoteImageSlot } from '~/utils/remoteImageQueue'

const props = withDefaults(
  defineProps<{
    src: string | null | undefined
    alt: string
    imgClass?: string
    rootClass?: string
    referrerPolicy?: '' | 'no-referrer' | 'no-referrer-when-downgrade'
    rootMargin?: string
    maxRetries?: number
  }>(),
  {
    referrerPolicy: 'no-referrer',
    rootMargin: '200px',
    maxRetries: 4,
  },
)

const rootEl = ref<HTMLElement | null>(null)
const committedSrc = ref<string | null>(null)
const loadOk = ref(false)
const cancelled = ref(false)

let io: IntersectionObserver | null = null

const showImg = computed(() => loadOk.value && Boolean(committedSrc.value?.trim()))

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function reset() {
  loadOk.value = false
  committedSrc.value = null
}

async function loadUrl(url: string): Promise<void> {
  const trimmed = url.trim()
  if (!trimmed) throw new Error('empty')
  if (/^(data:|blob:)/i.test(trimmed)) {
    committedSrc.value = trimmed
    loadOk.value = true
    return
  }

  const retries = Math.max(1, props.maxRetries ?? 4)
  const backoffs = [0, 400, 1000, 2200, 4000]

  for (let attempt = 0; attempt < retries; attempt++) {
    if (cancelled.value) throw new Error('cancelled')
    if (attempt > 0) await delay(backoffs[Math.min(attempt, backoffs.length - 1)] ?? 600)
    if (cancelled.value) throw new Error('cancelled')

    await acquireRemoteImageSlot()
    try {
      if (cancelled.value) {
        releaseRemoteImageSlot()
        throw new Error('cancelled')
      }

      await new Promise<void>((resolve, reject) => {
        const img = new Image()
        if (props.referrerPolicy) img.referrerPolicy = props.referrerPolicy
        const done = () => {
          img.removeEventListener('load', onLoad)
          img.removeEventListener('error', onErr)
        }
        const onLoad = () => {
          done()
          resolve()
        }
        const onErr = () => {
          done()
          reject(new Error('preload failed'))
        }
        img.addEventListener('load', onLoad)
        img.addEventListener('error', onErr)
        img.src = trimmed
      })

      releaseRemoteImageSlot()

      if (cancelled.value) throw new Error('cancelled')
      committedSrc.value = trimmed
      await nextTick()
      loadOk.value = true
      return
    } catch {
      releaseRemoteImageSlot()
      if (attempt === retries - 1) break
    }
  }
  throw new Error('failed')
}

async function runLoad() {
  const url = props.src?.trim()
  if (!url) {
    reset()
    return
  }
  reset()
  try {
    await loadUrl(url)
  } catch {
    if (!cancelled.value) {
      loadOk.value = false
      committedSrc.value = null
    }
  }
}

function onImgTagError() {
  loadOk.value = false
  committedSrc.value = null
}

function disconnectIo() {
  io?.disconnect()
  io = null
}

function connectIo() {
  disconnectIo()
  const el = rootEl.value
  const url = props.src?.trim()
  if (!el || !url) return

  if (typeof IntersectionObserver === 'undefined') {
    void runLoad()
    return
  }

  io = new IntersectionObserver(
    (entries) => {
      const e = entries[0]
      if (e?.isIntersecting) {
        disconnectIo()
        void runLoad()
      }
    },
    { root: null, rootMargin: props.rootMargin, threshold: 0.01 },
  )
  io.observe(el)
}

watch(
  () => props.src,
  () => {
    reset()
    disconnectIo()
    void nextTick(() => connectIo())
  },
)

watch(
  rootEl,
  (el) => {
    if (el && props.src?.trim()) connectIo()
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  cancelled.value = true
  disconnectIo()
})
</script>

<style scoped>
.remote-image {
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.remote-image__placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
