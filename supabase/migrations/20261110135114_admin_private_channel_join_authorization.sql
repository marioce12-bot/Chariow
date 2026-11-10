-- Private channel authorization evaluates Broadcast/Presence, not postgres_changes.
-- A narrowly scoped Broadcast read permission permits the join. Postgres Changes
-- still applies the unchanged source-table RLS to every row. No client write grant.
ALTER POLICY "Vendeo users can join their notification channel"
ON realtime.messages TO authenticated USING (
  extension = 'broadcast'
  AND split_part((SELECT realtime.topic()), ':', 1) = 'user-notifications'
  AND split_part((SELECT realtime.topic()), ':', 2) = (SELECT auth.uid())::text
  AND split_part((SELECT realtime.topic()), ':', 3) ~ '^[0-9]+$'
  AND array_length(string_to_array((SELECT realtime.topic()), ':'), 1) = 3
);

ALTER POLICY "Vendeo store owners can join their sales channel"
ON realtime.messages TO authenticated USING (
  extension = 'broadcast'
  AND EXISTS (
    SELECT 1 FROM public.stores AS s
    WHERE s.user_id = (SELECT auth.uid())
      AND (SELECT realtime.topic()) = 'sales-events:' || s.id::text
  )
);

ALTER POLICY "Vendeo users can join studio generation channels"
ON realtime.messages TO authenticated USING (
  extension = 'broadcast'
  AND (
    (SELECT realtime.topic()) = 'studio-generation:user_id=eq.' || (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.studio_generations AS g
      WHERE g.user_id = (SELECT auth.uid())
        AND (SELECT realtime.topic()) = 'studio-generation:id=eq.' || g.id::text
    )
  )
);
