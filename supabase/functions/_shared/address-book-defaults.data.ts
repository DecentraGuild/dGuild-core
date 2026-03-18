/**
 * Platform-wide defaults in every tenant Address Book (Admin).
 * Not the same list as marketplace base currencies (packages/core/src/currencies.ts).
 *
 * After editing, run: pnpm sync:address-book-defaults
 * Then commit supabase/functions/_shared/address-book-defaults.data.ts so seeding stays in sync.
 */
export const ADDRESS_BOOK_DEFAULT_MINTS_DATA = [
  {
    mint: 'So11111111111111111111111111111111111111112',
    kind: 'SPL' as const,
    name: 'Wrapped SOL',
    symbol: 'SOL',
  },
  {
    mint: '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',
    kind: 'SPL' as const,
    name: 'Wrapped Bitcoin (Portal)',
    symbol: 'WBTC',
  },
  {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    kind: 'SPL' as const,
    name: 'USD Coin',
    symbol: 'USDC',
  },
  {
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    kind: 'SPL' as const,
    name: 'Tether USD',
    symbol: 'USDT',
  },
] as const
