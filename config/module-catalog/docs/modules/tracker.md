# Tracker

The Tracker module provides a centralised address book of SPL tokens and NFT collections for your dGuild. Admins add mints and assign a tracking tier that determines how deeply the platform monitors each asset.

## Tracking tiers

| Tier | Price | What you get |
|------|-------|-------------|
| **Base** | Free | Metadata only (name, symbol, image). |
| **Grow** | 5 USDC / mint / month | Weekly metadata refresh + daily holder snapshots. Powers holder-based Discord roles and future analytics. |
| **Pro** | 25 USDC / mint / month | Everything in Grow, plus transfer/mint/burn indexing. *Coming soon -- not selectable yet.* |

## How it works

1. **Add mints** -- Use the unified picker in Admin > Tracker to add SPL tokens or NFT collections by address.
2. **Set tier** -- Toggle holder tracking (Grow) per mint. Base is the default.
3. **Review pricing** -- The pricing widget updates in real time as you change tiers.
4. **Deploy** -- Activate the module to start tracking.

## App-wide integration

Once Tracker is active, every mint input in your dGuild (Marketplace, Discord, and future modules) can browse the address book. This ensures consistency and makes setup faster.

## Grow jobs

- **Metadata refresh**: Runs weekly for Grow (and Pro) mints. Keeps name, symbol, image, and traits up to date.
- **Holder snapshot**: Runs daily. Stores a point-in-time list of holder wallets per mint.
