import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateFeedback } from '@/lib/feedback/validation';
export async function POST(request: Request) {
 const db = await createClient();
 const { data: { user }, error: authError } = await db.auth.getUser();
 if (authError || !user) return NextResponse.json({error:'Connectez-vous pour envoyer un retour.'},{status:401});
 let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({error:'Requête invalide.'},{status:400}); }
 const feedback = validateFeedback(body); if (!feedback) return NextResponse.json({error:'Note invalide ou commentaire trop long (2 000 caractères maximum).'}, {status:400});
 const { error } = await db.from('app_feedback').insert({user_id:user.id,...feedback});
 if (error) { console.error('feedback insert failed',{code:error.code}); return NextResponse.json({error:'Impossible d’enregistrer votre retour pour le moment.'},{status:500}); }
 return NextResponse.json({ok:true},{status:201});
}
