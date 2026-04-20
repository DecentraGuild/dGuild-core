export async function resizeImageFileToPngBlob(file: File, size: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('Canvas not supported')
  }
  const scale = Math.max(size / bitmap.width, size / bitmap.height)
  const dw = bitmap.width * scale
  const dh = bitmap.height * scale
  const dx = (size - dw) / 2
  const dy = (size - dh) / 2
  ctx.drawImage(bitmap, dx, dy, dw, dh)
  bitmap.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b)
        else reject(new Error('Failed to encode PNG'))
      },
      'image/png',
      0.92,
    )
  })
}
