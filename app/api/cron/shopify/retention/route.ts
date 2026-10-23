import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
async function run(request: Request) {
 const secret = process.env.CRON_SECRET;
 if (!secret || secret.length < 16) return NextResponse.json({error:"Cron non configuré"},{status:503});
 if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({error:"Unauthorized"},{status:401});
 try { const {data,error}=await createAdminClient().rpc("purge_shopify_sales_retention"); if(error) throw error; return NextResponse.json({deleted:Number(data)||0}); }
 catch { return NextResponse.json({error:"Retention purge failed"},{status:500}); }
}
