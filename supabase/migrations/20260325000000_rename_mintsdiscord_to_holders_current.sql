-- Rename mintsDiscord to holders_current in billing_subscriptions (pricing engine scope/condition keys).

UPDATE billing_subscriptions
SET
  scope_key = 'holders_current',
  conditions_snapshot = jsonb_build_object(
    'holders_current',
    to_jsonb(COALESCE((conditions_snapshot->>'mintsDiscord')::numeric, 0))
  )
WHERE module_id = 'watchtower'
  AND scope_key = 'mintsDiscord';
