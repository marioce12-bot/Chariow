"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useState } from "react";

export function Auth({ mode }: { mode: "login" | "register" }) {
  const [submitted, setSubmitted] = useState(false);
  const register = mode === "register";
  return <main className="auth-page"><div className="auth-card"><Link href="/" className="brand"><span className="brand-mark">✦</span><span className="brand-name">AI analyst <span>/ studio</span></span></Link><h1>{register ? "Crée ton espace." : "Content de te revoir."}</h1><p>{register ? "Ton business mérite mieux que des suppositions." : "Retrouve tes données et ton prochain bon move."}</p>{submitted ? <div style={{background:'#e5f1dc',borderRadius:8,color:'#31593e',fontSize:13,lineHeight:1.6,padding:16}}>Ton espace de démonstration est prêt. Redirection vers le dashboard...</div> : <form onSubmit={(e)=>{e.preventDefault();setSubmitted(true);setTimeout(()=>window.location.href='/dashboard',700)}}>{register&&<div className="form-group"><label>Ton prénom</label><input required placeholder="Aïcha"/></div>}<div className="form-group"><label>Email professionnel</label><input required type="email" placeholder="toi@exemple.com"/></div><div className="form-group"><label>Mot de passe</label><input required type="password" placeholder="8 caractères minimum" minLength={8}/></div>{register&&<label style={{display:'flex',alignItems:'start',gap:8,color:'#718078',fontSize:11,margin:'18px 0'}}><input type="checkbox" required style={{marginTop:2}}/> J'accepte les conditions d'utilisation et la politique de confidentialité.</label>}<button className="btn btn-dark" type="submit">{register?'Créer mon espace':'Se connecter'} <ArrowRight size={15}/></button></form>}<div className="auth-foot">{register ? <>Déjà un compte ? <Link href="/login">Se connecter</Link></> : <>Pas encore de compte ? <Link href="/register">Créer ton espace</Link></>}</div></div></main>;
}
