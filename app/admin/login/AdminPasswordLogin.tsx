"use client";

import { FormEvent, useState } from "react";

export function AdminPasswordLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    const response = await fetch("/api/admin/password-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (response.ok) window.location.assign("/admin");
    else { const data = await response.json().catch(() => ({})); setError(data.error ?? "Mot de passe administrateur invalide."); setLoading(false); }
  }
  return <main className="admin-password-page"><form className="admin-password-card" onSubmit={submit}><span className="admin-kicker">Vendeo interne</span><h1>Accès administrateur</h1><p>Connecte-toi pour consulter la vue globale de la plateforme.</p><label>Mot de passe<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus required /></label>{error ? <div className="admin-password-error">{error}</div> : null}<button className="btn btn-dark" disabled={loading}>{loading ? "Vérification…" : "Accéder à la console"}</button></form></main>;
}
