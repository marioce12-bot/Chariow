export type MetaAdAccount = {
  id: string;
  meta_account_id: string;
  name: string | null;
  currency: string;
};

export type MetaInsight = {
  date_start: string;
  date_stop: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  spend?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: Array<{ action_type?: string; value?: string }>;
  action_values?: Array<{ action_type?: string; value?: string }>;
  purchase_roas?: Array<{ action_type?: string; value?: string }>;
  [key: string]: unknown;
};

export type MetaEntityPerformance = {
  id: string;
  name: string;
  level: "campaign" | "adset" | "ad";
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversionValue: number;
  revenue: number;
  cac: number | null;
  cpa: number | null;
  roas: number | null;
  status: "profitable" | "warning" | "loss";
};
