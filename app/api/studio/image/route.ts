import { requireUser } from "@/lib/auth";
import { generateStudioImage } from "@/lib/studio/image-generation";

export const maxDuration = 300;

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => ({}));
  return generateStudioImage(user.id, body);
}
