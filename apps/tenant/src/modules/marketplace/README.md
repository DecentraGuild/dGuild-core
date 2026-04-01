C2C marketplace. Primary route: `/market`. Card size: `market-grid-scale` in localStorage (14–20rem). AssetCard: `--theme-font-sm` name, `--theme-font-xs` symbol/mint.

**Escrow entry points**

- In-app (browse, my trades, post-create): `/market` with query `escrow=<address>` (and optional `tab=open-trades`). Renders `EscrowDetailModal` wrapping `EscrowDetailPanel` (`variant="modal"`).
- Shared links: `/market/escrow/<address>` (optional `?tenant=` on single host). Full page `EscrowDetailPanel` (`variant="page"`); connect wallet does not depend on a nested dialog over the trade UI.

**Links**

- [`useMarketplaceEscrowLinks`](../../composables/marketplace/useMarketplaceEscrowLinks.ts): `escrowLink()` builds in-app `{ path: '/market', query }`; `shareUrl()` / `copyShareLink()` use `/market/escrow/:id`.
