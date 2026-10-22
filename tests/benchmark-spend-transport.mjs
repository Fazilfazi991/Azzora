// Exclusive on-disk ledger shared by both model processes. No automatic top-up,
// retry, reservation deletion or release of unknown/failed request charges.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
export function openBenchmarkSpend(budget, selected, key, evidencePath) {
  if (!fs.existsSync(evidencePath))
    throw Error(
      "Provider-account hard-cap evidence has not been verified. No paid call allowed.",
    );
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  const records = Object.values(evidence.providers || {});
  if (
    evidence.version !== 1 ||
    evidence.combinedCapMicroUsd > 5000000 ||
    evidence.combinedCapMicroUsd <= 0 ||
    records.reduce((s, v) => s + v.capMicroUsd, 0) >
      evidence.combinedCapMicroUsd
  )
    throw Error(
      "Provider allocations exceed the combined USD 5 authorization.",
    );
  const account = evidence.providers?.[selected];
  if (
    !account ||
    typeof account.accountId !== "string" ||
    !account.accountId.trim() ||
    account.capScope !== "account" ||
    account.hardStopVerified !== true ||
    account.autoTopupsDisabled !== true ||
    account.dedicatedToBenchmark !== true ||
    !account.verifiedBy ||
    !Array.isArray(account.evidenceRefs) ||
    !account.evidenceRefs.length ||
    !Number.isFinite(Date.parse(account.verifiedAt)) ||
    Date.now() - Date.parse(account.verifiedAt) > 86400000 ||
    Date.parse(account.verifiedAt) > Date.now() ||
    account.keySha256 !== crypto.createHash("sha256").update(key).digest("hex")
  )
    throw Error(
      "Current account cap, disabled top-ups and matching credential must be independently verified before calls.",
    );
  const tariff = account.tariff;
  if (
    !tariff ||
    !tariff.sourceUrl ||
    !tariff.checkedAt ||
    tariff.checkedAt !== new Date().toISOString().slice(0, 10) ||
    tariff.maxInputTokens !== 1000000 ||
    tariff.maxOutputTokens !== 8192 ||
    tariff.inputUsdPerMillion <= 0 ||
    tariff.outputUsdPerMillion <= 0
  )
    throw Error(
      "A current verified worst-case tariff and model envelope are required.",
    );
  const dir = "tmp/document-entry-evidence",
    ledgerPath = path.join(dir, "combined-spend-ledger.json"),
    lockPath = ledgerPath + ".lock";
  const lock = fs.openSync(lockPath, "wx");
  fs.writeSync(
    lock,
    JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
  );
  let state;
  const persist = () => {
    const temp = ledgerPath + "." + crypto.randomUUID() + ".tmp";
    fs.writeFileSync(temp, JSON.stringify(state, null, 2), { flag: "wx" });
    fs.renameSync(temp, ledgerPath);
  };
  const close = () => {
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  };
  try {
    state = fs.existsSync(ledgerPath)
      ? JSON.parse(fs.readFileSync(ledgerPath, "utf8"))
      : { ...budget.newBudget(), limitMicroUsd: evidence.combinedCapMicroUsd };
    budget.validateBudget(state);
    if (state.limitMicroUsd !== evidence.combinedCapMicroUsd)
      throw Error("Ledger and account total caps disagree.");
  } catch (e) {
    close();
    throw e;
  }
  let documentId = "";
  const transport = async (url, init) => {
    const expectedUrl =
      selected === "qwen"
        ? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions"
        : "https://api.deepseek.com/chat/completions";
    if (url !== expectedUrl) throw Error("Unexpected provider endpoint.");
    if (!documentId)
      throw Error("No authorized synthetic document is selected.");
    const body = JSON.parse(init.body);
    if (
      body.model !== account.model ||
      !Number.isSafeInteger(body.max_tokens) ||
      body.max_tokens <= 0 ||
      body.max_tokens > tariff.maxOutputTokens ||
      body.stream !== false
    )
      throw Error("Request is outside the verified model/price envelope.");
    const id = `${selected}:${documentId}`,
      maximum = budget.tokenCostUpperMicroUsd(
        tariff.maxInputTokens,
        tariff.maxOutputTokens,
        tariff.inputUsdPerMillion,
        tariff.outputUsdPerMillion,
      );
    state = budget.reserveBudget(
      state,
      id,
      selected,
      maximum,
      account.capMicroUsd,
    );
    persist();
    let response;
    try {
      response = await fetch(url, init);
    } catch (e) {
      state = budget.meterBudget(state, id, null);
      persist();
      throw e;
    }
    let upper = null;
    try {
      const result = await response.clone().json(),
        usage = result.usage;
      if (
        response.ok &&
        Number.isSafeInteger(usage?.prompt_tokens) &&
        usage.prompt_tokens >= 0 &&
        usage.prompt_tokens <= tariff.maxInputTokens &&
        Number.isSafeInteger(usage?.completion_tokens) &&
        usage.completion_tokens >= 0 &&
        usage.completion_tokens <= tariff.maxOutputTokens
      )
        upper = budget.tokenCostUpperMicroUsd(
          usage.prompt_tokens,
          usage.completion_tokens,
          tariff.inputUsdPerMillion,
          tariff.outputUsdPerMillion,
        );
    } catch {
      /* Keep the entire worst-case reserve if metering is absent. */
    }
    state = budget.meterBudget(state, id, upper);
    persist();
    return response;
  };
  return {
    transport,
    selectDocument(id) {
      documentId = id;
    },
    snapshot() {
      return structuredClone(state);
    },
    close,
  };
}
