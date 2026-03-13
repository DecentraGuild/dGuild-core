-- Rename discord_holder_snapshots to holder_current (current holder snapshot per mint).
-- Breaking: no backward compatibility.

ALTER TABLE public.discord_holder_snapshots RENAME TO holder_current;
ALTER TABLE public.holder_current RENAME COLUMN asset_id TO mint;

DROP INDEX IF EXISTS public.idx_discord_holder_snapshots_updated;
CREATE INDEX IF NOT EXISTS idx_holder_current_updated ON public.holder_current(last_updated);
