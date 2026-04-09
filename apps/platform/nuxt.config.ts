import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const uiVarsCss = path.resolve(dirname, '../../packages/ui/src/theme/vars.css')
const anchorBrowser = path.resolve(dirname, '../../node_modules/@coral-xyz/anchor/dist/browser/index.js')

export default defineNuxtConfig({
  srcDir: 'src',
  compatibilityDate: '2025-02-10',
  experimental: { clientNodeCompat: true },
  app: {
    head: {
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
  modules: ['@nuxtjs/tailwindcss', '@pinia/nuxt', 'shadcn-nuxt'],
  shadcn: {
    prefix: '',
    componentDir: './src/components/ui',
  },
  css: [uiVarsCss, '~/assets/global.css', '~/assets/platform-theme.css'],
  plugins: ['~/plugins/buffer.server', '~/plugins/buffer.client', '@decentraguild/auth/plugin.client'],
  routeRules: {
    '/modules': { redirect: { to: '/', statusCode: 301 } },
  },
  nitro: {
    preset: 'static',
    prerender: {
      routes: [
        '/',
        '/discover',
        '/docs',
        '/docs/general/getting-started',
        '/docs/general/creating-a-dguild',
        '/docs/general/directory',
        '/docs/general/billing-overview',
        '/docs/general/price-list',
        '/docs/modules/admin',
        '/docs/modules/admin/domains-and-slugs',
        '/docs/modules/marketplace',
        '/docs/modules/marketplace/how-it-works',
        '/docs/modules/marketplace/collections-currencies',
        '/docs/modules/marketplace/fees-tiers',
        '/docs/modules/discord',
        '/docs/modules/discord/verify-flow',
        '/docs/modules/discord/setup',
      ],
      failOnError: false,
    },
  },
  build: {
    transpile: ['@decentraguild/ui', '@decentraguild/auth', '@decentraguild/web3', '@decentraguild/contracts', '@decentraguild/catalog'],
  },
  vite: {
    plugins: [
      // vite-plugin-node-polyfills vs Nuxt's bundled Vite: duplicate Plugin typings in pnpm.
      nodePolyfills({
        include: ['buffer'],
        globals: { Buffer: true },
      }) as never,
    ],
    server: {
      hmr: { port: 3000, clientPort: 3000 },
    },
    resolve: {
      alias: { '@coral-xyz/anchor': anchorBrowser },
    },
    optimizeDeps: {
      include: ['buffer'],
    },
    ssr: {
      noExternal: ['buffer'],
    },
  },
  devServer: {
    port: 3000,
  },
  runtimeConfig: {
    public: {
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL ?? '',
      supabaseAnonKey: process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      heliusRpc: process.env.NUXT_PUBLIC_HELIUS_RPC ?? '',
      tenantBaseDomain: process.env.NUXT_PUBLIC_TENANT_BASE_DOMAIN ?? 'dguild.org',
      tenantAppHost: process.env.NUXT_PUBLIC_TENANT_APP_HOST ?? 'dapp.dguild.org',
      platformDocsUrl: process.env.NUXT_PUBLIC_PLATFORM_DOCS_URL ?? 'https://dguild.org/docs',
      explorerTxUrl: process.env.NUXT_PUBLIC_EXPLORER_TX_URL ?? 'https://solscan.io/tx',
      explorerAccountUrl: process.env.NUXT_PUBLIC_EXPLORER_ACCOUNT_URL ?? 'https://solscan.io/account',
      explorerTokenUrl: process.env.NUXT_PUBLIC_EXPLORER_TOKEN_URL ?? 'https://solscan.io/token',
      appUrl: process.env.NUXT_PUBLIC_APP_URL ?? '',
      walletConnectProjectId: process.env.NUXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '',
    },
  },
})
