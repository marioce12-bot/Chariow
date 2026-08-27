import { Auth } from "@/components/Auth";
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return <Auth mode="login" configurationError={params.error === "configuration"} />;
}
