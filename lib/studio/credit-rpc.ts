type CreditRpcName = "complete_credit_debit" | "refund_credit_debit";

type CreditContext = {
  userId?: string;
  amount?: number;
};

function errorCode(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === "object" && "code" in error && typeof error.code === "string")
    return error.code;
  return "unknown";
}

/**
 * Confirms a credit transition across both deployed RPC versions.
 * The legacy refund RPC returns false for an already-refunded transaction;
 * the guarded version returns true. A status read resolves that ambiguity,
 * including a lost RPC response after a committed transition.
 */
export async function confirmCreditTransition(
  admin: any,
  rpcName: CreditRpcName,
  transactionId: string | undefined,
  context: CreditContext = {},
): Promise<boolean> {
  if (!transactionId) {
    console.error("Studio credit transition is unconfirmed", {
      operation: rpcName,
      user_id: context.userId ?? null,
      amount: context.amount ?? null,
      transaction_id: null,
      rpc_error_code: "missing_transaction_id",
      observed_status: null,
      verification_error_code: null,
    });
    return false;
  }

  let rpcResult: any;
  try {
    rpcResult = await admin.rpc(rpcName, { transaction_id: transactionId });
  } catch (error) {
    rpcResult = { error };
  }

  if (!rpcResult?.error && rpcResult?.data === true) return true;

  let lookup: any;
  try {
    lookup = await admin
      .from("credit_transactions")
      .select("status,credits,user_id")
      .eq("id", transactionId)
      .maybeSingle();
  } catch (error) {
    lookup = { error };
  }

  const expectedStatus = rpcName === "complete_credit_debit" ? "completed" : "refunded";
  const confirmed = !lookup?.error && lookup?.data?.status === expectedStatus;
  if (confirmed) {
    console.info("Studio credit transition confirmed from transaction status", {
      operation: rpcName,
      user_id: lookup.data.user_id ?? context.userId ?? null,
      amount: lookup.data.credits ?? context.amount ?? null,
      transaction_id: transactionId,
      status: expectedStatus,
    });
    return true;
  }

  const rpcErrorCode = errorCode(rpcResult?.error) ??
    (rpcResult?.data === false ? "not_confirmed" : rpcResult?.data == null ? "empty_return" : "unexpected_return");
  console.error("Studio credit transition is unconfirmed", {
    operation: rpcName,
    user_id: lookup?.data?.user_id ?? context.userId ?? null,
    amount: lookup?.data?.credits ?? context.amount ?? null,
    transaction_id: transactionId,
    rpc_error_code: rpcErrorCode,
    observed_status: lookup?.data?.status ?? null,
    verification_error_code: errorCode(lookup?.error),
  });
  return false;
}
