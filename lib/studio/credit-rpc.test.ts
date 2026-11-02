import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmCreditTransition } from "@/lib/studio/credit-rpc";

function mockAdmin(rpcReply: unknown, rowReply: unknown) {
  const query: any = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = vi.fn().mockResolvedValue(rowReply);
  return {
    rpc: vi.fn().mockResolvedValue(rpcReply),
    from: vi.fn(() => query),
    query,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("credit RPC transition confirmation", () => {
  it.each(["complete_credit_debit", "refund_credit_debit"] as const)("accepts an explicit true return from %s", async (rpcName) => {
    const admin = mockAdmin({ data: true, error: null }, { data: null, error: null });
    await expect(confirmCreditTransition(admin, rpcName, "tx-1")).resolves.toBe(true);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("accepts the legacy false refund return when the transaction is already refunded", async () => {
    const admin = mockAdmin({ data: false, error: null }, {
      data: { status: "refunded", credits: 12, user_id: "user-1" }, error: null,
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await expect(confirmCreditTransition(admin, "refund_credit_debit", "tx-1")).resolves.toBe(true);
    expect(admin.query.select).toHaveBeenCalledWith("status,credits,user_id");
    expect(admin.query.eq).toHaveBeenCalledWith("id", "tx-1");
    expect(info).toHaveBeenCalledWith("Studio credit transition confirmed from transaction status", expect.objectContaining({
      operation: "refund_credit_debit", amount: 12, transaction_id: "tx-1", status: "refunded",
    }));
  });

  it("accepts a null refund return when the transaction is already refunded", async () => {
    const admin = mockAdmin({ data: null, error: null }, {
      data: { status: "refunded", credits: 12, user_id: "user-1" }, error: null,
    });
    await expect(confirmCreditTransition(admin, "refund_credit_debit", "tx-1")).resolves.toBe(true);
    expect(admin.query.eq).toHaveBeenCalledWith("id", "tx-1");
  });

  it("does not treat false as a successful refund while the transaction remains pending", async () => {
    const admin = mockAdmin({ data: false, error: null }, {
      data: { status: "pending", credits: 12, user_id: "user-1" }, error: null,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(confirmCreditTransition(admin, "refund_credit_debit", "tx-1", { userId: "user-1", amount: 12 })).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledWith("Studio credit transition is unconfirmed", expect.objectContaining({
      user_id: "user-1", amount: 12, transaction_id: "tx-1", observed_status: "pending",
    }));
  });

  it("accepts an already-completed debit after a false legacy-style return", async () => {
    const admin = mockAdmin({ data: false, error: null }, {
      data: { status: "completed", credits: 12, user_id: "user-1" }, error: null,
    });
    await expect(confirmCreditTransition(admin, "complete_credit_debit", "tx-1")).resolves.toBe(true);
  });

  it("confirms a null RPC result from the persisted completed state", async () => {
    const admin = mockAdmin({ data: null, error: null }, {
      data: { status: "completed", credits: 12, user_id: "user-1" }, error: null,
    });
    await expect(confirmCreditTransition(admin, "complete_credit_debit", "tx-1")).resolves.toBe(true);
  });

  it("confirms a lost network response when the refund committed", async () => {
    const admin = mockAdmin({ data: null, error: { code: "NETWORK" } }, {
      data: { status: "refunded", credits: 12, user_id: "user-1" }, error: null,
    });
    await expect(confirmCreditTransition(admin, "refund_credit_debit", "tx-1")).resolves.toBe(true);
  });

  it.each(["insufficient balance", "insufficient reservation"])("keeps a false debit unconfirmed for %s", async () => {
    const admin = mockAdmin({ data: false, error: null }, {
      data: { status: "pending", credits: 12, user_id: "user-1" }, error: null,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(confirmCreditTransition(admin, "complete_credit_debit", "tx-1")).resolves.toBe(false);
  });

  it("does not claim a refund when the transaction state cannot be read", async () => {
    const admin = mockAdmin({ data: null, error: { code: "NETWORK" } }, { data: null, error: { code: "DB_READ" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(confirmCreditTransition(admin, "refund_credit_debit", "tx-1")).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledWith("Studio credit transition is unconfirmed", expect.objectContaining({
      transaction_id: "tx-1", rpc_error_code: "NETWORK", verification_error_code: "DB_READ",
    }));
  });
});
