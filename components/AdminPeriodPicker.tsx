"use client";
import { useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n/i18n";

export type AdminPeriodPreset = "all" | "7d" | "30d" | "90d" | "custom";
export function adminPeriodQuery(value: AdminPeriodPreset, from = "", to = "") {
  const params = new URLSearchParams({ period: value, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  if (value === "custom") { params.set("start", from); params.set("end", to); }
  return `?${params}`;
}
export function AdminPeriodPicker({ onChange, idPrefix = "admin-period" }: { onChange: (query: string) => void; idPrefix?: string }) {
  const { locale } = useI18n();
  const en = locale === "en";
  const [preset, setPreset] = useState<AdminPeriodPreset>("all");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [invalid, setInvalid] = useState(false);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const copy = en
    ? { period: "Revenue period", all: "All recorded history", custom: "Custom range", start: "Start date", end: "End date", apply: "Apply", days: "days", invalid: "Enter valid start and end dates. The start date must not be after the end date or in the future." }
    : { period: "Période des revenus", all: "Tout l’historique enregistré", custom: "Intervalle personnalisé", start: "Date de début", end: "Date de fin", apply: "Appliquer", days: "jours", invalid: "Saisissez des dates de début et de fin valides. La date de début ne doit pas être après la date de fin ni dans le futur." };
  function submit(event: FormEvent) {
    event.preventDefault();
    const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    if (preset === "custom" && (!valid(start) || !valid(end) || start > end || start > today)) { setInvalid(true); return; }
    setInvalid(false);
    onChange(adminPeriodQuery(preset, start, end));
  }
  return <form className="admin-revenue-period" onSubmit={submit} noValidate>
    <label>{copy.period}<select value={preset} onChange={event => {
      const value = event.target.value as AdminPeriodPreset;
      setPreset(value); setInvalid(false);
      if (value !== "custom") onChange(adminPeriodQuery(value));
    }}>
      <option value="all">{copy.all}</option>
      {[7, 30, 90].map(count => <option key={count} value={`${count}d`}>{count} {copy.days}</option>)}
      <option value="custom">{copy.custom}</option>
    </select></label>
    {preset === "custom" && <>
      <label>{copy.start}<input type="date" max={today} value={start} onChange={event => setStart(event.target.value)} required aria-invalid={invalid} aria-describedby={invalid ? `${idPrefix}-error` : undefined} /></label>
      <label>{copy.end}<input type="date" value={end} onChange={event => setEnd(event.target.value)} required aria-invalid={invalid} aria-describedby={invalid ? `${idPrefix}-error` : undefined} /></label>
      <button className="admin-btn admin-btn-soft" type="submit">{copy.apply}</button>
    </>}
    {invalid && <p id={`${idPrefix}-error`} className="admin-revenue-period-error" role="alert">{copy.invalid}</p>}
  </form>;
}
