import { createHash } from "node:crypto";

export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}

export function syntheticReceiptEnvelope(runtimeView = {}) {
  const receiptPayload = {
    requestIdentity: "synthetic-request-001",
    requestPayloadDigest: `sha256:${"1".repeat(64)}`,
    responsePayloadDigest: `sha256:${"2".repeat(64)}`,
    providerStatus: "completed",
    providerRequestId: "synthetic-provider-request-001",
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  return {
    schema: "receipt-envelope-v0.2",
    receiptPayload,
    receiptDigest: sha256(receiptPayload),
    runtimeView: {
      cacheHit: false,
      readAt: null,
      selectedAsEffective: false,
      ...runtimeView,
    },
  };
}

export function syntheticTransactionManifest() {
  return {
    transactionId: "synthetic-transaction-001",
    stateDigest: `sha256:${"3".repeat(64)}`,
    cacheIndexDigest: `sha256:${"4".repeat(64)}`,
    receiptIndexDigest: `sha256:${"5".repeat(64)}`,
    requestLedgerDigest: `sha256:${"6".repeat(64)}`,
    counterDigest: `sha256:${"7".repeat(64)}`,
    manifestBindings: [{ role: "synthetic-immutable-manifest", digest: `sha256:${"8".repeat(64)}` }],
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}
