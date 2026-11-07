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
  return <div className="chat-meta-interests">
    <input type="search" aria-label={en ? "Search Meta interests" : "Rechercher un centre d’intérêt Meta"} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={en ? "Search an interest" : "Rechercher un centre d’intérêt"} autoComplete="off" disabled={disabled || !accountId} />
    {!accountId && <small>{en ? "Choose a Meta ad account to search interests." : "Choisis un compte Meta Ads pour rechercher des centres d’intérêt."}</small>}
    {query.trim().length >= 2 && <div role="listbox" aria-label={en ? "Meta interest suggestions" : "Suggestions de centres d’intérêt Meta"}>
      {loading ? <p>{en ? "Searching Meta…" : "Recherche auprès de Meta…"}</p> : null}
      {!loading && results.filter((item) => !selected.has(item.id)).map((item) => <button key={item.id} type="button" role="option" aria-selected="false" disabled={disabled || value.length >= max} onClick={() => add(item)}>{item.name}</button>)}
      {!loading && results.filter((item) => !selected.has(item.id)).length === 0 && <p>{en ? "No Meta interests found." : "Aucun centre d’intérêt Meta trouvé."}</p>}
    </div>}
  </div>;
}
