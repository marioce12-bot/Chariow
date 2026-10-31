import { Auth } from "@/components/Auth";
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const missingSupabaseConfiguration = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return <Auth mode="login" configurationError={params.error === "configuration" || missingSupabaseConfiguration} />;
}
