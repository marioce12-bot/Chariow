"use client";

import type { ConnectionPillState, ConnectionStatus, PeriodFilter } from "./types";

interface Shop {
  id: string;
  name: string;
}

interface DashboardHeaderProps {
  shops: Shop[];
  selectedShopId: string;
  onShopChange: (id: string) => void;
  connections: ConnectionPillState;
  period: PeriodFilter;
  onPeriodChange: (p: PeriodFilter) => void;
}

const STATUS_STYLES: Record<ConnectionStatus, { dot: string; bg: string; text: string }> = {
  connected: { dot: "bg-[#10B981]", bg: "bg-[#ECFDF5]", text: "text-[#065F46]" },
  invalid: { dot: "bg-[#EF4444]", bg: "bg-[#FEF2F2]", text: "text-[#991B1B]" },
  not_configured: { dot: "bg-gray-300", bg: "bg-gray-50", text: "text-gray-500" },
};

function Pill({ label, status }: { label: string; status: ConnectionStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}

const PERIODS: { value: PeriodFilter; label: string }[] = [
  { value: "today", label: "Aujourd'hui" },
  { value: "7d", label: "7j" },
  { value: "30d", label: "30j" },
];

/**
 * Header sticky du dashboard Vendeo.
 */
export function DashboardHeader({
  shops,
  selectedShopId,
  onShopChange,
  connections,
  period,
  onPeriodChange,
}: DashboardHeaderProps) {
  return (
    <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-gray-100 bg-white/95 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedShopId}
          onChange={(e) => onShopChange(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700"
        >
          {shops.map((shop) => (
            <option key={shop.id} value={shop.id}>
              {shop.name}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap items-center gap-2">
          <Pill label="Chariow" status={connections.chariow} />
          <Pill label="Meta Ads" status={connections.meta} />
          <Pill label="TikTok Ads" status={connections.tiktok} />
        </div>
      </div>

      <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => onPeriodChange(p.value)}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
              period === p.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
