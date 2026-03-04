---
title: Getting started
description: What DecentraGuild is and how it works
---

# Getting started

## What is a dGuild?

A **dGuild** is an organization built for modern digital communities. It is your guildhall in the decentralized realm — governed by wallet, powered by modules, and deployed in minutes.

Every dGuild begins with the Admin module, your command chamber. From there, you activate additional modules from the Module Catalog to shape your guild’s economy, access control, rewards, and trading systems. Each module operates independently, with its own configuration and pricing, so every guild can build a stack that fits its strategy.

## What is a dGuild Custom (and DecentraGuild)?

A **dGuild Custom** is your organisation on the DecentraGuild platform. We provide the Web3 infrastructure and ready-made UI; you choose the modules, flows, and rules. DecentraGuild does not hold custody or control over your dGuild environment, now or in the future. You own and operate it.

Your dGuild has:

- Branding (logo, colours, theme)
- A dedicated subdomain (e.g. `skull.dguild.org`)
- Modules you enable (Admin, Market, Raffle, Whitelist, Discord)
- Your treasury and fee settings
- Admin access (currently a single wallet)

Members use your subdomain to interact with your dGuild. You decide which modules are active and how they are configured.

## Build Your Own

The offering is **Build Your Own**: choose which modules to enable, set your branding, and run your community using DecentraGuild’s modular Web3 stack. DecentraGuild handles the infrastructure; you control what happens inside your dGuild.

## Note on current implementation

Today, tenant identity and configuration are stored off-chain (JSON and Postgres) while modules interact with Solana on-chain where it makes sense (for assets, escrow, and verifiable state). The current architecture is hybrid by design, with more coordination and governance planned to move on-chain over time as the platform evolves.

## Quick start

1. **Create** — Connect your wallet, pay the registration fee, and set up your org.
2. **Configure** — Use Admin to enable modules, set branding, and configure Market or Discord.
3. **Operate** — Your community trades on the storefront and links wallets for Discord roles.
4. **Grow** — Add modules and adjust tiers as you scale.

See [Creating a dGuild](/docs/general/creating-a-dguild) for the step-by-step flow.
