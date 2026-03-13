# Shipment

Shipment lets you create recipient lists and airdrop tokens using ZK compression. Build lists from conditions or paste JSON, then ship from a dedicated ship wallet.

## Admin tabs

| Tab | Purpose |
|-----|---------|
| **Shipment List** | Generate JSON from condition sets + snapshot, or paste/edit JSON manually. |
| **Plan Shipment** | Load JSON, set up ship wallet, fund it, and execute the airdrop. |

## Two-wallet flow

- **Main wallet (Phantom, etc.)** — Admin auth and funding the ship wallet.
- **Ship wallet** — Create new or import. Stored locally in IndexedDB. Used only to sign the compress transaction. No plugin needed for the ship step.

## Flow

1. **Setup** — Create or import ship wallet in Plan Shipment. Store in IndexedDB. Show address.
2. **Funding** — Send SOL and tokens from main wallet to ship address.
3. **Ship** — Load keypair from IndexedDB, build tx, sign in-page, submit. No plugin.

## Member page

The Shipments page (`/shipment`) shows compressed tokens received by the connected wallet. Members can decompress received tokens to their wallet.

## Pricing

Pricing is per recipient (placeholder: 0 USDC per recipient; future: 5 USDC).
