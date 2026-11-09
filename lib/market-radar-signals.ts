export type MarketTrendDirection = "up" | "down" | "stable" | "unknown";

export type MarketTrendSignal = {
  status: "available" | "insufficient" | "empty";
  direction: MarketTrendDirection;
  currentIndex: number | null;
  previousIndex: number | null;
  interestPercentile: number | null;
  momentumScore: number | null;
  changePoints: number | null;
  sampleCount: number;
  nonZeroShare: number | null;
  points: number[];
  relatedQueries: string[];
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function cleanRelatedQueries(data: Record<string, unknown>) {
  const related = asRecord(data.related_queries);
  const top = Array.isArray(related?.top) ? related.top : [];
  const rising = Array.isArray(related?.rising) ? related.rising : [];
  return [...top, ...rising]
    .map((item) => {
      const record = asRecord(item);
      return typeof record?.query === "string" ? record.query.trim() : "";
    })
    .filter(Boolean)
    .filter((query, index, all) => all.indexOf(query) === index)
    .slice(0, 8);
}

export function scoreMarketTrend(data: unknown): MarketTrendSignal {
  const root = asRecord(data);
  const interest = asRecord(root?.interest_over_time);
  const rows = Array.isArray(interest?.timeline_data) ? interest.timeline_data : [];
  const samples = rows.flatMap((rawRow) => {
    const row = asRecord(rawRow);
    if (!row || row.partial_data === true || !Array.isArray(row.values)) return [];
    const values = row.values.flatMap((rawValue) => {
      const item = asRecord(rawValue);
      if (!item) return [];
      const raw = item.extracted_value ?? item.value;
      const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : Number.NaN;
      return Number.isFinite(value) && value >= 0 && value <= 100 ? [value] : [];
    });
    return values.length ? [values.reduce((sum, value) => sum + value, 0) / values.length] : [];
  });

  const relatedQueries = cleanRelatedQueries(root ?? {});
  if (!samples.length) {
    return {
      status: "empty", direction: "unknown", currentIndex: null, previousIndex: null,
      interestPercentile: null, momentumScore: null, changePoints: null,
      sampleCount: 0, nonZeroShare: null, points: [], relatedQueries,
    };
  }

  const currentWindow = samples.slice(-4);
  const previousWindow = samples.slice(-8, -4);
  const currentIndex = mean(currentWindow);
  const previousIndex = mean(previousWindow);
  const nonZeroShare = samples.filter((value) => value > 0).length / samples.length;
  const enoughHistory = samples.length >= 8 && previousWindow.length === 4 && currentWindow.length === 4;
  const hasSearchSignal = samples.some((value) => value > 0);

  if (!enoughHistory || !hasSearchSignal || currentIndex === null || previousIndex === null) {
    return {
      status: "insufficient", direction: "unknown",
      currentIndex: currentIndex === null ? null : clamp(currentIndex),
      previousIndex: previousIndex === null ? null : clamp(previousIndex),
      interestPercentile: null, momentumScore: null, changePoints: null,
      sampleCount: samples.length, nonZeroShare: clamp(nonZeroShare * 100),
      points: samples.slice(-12).map(clamp), relatedQueries,
    };
  }

  const changePoints = currentIndex - previousIndex;
  const threshold = Math.max(3, previousIndex * 0.15);
  const direction: MarketTrendDirection = changePoints > threshold
    ? "up"
    : changePoints < -threshold
      ? "down"
      : "stable";
  const interestPercentile = clamp((samples.filter((value) => value <= currentIndex).length / samples.length) * 100);

  return {
    status: "available",
    direction,
    currentIndex: clamp(currentIndex),
    previousIndex: clamp(previousIndex),
    interestPercentile,
    momentumScore: clamp(50 + changePoints * 1.5),
    changePoints: Math.round(changePoints * 10) / 10,
    sampleCount: samples.length,
    nonZeroShare: clamp(nonZeroShare * 100),
    points: samples.slice(-12).map(clamp),
    relatedQueries,
  };
}
