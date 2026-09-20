import { AdminDashboard } from "@/components/AdminDashboard";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, isAdminSessionValid } from "@/lib/admin-password";

export default function AdminPage() {
  const session = cookies().then((store) => store.get(ADMIN_COOKIE)?.value);
  // The client console is protected by the same signed session as the API.
  // Redirect unauthenticated visitors to the password screen before rendering
  // the Supabase-admin fallback message.
  return <AdminGate session={session} />;
}

async function AdminGate({ session }: { session: Promise<string | undefined> }) {
  if (!isAdminSessionValid(await session)) redirect("/admin/login");
  return <AdminDashboard />;
}
