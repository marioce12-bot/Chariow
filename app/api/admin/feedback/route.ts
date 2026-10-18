import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/admin';
export async function GET() {
 const {admin,response}=await requireAdmin(); if(!admin) return response ?? NextResponse.json({error:'Accès administrateur requis.'},{status:403});
 const {data,error}=await createAdminClient().from('app_feedback').select('id,user_id,rating,message,status,created_at,processed_at').order('created_at',{ascending:false}).limit(500);
 if(error){console.error('admin feedback fetch failed',{code:error.code});return NextResponse.json({error:'Impossible de charger les retours.'},{status:500});}
 return NextResponse.json({feedback:data ?? []});
}
export async function PATCH(request:Request) {
 const {admin,response}=await requireAdmin(); if(!admin) return response ?? NextResponse.json({error:'Accès administrateur requis.'},{status:403});
 let body:unknown; try{body=await request.json()}catch{return NextResponse.json({error:'Requête invalide.'},{status:400});}
 if(!body||typeof body!=='object') return NextResponse.json({error:'Requête invalide.'},{status:400});
 const {id,status}=body as {id?:unknown;status?:unknown}; if(typeof id!=='string'||! /^[0-9a-f-]{36}$/i.test(id)||!['new','processed'].includes(String(status))) return NextResponse.json({error:'Identifiant ou statut invalide.'},{status:400});
 const {data,error}=await createAdminClient().from('app_feedback').update({status,processed_at:status==='processed'?new Date().toISOString():null}).eq('id',id).select('id').maybeSingle();
 if(error){console.error('admin feedback update failed',{code:error.code});return NextResponse.json({error:'Impossible de mettre à jour ce retour.'},{status:500});} if(!data)return NextResponse.json({error:'Retour introuvable.'},{status:404}); return NextResponse.json({ok:true});
}
