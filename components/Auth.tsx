"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export function Auth({ mode, configurationError = false }: { mode: "login" | "register"; configurationError?: boolean }) {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const register = mode === "register";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const fullName = String(form.get("fullName") ?? "");
    const supabase = createClient();
    const result = register
      ? await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) { setError(result.error.message); return; }
    if (register && !result.data.session) {
      setSubmitted(true);
      return;
    }
    window.location.href = "/dashboard";
  }
  return <main className="auth-page"><div className="auth-card"><Link href="/" className="brand"><Image className="brand-logo" src="/vendeo-logo-light.svg" alt="Vendeo" width={150} height={40}/><span className="brand-name">Vendeo <span>/ studio</span></span></Link><h1>{register ? "Crée ton espace." : "Content de te revoir."}</h1><p>{register ? "Ton business mérite mieux que des suppositions." : "Retrouve tes données et ton prochain bon move."}</p>{configurationError&&<p style={{background:'#fff1f2',borderRadius:7,color:'#be123c',fontSize:12,lineHeight:1.5,padding:10}}>La connexion Supabase n’est pas configurée sur Vercel. Ajoute les variables d’environnement puis redéploie.</p>}{submitted ? <div style={{background:'#e9f5ff',borderRadius:8,color:'#123e75',fontSize:13,lineHeight:1.6,padding:16}}>Un email de confirmation vient de t’être envoyé. Confirme ton adresse pour accéder à ton espace.</div> : <form onSubmit={submit}>{register&&<div className="form-group"><label>Ton prénom</label><input name="fullName" required placeholder="Aïcha"/></div>}<div className="form-group"><label>Email professionnel</label><input name="email" required type="email" placeholder="toi@exemple.com"/></div><div className="form-group"><label>Mot de passe</label><input name="password" required type="password" placeholder="8 caractères minimum" minLength={8}/></div>{register&&<label style={{display:'flex',alignItems:'start',gap:8,color:'#64748b',fontSize:11,margin:'18px 0'}}><input type="checkbox" required style={{marginTop:2}}/> J'accepte les conditions d'utilisation et la politique de confidentialité.</label>}{error&&<p style={{background:'#fff1f2',borderRadius:7,color:'#be123c',fontSize:12,lineHeight:1.5,padding:10}}>{error}</p>}<button className="btn btn-dark" type="submit">{register?'Créer mon espace':'Se connecter'} <ArrowRight size={15}/></button></form>}<div className="auth-foot">{register ? <>Déjà un compte ? <Link href="/login">Se connecter</Link></> : <>Pas encore de compte ? <Link href="/register">Créer ton espace</Link></>}</div></div></main>;
}
