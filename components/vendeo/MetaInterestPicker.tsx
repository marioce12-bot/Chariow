"use client";

import { useEffect, useState } from "react";
import type { MetaInterestTarget } from "@/lib/ad-campaigns/meta-targeting";

export interface MetaInterestPickerProps {
  accountId: string | null;
  value: MetaInterestTarget[];
  onChange: (value: MetaInterestTarget[]) => void;
  max?: number;
  locale: "fr" | "en";
  disabled?: boolean;
}

export function MetaInterestPicker({ accountId, value, onChange, max = 10, locale, disabled = false }: MetaInterestPickerProps) {
  const en = locale === "en";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MetaInterestTarget[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const q = query.trim();
    if (!accountId || q.length < 2 || disabled) { setResults([]); setLoading(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ q, account_id: accountId });
      fetch(`/api/integrations/meta/interest-search?${params}`, { signal: controller.signal })
        .then((r) => r.ok ? r.json() : { results: [] })
        .then((data) => { if (!controller.signal.aborted) setResults(Array.isArray(data.results) ? data.results : []); })
        .catch(() => { if (!controller.signal.aborted) setResults([]); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, accountId, disabled]);
  const selected = new Set(value.map((item) => item.id));
  const add = (item: MetaInterestTarget) => {
    if (disabled || value.length >= max || selected.has(item.id)) return;
    onChange([...value, { id: item.id, name: item.name }]);
    setQuery(""); setResults([]);
  };
  if (!open) {
    return <div className="chat-launch-interest-picker">
      <button type="button" className="chat-launch-interest-add" disabled={disabled || value.length >= max} onClick={() => setOpen(true)}>{en ? "+ Add an interest" : "+ Ajouter un centre d’intérêt"}</button>
    </div>;
  }
  const available = results.filter((item) => !selected.has(item.id));
  return <div className="chat-launch-interest-picker">
    <input className="chat-launch-interest-input" type="search" aria-label={en ? "Search Meta interests" : "Rechercher un centre d’intérêt Meta"} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={en ? "Search an interest" : "Rechercher un centre d’intérêt"} autoComplete="off" disabled={disabled || !accountId} autoFocus />
    {!accountId && <p className="chat-launch-interest-muted">{en ? "Choose a Meta ad account to search interests." : "Choisis un compte Meta Ads pour rechercher des centres d’intérêt."}</p>}
    {query.trim().length >= 2 && <div className="chat-launch-interest-results" role="listbox" aria-label={en ? "Meta interest suggestions" : "Suggestions de centres d’intérêt Meta"}>
      {loading ? <p className="chat-launch-interest-muted">{en ? "Searching Meta…" : "Recherche auprès de Meta…"}</p> : null}
      {!loading && available.map((item) => <button key={item.id} type="button" role="option" aria-selected="false" className="chat-launch-interest-result" disabled={disabled || value.length >= max} onClick={() => add(item)}>{item.name}</button>)}
      {!loading && available.length === 0 && <p className="chat-launch-interest-muted">{en ? "No Meta interests found." : "Aucun centre d’intérêt Meta trouvé."}</p>}
    </div>}
  </div>;
}
