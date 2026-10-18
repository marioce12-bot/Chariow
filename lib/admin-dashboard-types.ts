export type AdminData = {
  admin: { role: string };
  metrics: {
    users: number;
    stores: number;
    subscriptions: number;
    messages: number;
    metaAccounts: number;
  };
  business: {
    total_revenue_xof?: number;
    credit_revenue_xof?: number;
    subscription_revenue_xof?: number;
    credit_purchases?: number;
    credits_sold?: number;
    active_subscriptions?: number;
    registered_users?: number;
    studio_generations?: number;
  };
  users: Array<{
    id: string;
    email: string | null;
    full_name: string | null;
    created_at: string;
    credit_balance?: number;
    subscription?: { plan: string; status: string } | null;
  }>;
  stores: Array<{
    id: string;
    platform: string;
    is_active: boolean;
    connection_status: string;
    connected_at: string | null;
    user_id: string;
  }>;
  subscriptions: Array<{
    id: string;
    user_id: string;
    plan: string;
    status: string;
    messages_used_this_month: number;
    messages_limit: number;
    current_period_end?: string;
  }>;
  metaAccounts: Array<{
    id: string;
    user_id: string;
    is_active: boolean;
    last_synced_at: string | null;
  }>;
  audit: Array<{
    id: string;
    action: string;
    resource_type: string;
    resource_id?: string | null;
    created_at: string;
  }>;
  creditPurchases: Array<{
    id: string;
    user_id: string;
    credits: number;
    status: string;
    operation?: string;
    metadata?: { amount_xof?: number; provider?: string };
    created_at: string;
  }>;
  creditTransactions: Array<{
    id: string;
    user_id: string;
    credits: number;
    operation?: string;
    model?: string;
    status: string;
    created_at: string;
  }>;
  paymentEvents: Array<{
    id: string;
    user_id: string;
    plan?: string;
    status: string;
    created_at: string;
  }>;
  payouts?: Array<{
    id: string;
    amount_xof: number;
    recipient_method: string;
    status: string;
    created_at: string;
  }>;
};

export type UsageStats = {
  signups_24h: number;
  signups_7d: number;
  signups_30d: number;
  signups_total: number;
  active_users_24h: number;
  days: number;
  sessions: number;
  active_users: number;
  avg_session_seconds: number;
  sections: Array<{
    section: string;
    seconds: number;
    visits: number;
    users: number;
  }>;
  signups_by_day: Array<{ day: string; count: number }>;
};
