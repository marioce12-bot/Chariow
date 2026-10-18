import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/admin';
export async function GET() {
 const {admin,response}=await requireAdmin(); if(!admin)return response??NextResponse.json({error:'Accès administrateur requis.'},{status:403});
 const db=createAdminClient();
 const {data,error}=await db.from('app_feedback').select('id,user_id,rating,message,status,created_at,processed_at,reply,replied_at,replied_by').order('created_at',{ascending:false}).limit(500);
 if(error){console.error('admin feedback fetch failed',{code:error.code});return NextResponse.json({error:'Impossible de charger les retours.'},{status:500});}
 const ids=[...new Set((data??[]).map((x:any)=>x.user_id).filter((id:any):id is string=>typeof id==='string'))];
 const profilesById=new Map<string,any>();
 if(ids.length){const {data:profiles,error:profilesError}=await db.from('profiles').select('id,full_name,email').in('id',ids).limit(500);if(profilesError){console.error('admin feedback profile fetch failed',{code:profilesError.code});return NextResponse.json({error:'Impossible de charger les retours.'},{status:500});}for(const profile of profiles??[])profilesById.set(profile.id,profile);}
 const feedback=(data??[]).map((x:any)=>{const p=profilesById.get(x.user_id);const name=typeof p?.full_name==='string'&&p.full_name.trim()?p.full_name.trim():typeof p?.email==='string'&&p.email.trim()?p.email.trim():'Utilisateur inconnu';return {...x,author_name:name};});
 return NextResponse.json({feedback});
}
export async function PATCH(request:Request) {
 const {admin,user,response}=await requireAdmin(['super_admin','support']);if(!admin)return response??NextResponse.json({error:'Accès administrateur requis.'},{status:403});
 let body:unknown;try{body=await request.json()}catch{return NextResponse.json({error:'Requête invalide.'},{status:400});}
 if(!body||typeof body!=='object')return NextResponse.json({error:'Requête invalide.'},{status:400});
 const {id,status,reply}=body as {id?:unknown;status?:unknown;reply?:unknown};if(typeof id!=='string'||! /^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({error:'Identifiant invalide.'},{status:400});
 const db=createAdminClient();
 if(reply!==undefined){if(typeof reply!=='string'||!reply.trim()||reply.trim().length>2000)return NextResponse.json({error:'La réponse doit contenir entre 1 et 2 000 caractères.'},{status:400});const now=new Date().toISOString();const {data,error}=await db.from('app_feedback').update({reply:reply.trim(),replied_at:now,replied_by:user?.id??null,status:'processed',processed_at:now}).eq('id',id).select('id').maybeSingle();if(error){console.error('admin feedback reply failed',{code:error.code});return NextResponse.json({error:'Impossible d’envoyer cette réponse.'},{status:500});}if(!data)return NextResponse.json({error:'Retour introuvable.'},{status:404});return NextResponse.json({ok:true});}
 if(!['new','processed'].includes(String(status)))return NextResponse.json({error:'Statut invalide.'},{status:400});const {data,error}=await db.from('app_feedback').update({status,processed_at:status==='processed'?new Date().toISOString():null}).eq('id',id).select('id').maybeSingle();if(error){console.error('admin feedback update failed',{code:error.code});return NextResponse.json({error:'Impossible de mettre à jour ce retour.'},{status:500});}if(!data)return NextResponse.json({error:'Retour introuvable.'},{status:404});return NextResponse.json({ok:true});
}
