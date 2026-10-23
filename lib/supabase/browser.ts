import { assertRetentionIsolation } from "@/lib/account-retention-isolation";
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  assertRetentionIsolation();
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
