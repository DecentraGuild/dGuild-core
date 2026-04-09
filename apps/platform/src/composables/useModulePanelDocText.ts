export function stripMarkdownForPanel(input: string): string {
  if (!input?.trim()) return ''
  return input
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s+[^\n]*\n?/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
