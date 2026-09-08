import { Marketing } from "@/components/Marketing";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getProofImages } from "@/lib/get-proof-images";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");
  const proofImages = getProofImages();
  return <Marketing proofImages={proofImages} />;
}
