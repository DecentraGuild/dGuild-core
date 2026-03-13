# Watchtower

Watchtower provides per-mint tracking with three independently billable tracks: Discord, Snapshot, and Transactions.

## Tracks

| Track | Price | What you get |
|-------|-------|--------------|
| **Discord** | 5 USDC / mint / month | 15min–6hr holder sync for Discord role rules. Required for mints used in SPL/NFT role conditions. |
| **Snapshot** | 5 USDC / mint / month | Daily holder snapshots. Powers analytics and future features. |
| **Transactions** | 20 USDC / mint / month | Transfer/mint/burn indexing. *Coming soon.* |

## How it works

1. **Add mints** — Use Admin > Address Book to add SPL tokens or NFT collections.
2. **Enable tracks** — In Admin > Watchtower, enable Discord, Snapshot, or Transactions per mint.
3. **Review pricing** — The pricing widget updates in real time.
4. **Deploy** — Activate the module to start tracking.

## Discord track requirement

For SPL and NFT role rules in Discord, mints must have `track_discord = true`. Only Discord-tracked mints receive the holder sync that powers role assignments.

## Member page

The Watchtower member page (`/watchtower`) shows holder snapshots and tracking results. Default visibility: admin-only; can be extended later.
