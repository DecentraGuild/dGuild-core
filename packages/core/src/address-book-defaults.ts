import { ADDRESS_BOOK_DEFAULT_MINTS_DATA } from './address-book-defaults.data.js'

export type AddressBookDefaultMint = (typeof ADDRESS_BOOK_DEFAULT_MINTS_DATA)[number]

export const ADDRESS_BOOK_DEFAULT_MINTS: readonly AddressBookDefaultMint[] = ADDRESS_BOOK_DEFAULT_MINTS_DATA
