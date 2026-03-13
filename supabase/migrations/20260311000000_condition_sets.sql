-- Condition sets: tenant-scoped, reusable. Discord rules reference them.
-- Migrate from discord_role_conditions to condition_set_conditions.

-- ---------------------------------------------------------------------------
-- New tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.condition_sets (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenant_config(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_condition_sets_tenant ON public.condition_sets(tenant_id);

CREATE TABLE IF NOT EXISTS public.condition_set_conditions (
  id SERIAL PRIMARY KEY,
  condition_set_id INTEGER NOT NULL REFERENCES public.condition_sets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('HOLDING', 'TRAIT', 'DISCORD', 'WHITELIST')),
  payload JSONB NOT NULL DEFAULT '{}',
  logic_to_next TEXT CHECK (logic_to_next IS NULL OR logic_to_next IN ('AND', 'OR')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_condition_set_conditions_set ON public.condition_set_conditions(condition_set_id);

-- ---------------------------------------------------------------------------
-- Add condition_set_id to discord_role_rules
-- ---------------------------------------------------------------------------

ALTER TABLE public.discord_role_rules
  ADD COLUMN IF NOT EXISTS condition_set_id INTEGER REFERENCES public.condition_sets(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Backfill: create condition_set per rule, copy conditions, link rule
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r RECORD;
  c RECORD;
  new_set_id INTEGER;
  tenant_id_val TEXT;
BEGIN
  FOR r IN
    SELECT drr.id, drr.discord_guild_id, drr.discord_role_id
    FROM public.discord_role_rules drr
  LOOP
    SELECT ds.tenant_id INTO tenant_id_val
    FROM public.discord_servers ds
    WHERE ds.discord_guild_id = r.discord_guild_id
    LIMIT 1;

    IF tenant_id_val IS NULL THEN
      DELETE FROM public.discord_role_rules WHERE id = r.id;
      CONTINUE;
    END IF;

    INSERT INTO public.condition_sets (tenant_id, name, created_at, updated_at)
    VALUES (tenant_id_val, 'Rule for role ' || r.discord_role_id, NOW(), NOW())
    RETURNING id INTO new_set_id;

    INSERT INTO public.condition_set_conditions (condition_set_id, type, payload, logic_to_next, created_at)
    SELECT new_set_id, drc.type, drc.payload, drc.logic_to_next, NOW()
    FROM public.discord_role_conditions drc
    WHERE drc.role_rule_id = r.id;

    UPDATE public.discord_role_rules
    SET condition_set_id = new_set_id
    WHERE id = r.id;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Make condition_set_id NOT NULL, drop old table
-- ---------------------------------------------------------------------------

ALTER TABLE public.discord_role_rules
  ALTER COLUMN condition_set_id SET NOT NULL;

DROP TABLE IF EXISTS public.discord_role_conditions;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.condition_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condition_set_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "condition_sets_tenant_admin_all" ON public.condition_sets FOR ALL
  USING (public.is_tenant_admin(tenant_id))
  WITH CHECK (public.is_tenant_admin(tenant_id));

CREATE POLICY "condition_set_conditions_tenant_admin_all" ON public.condition_set_conditions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.condition_sets cs
      WHERE cs.id = condition_set_id AND public.is_tenant_admin(cs.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.condition_sets cs
      WHERE cs.id = condition_set_id AND public.is_tenant_admin(cs.tenant_id)
    )
  );
