"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 8) return setError("Le mot de passe doit contenir au moins 8 caractères.");
    if (password !== confirmation) return setError("Les deux mots de passe ne correspondent pas.");
    const { error: updateError } = await createClient().auth.updateUser({ password });
    if (updateError) return setError(updateError.message);
    setSaved(true);
  }

  return <main className="auth-page"><div className="auth-card"><Link href="/" className="brand"><Image className="brand-logo" src="/vendeo-logo-dark.svg" alt="Vendeo" width={150} height={40}/></Link><h1>Choisis un nouveau mot de passe.</h1><p>Utilise un mot de passe que tu n’utilises pas ailleurs.</p>{saved ? <div style={{background:'#e9f5ff',borderRadius:8,color:'#123e75',fontSize:13,lineHeight:1.6,padding:16}}>Ton mot de passe a été modifié. Tu peux maintenant te connecter.</div> : <form onSubmit={submit}><div className="form-group"><label>Nouveau mot de passe</label><input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8 caractères minimum" /></div><div className="form-group"><label>Confirmer le mot de passe</label><input required minLength={8} type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Répète ton mot de passe" /></div>{error&&<p style={{background:'#fff1f2',borderRadius:7,color:'#be123c',fontSize:12,lineHeight:1.5,padding:10}}>{error}</p>}<button className="btn btn-dark" type="submit">Modifier le mot de passe <ArrowRight size={15}/></button></form>}<div className="auth-foot"><Link href="/login">Retour à la connexion</Link></div></div></main>;
}
