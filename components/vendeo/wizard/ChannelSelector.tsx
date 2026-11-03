"use client";

import { useEffect, useState } from "react";
import type { Platform, WizardState } from "./types";

type Props = { state: WizardState; patch: (partial: Partial<WizardState>) => void; onReadyChange: (ready: boolean) => void; en: boolean };

const CHANNELS: Array<{ id: Platform; name: string; connect: string }> = [
  { id: "meta", name: "Meta Ads", connect: "/api/integrations/meta/connect" },
  { id: "tiktok", name: "TikTok Ads", connect: "/api/integrations/tiktok/connect" },
  { id: "pinterest", name: "Pinterest Ads", connect: "/api/integrations/pinterest/connect" },
];

export function ChannelSelector({ state, patch, onReadyChange, en }: Props) {
  const [loading, setLoading] = useState(false);
  const [accountCount, setAccountCount] = useState(0);
  const channel = CHANNELS.find((item) => item.id === state.platform) ?? CHANNELS[0];
  useEffect(() => {
    const selected = state.platform === "meta" ? state.metaAdAccountId : state.platform === "tiktok" ? state.tiktokAdAccountId : state.pinterestAdAccountId;
    if (selected) { setAccountCount(1); onReadyChange(true); return; }
    let cancelled = false;
    setLoading(true); onReadyChange(false);
    const endpoint = state.platform === "meta" ? "/api/integrations/meta/accounts" : state.platform === "tiktok" ? "/api/integrations/tiktok/accounts" : "/api/integrations/pinterest/accounts";
    fetch(endpoint).then((response) => response.ok ? response.json() : Promise.reject(new Error("load_failed"))).then((data) => {
      if (cancelled) return;
      const accounts = Array.isArray(data.accounts) ? data.accounts : [];
      setAccountCount(accounts.length);
      const first = accounts[0];
      if (first) {
        if (state.platform === "meta") patch({ metaAdAccountId: first.id });
        else if (state.platform === "tiktok") patch({ tiktokAdAccountId: first.id ?? first.advertiser_id });
        else patch({ pinterestAdAccountId: first.id ?? first.advertiser_id });
        onReadyChange(true);
      } else onReadyChange(false);
    }).catch(() => { if (!cancelled) { setAccountCount(0); onReadyChange(false); } }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [state.platform]);

  function changePlatform(platform: Platform) {
    patch({ platform, metaAdAccountId: undefined, tiktokAdAccountId: undefined, pinterestAdAccountId: undefined, metaPageId: undefined });
  }
  return <section className="mb-5 rounded-2xl border border-[#DDE4F2] bg-[#F9FAFF] p-4" aria-labelledby="wizard-channel-title">
    <div className="mb-3"><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6B55E9]">{en ? "First step" : "Première étape"}</p><h3 id="wizard-channel-title" className="mt-1 text-base font-bold text-gray-900">{en ? "Choose your advertising channel" : "Choisis ton canal publicitaire"}</h3><p className="mt-1 text-xs text-gray-500">{en ? "Select and connect the channel before configuring your ad." : "Sélectionne et connecte le canal avant de configurer ta publicité."}</p></div>
    <div className="grid grid-cols-3 gap-2">{CHANNELS.map((item) => <button type="button" key={item.id} onClick={() => changePlatform(item.id)} className={`rounded-xl border px-2 py-2 text-xs font-semibold ${state.platform === item.id ? "border-[#6366F1] bg-white text-[#3730A3]" : "border-gray-200 bg-white text-gray-600"}`}>{item.name}</button>)}</div>
    <div className={`mt-3 rounded-xl p-3 text-xs ${accountCount ? "bg-[#ECFDF5] text-[#065F46]" : "bg-[#FFF7ED] text-[#9A3412]"}`}>
      {loading ? (en ? `Checking your ${channel.name} connection…` : `Vérification de ta connexion ${channel.name}…`) : accountCount ? (en ? `${channel.name} is connected. You can continue.` : `${channel.name} est connecté. Tu peux continuer.`) : <><strong>{en ? `No ${channel.name} account connected.` : `Aucun compte ${channel.name} connecté.`}</strong><p className="mt-1">{en ? "Connect it now, then return to continue your campaign." : "Connecte-le maintenant, puis reviens pour continuer ta campagne."}</p><a href={channel.connect} className="mt-2 inline-block rounded-lg bg-[#9A3412] px-3 py-1.5 font-semibold text-white">{en ? `Connect ${channel.name}` : `Connecter ${channel.name}`}</a></>}
    </div>
  </section>;
}
