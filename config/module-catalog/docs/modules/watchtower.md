# Watchtower

Watchtower provides per-mint tracking with three independently billable tracks: Current holders, Snapshot, and Transactions.

## Tracks

| Track | Price | What you get |
|-------|-------|--------------|
| **Current holders** | 5 USDC / mint / month | Short refresh rate (15min–6hr) for holder data. Usable in conditions, shipment, and Discord roles. |
| **Snapshot** | 5 USDC / mint / month | Daily holder snapshots. Powers analytics and future features. |
| **Transactions** | 20 USDC / mint / month | Transfer/mint/burn indexing. *Coming soon.* |

## How it works

1. **Add mints** — Use Admin > Address Book to add SPL tokens or NFT collections.
2. **Enable tracks** — In Admin > Watchtower, enable Current holders, Snapshot, or Transactions per mint.
3. **Review pricing** — The pricing widget updates in real time.
4. **Deploy** — Activate the module to start tracking.

## Current holders track

Mints with `track_holders = true` receive holder sync at short refresh intervals. This powers conditions, shipment eligibility, and Discord role rules. Enable it for mints used in those features.

## Member page

The Watchtower member page (`/watchtower`) shows holder snapshots and tracking results. Default visibility: admin-only; can be extended later.
