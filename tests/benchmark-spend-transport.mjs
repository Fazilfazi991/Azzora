// Historical entry point retained to prevent older scripts from creating a
// second USD5 allowance after the hosted DeepSeek runtime is introduced.
// Existing local spend history must be imported and reconciled, never deleted.
export function openBenchmarkSpend() {
  throw Error(
    "The local-only paid transport is retired. Use createDeepSeekRuntime with the dedicated Accounts shared ReviewStore budget and verified historical import.",
  );
}
