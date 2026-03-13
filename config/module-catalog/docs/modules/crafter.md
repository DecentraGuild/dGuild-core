# Crafter

Crafter lets you create SPL fungible tokens on Solana. One-time 5 USDC per token, then mint, burn, edit metadata, and close when supply is zero.

## What you can create

- Discord access passes
- Tournament tickets
- Any simple on-chain asset

Tokens use legacy SPL so they work with the marketplace escrow.

## Flow

1. **Create** — Fill name, symbol, decimals, description, image. Choose storage (DecentraGuild API or self-hosted URI). Pay 5 USDC. Token is created on-chain.
2. **Mint** — Add supply to any wallet.
3. **Burn** — Remove tokens from your ATA.
4. **Edit** — Update name, symbol, or image URI.
5. **Close** — When supply is zero, close the mint account to reclaim rent.

## Storage

- **DecentraGuild API** — We host the metadata JSON and image. Simplest option.
- **Self-hosted** — Provide your own HTTPS URI. Can point to Arweave, IPFS, or your server. We validate before creation.

Metadata URIs remain editable so you can change storage later.

## Pricing

5 USDC one-time per token. Mint, burn, and edit are free.
