import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const sql = readFileSync(new URL('../../supabase/migrations/20261018050000_app_feedback.sql', import.meta.url), 'utf8').toLowerCase();
describe('app_feedback RLS migration', () => {
 it('enables RLS and restricts inserts and reads to their owner', () => {
  expect(sql).toContain('enable row level security');
  expect(sql).toContain('for insert to authenticated with check (auth.uid() = user_id)');
  expect(sql).toContain('for select to authenticated using (auth.uid() = user_id)');
 });
 it('limits administrative read and status update to active admins', () => {
  expect(sql).toContain('a.user_id = auth.uid() and a.is_active = true');
  expect(sql).toContain('for update to authenticated');
  expect(sql).toContain("status in ('new','processed')");
 });
});
