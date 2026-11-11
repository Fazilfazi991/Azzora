// Offline migration/recovery workbench. No network, cloud apply, production import or financial-posting command exists.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
const [command, ...flags] = process.argv.slice(2),
  options = {};
if (
  ![
    "prepare-import",
    "verify-import",
    "encrypt",
    "decrypt",
    "restore-rehearsal",
    "verify-production-backup",
  ].includes(command)
) {
  console.error(
    "Use prepare-import | verify-import | encrypt | decrypt | restore-rehearsal | verify-production-backup. Key operations require --key-file, --company and --key-id; verification also requires --max-age-seconds.",
  );
  process.exit(1);
}
for (let i = 0; i < flags.length; i += 2) {
  if (
    !/^--[a-z-]+$/.test(flags[i]) ||
    !flags[i + 1] ||
    Object.hasOwn(options, flags[i])
  )
    throw Error("Use unique --name value arguments.");
  options[flags[i]] = flags[i + 1];
}
const required = (name) => {
    if (!options[name]) throw Error("Missing " + name);
    return options[name];
  },
  input = required("--input");
await fs.mkdir("tmp/launch-tools", { recursive: true });
await build({
  stdin: {
    contents:
      'export {prepareImportReview,verifyImportReview} from "./src/backend/import-plan.ts"; export {encryptBusinessBackup,decryptBusinessBackup} from "./src/backend/launch-backup.ts"; export {rehearseEncryptedBusinessRestore} from "./src/backend/launch-backup-rehearsal.ts"; export {checkProductionBackupHealth} from "./src/backend/backup-health.ts";',
    resolveDir: process.cwd(),
    loader: "ts",
  },
  outfile: "tmp/launch-tools/runtime.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  logLevel: "silent",
});
const tool = await import(
  pathToFileURL(path.resolve("tmp/launch-tools/runtime.mjs")).href
);
const json = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const write = async (p, data) => {
  await fs.writeFile(p, data, { flag: "wx", mode: 0o600 });
};
try {
  if (command === "prepare-import") {
    const review = tool.prepareImportReview(await json(input));
    await write(required("--output"), JSON.stringify(review, null, 2) + "\n");
    console.log(
      JSON.stringify({
        prepared: true,
        issues: review.issues.length,
        sha256: review.sha256,
        publication: review.publication,
        financialPostingAllowed: false,
        warning: "Private plaintext review; no company records were imported.",
      }),
    );
  } else if (command === "verify-import") {
    const review = tool.verifyImportReview(await json(input));
    console.log(
      JSON.stringify({
        verified: true,
        issues: review.issues.length,
        publication: review.publication,
        financialPostingAllowed: false,
      }),
    );
  } else {
    const keyFile = await fs.readFile(required("--key-file"));
    const key =
      keyFile.length === 32
        ? keyFile
        : Buffer.from(keyFile.toString("utf8").trim(), "base64");
    const scope = {
      companyId: required("--company"),
      keyId: required("--key-id"),
    };
    if (command === "encrypt") {
      const encrypted = tool.encryptBusinessBackup(
        await fs.readFile(input),
        key,
        { ...scope, capturedAt: required("--captured-at") },
      );
      await write(
        required("--output"),
        JSON.stringify(encrypted, null, 2) + "\n",
      );
      console.log(
        JSON.stringify({
          encrypted: true,
          algorithm: encrypted.algorithm,
          plaintextSha256: encrypted.plaintextSha256,
          keyIncluded: false,
        }),
      );
    } else if (command === "decrypt") {
      const clear = tool.decryptBusinessBackup(await json(input), key, scope);
      await write(required("--output"), clear);
      console.log(
        JSON.stringify({
          decrypted: true,
          warning: "Private plaintext output; no database was restored.",
        }),
      );
    } else if (command === "verify-production-backup") {
      const age = required("--max-age-seconds");
      if (!/^[1-9][0-9]*$/.test(age))
        throw Error("--max-age-seconds must be an explicit positive integer.");
      const status = tool.checkProductionBackupHealth(
        await json(input),
        key,
        scope,
        {
          now: new Date(),
          maxAgeSeconds: Number(age),
        },
      );
      console.log(JSON.stringify(status));
    } else {
      const report = await tool.rehearseEncryptedBusinessRestore(
        await json(input),
        key,
        scope,
      );
      await write(required("--output"), JSON.stringify(report, null, 2) + "\n");
      console.log(
        JSON.stringify({
          rehearsalPassed: true,
          cloudDatabaseUsed: false,
          businessSha256: report.businessSha256,
          trialBalanceBalanced: report.trialBalanceBalanced,
          balanceSheetBalanced: report.balanceSheetBalanced,
        }),
      );
    }
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Offline operation failed.",
  );
  process.exitCode = 1;
}
