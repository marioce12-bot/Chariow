"use client";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import "./admin-revenue.css";

export type Preset = "all" | "7d" | "30d" | "90d" | "custom";
export function periodQuery(value: Preset, from = "", to = "") {
  const params = new URLSearchParams({ period: value, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  if (value === "custom") { params.set("start", from); params.set("end", to); }
  return `?${params}`;
}
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

// Sélecteur de période partagé par les blocs admin (7/30/90 jours, tout l'historique, intervalle libre).
export function AdminPeriodPicker({ onChange, idPrefix }: { onChange: (query: string) => void; idPrefix: string }) {
  const { locale } = useI18n();
  const en = locale === "en";
  const [preset, setPreset] = useState<Preset>("30d");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [invalid, setInvalid] = useState(false);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const copy = en
    ? { period: "Period", all: "All recorded history", custom: "Custom range", start: "Start date", end: "End date", apply: "Apply", days: "days", invalid: "Enter valid dates. The start must not be after the end or in the future." }
    : { period: "Période", all: "Tout l’historique enregistré", custom: "Intervalle personnalisé", start: "Date de début", end: "Date de fin", apply: "Appliquer", days: "jours", invalid: "Saisissez des dates valides. Le début ne doit pas être après la fin ni dans le futur." };
  const errorId = `${idPrefix}-period-error`;
  return <form className="admin-revenue-period" noValidate onSubmit={(event) => {
    event.preventDefault();
    if (preset === "custom" && (!validDate(start) || !validDate(end) || start > end || start > today)) { setInvalid(true); return; }
    setInvalid(false); onChange(periodQuery(preset, start, end));
  }}>
    <label>{copy.period}<select value={preset} onChange={(event) => {
      const value = event.target.value as Preset; setPreset(value); setInvalid(false);
      if (value !== "custom") onChange(periodQuery(value));
    }}>
      {[7, 30, 90].map((count) => <option key={count} value={`${count}d`}>{count} {copy.days}</option>)}
      <option value="all">{copy.all}</option>
      <option value="custom">{copy.custom}</option>
    </select></label>
    {preset === "custom" && <>
      <label>{copy.start}<input type="date" max={today} value={start} onChange={(e) => setStart(e.target.value)} required aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined} /></label>
      <label>{copy.end}<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} required aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined} /></label>
      <button className="admin-btn admin-btn-soft" type="submit">{copy.apply}</button>
    </>}
    {invalid && <p id={errorId} className="admin-revenue-period-error" role="alert">{copy.invalid}</p>}
  </form>;
}
