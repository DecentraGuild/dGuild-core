import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function disc(s) {
  return [...crypto.createHash('sha256').update(s).digest().subarray(0, 8)]
}

const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const ASSOCIATED = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
const SYSTEM = '11111111111111111111111111111111'

const escrowTypes = [
  {
    name: 'Escrow',
    type: {
      kind: 'struct',
      fields: [
        { name: 'maker', type: 'pubkey' },
        { name: 'deposit_token', type: 'pubkey' },
        { name: 'request_token', type: 'pubkey' },
        { name: 'tokens_deposit_init', type: 'u64' },
        { name: 'tokens_deposit_remaining', type: 'u64' },
        { name: 'price', type: 'f64' },
        { name: 'decimals', type: 'i16' },
        { name: 'slippage', type: 'f32' },
        { name: 'seed', type: 'u64' },
        { name: 'auth_bump', type: 'u8' },
        { name: 'vault_bump', type: 'u8' },
        { name: 'escrow_bump', type: 'u8' },
        { name: 'expire_timestamp', type: 'i64' },
        { name: 'recipient', type: 'pubkey' },
        { name: 'only_recipient', type: 'bool' },
        { name: 'only_whitelist', type: 'bool' },
        { name: 'allow_partial_fill', type: 'bool' },
        { name: 'whitelist', type: 'pubkey' },
      ],
    },
  },
]

const escrowPdaEscrowInit = {
  seeds: [
    { kind: 'const', value: [...Buffer.from('escrow')] },
    { kind: 'account', path: 'maker' },
    { kind: 'arg', path: 'seed' },
  ],
}
// cancel/exchange: escrow address is supplied by the client (seed lives in account data).
const escrowPdaAuth = {
  seeds: [
    { kind: 'const', value: [...Buffer.from('auth')] },
    { kind: 'account', path: 'escrow' },
  ],
}
const escrowPdaVault = {
  seeds: [
    { kind: 'const', value: [...Buffer.from('vault')] },
    { kind: 'account', path: 'escrow' },
  ],
}

const escrowIdl = {
  version: '0.30.1',
  name: 'escrow_service',
  address: 'esccxeEDYUXQaeMwq1ZwWAvJaHVYfsXNva13JYb2Chs',
  metadata: {
    name: 'escrow_service',
    version: '0.1.0',
    spec: '0.1.0',
    description: 'DecentraGuild escrow (IDL upgraded for Anchor 0.30 client)',
  },
  instructions: [
    {
      name: 'initialize',
      discriminator: disc('global:initialize'),
      accounts: [
        { name: 'maker', writable: true, signer: true },
        { name: 'maker_ata', writable: true },
        { name: 'recipient', optional: true },
        { name: 'deposit_token' },
        { name: 'request_token' },
        { name: 'auth', pda: escrowPdaAuth },
        { name: 'vault', writable: true, pda: escrowPdaVault },
        { name: 'escrow', writable: true, pda: escrowPdaEscrowInit },
        { name: 'token_program', address: TOKEN },
        { name: 'associated_token_program', address: ASSOCIATED },
        { name: 'system_program', address: SYSTEM },
        { name: 'fee', writable: true },
        { name: 'whitelist_program', optional: true },
        { name: 'whitelist', optional: true },
        { name: 'entry', optional: true },
      ],
      args: [
        { name: 'seed', type: 'u64' },
        { name: 'deposit_amount', type: 'u64' },
        { name: 'request_amount', type: 'u64' },
        { name: 'expire_timestamp', type: 'i64' },
        { name: 'allow_partial_fill', type: 'bool' },
        { name: 'only_whitelist', type: 'bool' },
        { name: 'slippage', type: 'f32' },
      ],
    },
    {
      name: 'cancel',
      discriminator: disc('global:cancel'),
      accounts: [
        { name: 'maker', writable: true, signer: true },
        { name: 'maker_ata', writable: true },
        { name: 'deposit_token' },
        { name: 'maker_ata_request' },
        { name: 'maker_token_request' },
        { name: 'auth', pda: escrowPdaAuth },
        { name: 'vault', writable: true, pda: escrowPdaVault },
        { name: 'escrow', writable: true },
        { name: 'token_program', address: TOKEN },
        { name: 'associated_token_program', address: ASSOCIATED },
        { name: 'system_program', address: SYSTEM },
      ],
      args: [],
    },
    {
      name: 'exchange',
      discriminator: disc('global:exchange'),
      accounts: [
        { name: 'maker', writable: true },
        { name: 'maker_receive_ata', writable: true },
        { name: 'deposit_token' },
        { name: 'taker', writable: true, signer: true },
        { name: 'taker_ata', writable: true },
        { name: 'taker_receive_ata', writable: true },
        { name: 'request_token' },
        { name: 'auth', pda: escrowPdaAuth },
        { name: 'vault', writable: true, pda: escrowPdaVault },
        { name: 'escrow', writable: true },
        { name: 'token_program', address: TOKEN },
        { name: 'associated_token_program', address: ASSOCIATED },
        { name: 'system_program', address: SYSTEM },
        { name: 'fee', writable: true },
        { name: 'whitelist_program', optional: true },
        { name: 'whitelist', optional: true },
        { name: 'entry', optional: true },
      ],
      args: [{ name: 'amount', type: 'u64' }],
    },
  ],
  accounts: [{ name: 'Escrow', discriminator: disc('account:Escrow') }],
  types: escrowTypes,
  errors: [
    { code: 6000, name: 'AuthBumpError', msg: 'Unable to get auth bump' },
    { code: 6001, name: 'VaultBumpError', msg: 'Unable to get vault bump' },
    { code: 6002, name: 'EscrowBumpError', msg: 'Unable to get escrow bump' },
    { code: 6003, name: 'EscrowNotEnoughRemaining', msg: 'Escrow has not enough funds reamining' },
    { code: 6004, name: 'EscrowRecipientError', msg: 'Wrong recipient input' },
    { code: 6005, name: 'EscrowFeeError', msg: 'Wrong fee account input' },
    { code: 6006, name: 'EscrowMinimumError', msg: 'Wrong minimum' },
    { code: 6007, name: 'EscrowPartialFillNotAllowed', msg: 'Partial fill is not allowed' },
    { code: 6008, name: 'EscrowTimestampExpired', msg: 'Timestamp expired' },
    { code: 6009, name: 'WrongWhitelistProvided', msg: 'Wrong whitelist is provided' },
    { code: 6010, name: 'DecimalPrecisionLoss', msg: 'Decimal precision loss' },
    { code: 6011, name: 'SlippageLimitExceeded', msg: 'Slippage limit exceeded' },
    { code: 6012, name: 'ConvertToFloat', msg: 'Error converting to float' },
  ],
}

const whitelistTypes = [
  {
    name: 'Whitelist',
    docs: ['Account: Whitelist'],
    type: {
      kind: 'struct',
      fields: [
        { name: 'authority', type: 'pubkey' },
        { name: 'name', type: 'string' },
        { name: 'has_childs', type: 'bool' },
        { name: 'access_count', type: 'u32' },
      ],
    },
  },
  {
    name: 'WhitelistEntry',
    docs: ['Account: WhitelistEntry'],
    type: {
      kind: 'struct',
      fields: [
        { name: 'parent', type: 'pubkey' },
        { name: 'whitelisted', type: 'pubkey' },
      ],
    },
  },
]

const whitelistPdaListInit = {
  seeds: [
    { kind: 'account', path: 'signer' },
    { kind: 'arg', path: 'name' },
  ],
}
const whitelistPdaListDelete = {
  seeds: [
    { kind: 'account', path: 'authority' },
    { kind: 'arg', path: 'name' },
  ],
}
const whitelistPdaEntry = {
  seeds: [
    { kind: 'arg', path: 'account_to_add' },
    { kind: 'account', path: 'whitelist' },
  ],
}
const whitelistPdaEntryRemove = {
  seeds: [
    { kind: 'arg', path: 'account_to_delete' },
    { kind: 'account', path: 'whitelist' },
  ],
}

const whitelistIdl = {
  version: '0.30.1',
  name: 'whitelist',
  address: 'whi5uDPWK4rAE9Sus6hdxdHwsG1hjDBn6kXM6pyqwTn',
  metadata: {
    name: 'whitelist',
    version: '0.1.0',
    spec: '0.1.0',
    description: 'DecentraGuild whitelist (IDL upgraded for Anchor 0.30 client)',
  },
  instructions: [
    {
      name: 'initialize',
      discriminator: disc('global:initialize'),
      accounts: [
        { name: 'whitelist', writable: true, pda: whitelistPdaListInit },
        { name: 'signer', writable: true, signer: true },
        { name: 'system_program', address: SYSTEM },
      ],
      args: [{ name: 'name', type: 'string' }],
    },
    {
      name: 'add_to_whitelist',
      discriminator: disc('global:add_to_whitelist'),
      accounts: [
        { name: 'entry', writable: true, pda: whitelistPdaEntry },
        { name: 'whitelist', writable: true },
        { name: 'authority', writable: true, signer: true },
        { name: 'system_program', address: SYSTEM },
      ],
      args: [{ name: 'account_to_add', type: 'pubkey' }],
    },
    {
      name: 'remove_from_whitelist',
      discriminator: disc('global:remove_from_whitelist'),
      accounts: [
        { name: 'entry', writable: true, pda: whitelistPdaEntryRemove },
        { name: 'whitelist', writable: true },
        { name: 'authority', writable: true, signer: true },
      ],
      args: [{ name: 'account_to_delete', type: 'pubkey' }],
    },
    {
      name: 'delete_whitelist',
      discriminator: disc('global:delete_whitelist'),
      accounts: [
        { name: 'whitelist', writable: true, pda: whitelistPdaListDelete },
        { name: 'authority', writable: true, signer: true },
      ],
      args: [{ name: 'name', type: 'string' }],
    },
  ],
  accounts: [
    { name: 'Whitelist', discriminator: disc('account:Whitelist') },
    { name: 'WhitelistEntry', discriminator: disc('account:WhitelistEntry') },
  ],
  types: whitelistTypes,
  errors: [
    { code: 6000, name: 'WhitelistStillHasChilds', msg: 'The whitelist still has childs' },
    { code: 6001, name: 'AccountsNoRemovable', msg: 'Can not remove the specified account' },
  ],
}

const idlDir = path.join(__dirname, '../src/idl')
fs.writeFileSync(path.join(idlDir, 'escrow_service.json'), JSON.stringify(escrowIdl, null, 2))
fs.writeFileSync(path.join(idlDir, 'whitelist.json'), JSON.stringify(whitelistIdl, null, 2))
console.log('Wrote escrow_service.json and whitelist.json')
