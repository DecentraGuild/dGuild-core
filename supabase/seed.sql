-- Generated from configs/tenants/*.json by scripts/generate-seed.mjs
-- Run: pnpm db:seed (or: node scripts/generate-seed.mjs && pnpm supabase db reset)
--
-- Platform owner: set PLATFORM_OWNER_WALLET env to match supabase/functions/.env
INSERT INTO public.platform_owner (wallet_address) VALUES ('4CJYmVAcBrgYL6iX4gUKSMeJxTm4hK3eNAzuzaYBZMCv')
ON CONFLICT (wallet_address) DO NOTHING;

INSERT INTO public.tenant_config (
  id,
  slug,
  name,
  description,
  discord_server_invite_link,
  default_gate,
  branding,
  modules,
  admins,
  treasury
) VALUES (
  '0000000',
  '',
  'Decentra Guild',
  'Decentra Guild Environment',
  NULL,
  NULL,
  '{"logo":"https://www.decentraguild.com/logo/dguild-logo.svg","theme":{"fonts":{"mono":["JetBrains Mono","Fira Code","monospace"],"primary":["Roboto","-apple-system","BlinkMacSystemFont","Segoe UI","sans-serif"]},"colors":{"text":{"muted":"#9090a2","primary":"#ffffff","secondary":"#c8c8d1"},"trade":{"buy":"#972020","sell":"#0b832f","swap":"#5c06b2","trade":"#95482d","buyHover":"#881d1d","buyLight":"#a74141","sellHover":"#0a762a","sellLight":"#30964e","swapHover":"#5305a0","swapLight":"#7d38c1","tradeHover":"#864129","tradeLight":"#a5634d"},"accent":{"main":"#5c06b2","hover":"#5305a0"},"border":{"light":"#462658","default":"#361349"},"status":{"info":"#1d859a","error":"#972020","success":"#0b832f","warning":"#95482d","destructive":"#3d0000"},"window":{"border":"#361349","header":"#1a1721","background":"#16121c"},"primary":{"dark":"#3f007e","main":"#4a0094","hover":"#440088","light":"#6e33a9"},"secondary":{"dark":"#30005e","main":"#38006f","hover":"#340066","light":"#60338c"},"background":{"card":"#16121c","muted":"#28282c","primary":"#0b0b0f","backdrop":"rgba(11, 11, 15, 0.78)","secondary":"#1a1721"}},"effects":{"pattern":"grid","patternSize":4,"glowIntensity":"subtle"},"shadows":{"card":"0 8px 32px rgba(0, 0, 0, 0.4)","glow":"0 0 20px rgba(74, 0, 148, 0.28)","glowHover":"0 0 40px rgba(74, 0, 148, 0.55)"},"spacing":{"lg":"1.425rem","md":"0.95rem","sm":"0.712rem","xl":"1.9rem","xs":"0.475rem","2xl":"2.85rem"},"fontSize":{"lg":"1.125rem","sm":"0.875rem","xl":"1.2375rem","xs":"0.7875rem","2xl":"1.40625rem","3xl":"1.6875rem","4xl":"1.96875rem","5xl":"2.25rem","base":"1rem"},"gradients":{"accent":"linear-gradient(135deg, #4a0094 0%, #38006f 100%)","primary":"linear-gradient(135deg, #4a0094 0%, #6e33a9 50%, #3f007e 100%)","secondary":"linear-gradient(135deg, #95482d 0%, #aa6d57 100%)"},"borderWidth":{"thin":"2px","thick":"8px","medium":"4px"},"borderRadius":{"lg":"1.25rem","md":"1rem","sm":"0.75rem","xl":"1.5rem","full":"9999px"}}}'::jsonb,
  '{"slug":{"state":"off","settingsjson":{},"deactivatedate":null,"deactivatingUntil":null},"admin":{"state":"active","settingsjson":{},"deactivatedate":null,"deactivatingUntil":null},"discord":{"state":"off","settingsjson":{},"deactivatedate":null,"deactivatingUntil":null},"raffles":{"state":"off","settingsjson":{},"deactivatedate":null,"deactivatingUntil":null},"gates":{"state":"off","settingsjson":{},"deactivatedate":null,"deactivatingUntil":null},"watchtower":{"state":"off","settingsjson":{},"deactivatedate":null,"deactivatingUntil":null},"marketplace":{"state":"off","settingsjson":{},"deactivatedate":null,"deactivatingUntil":null}}'::jsonb,
  '["89s4gjt2STRy83XQrxmYrWRkQBH3CL228BRVs6Qbed2Q","adm1rpWxyo8u9y2Q2wxxfqaVDLE2gD1N9PbZbbhokTP"]'::jsonb,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  slug = EXCLUDED.slug,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  branding = EXCLUDED.branding,
  modules = EXCLUDED.modules,
  admins = EXCLUDED.admins,
  updated_at = NOW();
