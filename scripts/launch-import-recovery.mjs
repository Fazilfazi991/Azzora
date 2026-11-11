// Offline migration/recovery workbench. No network, cloud apply, production import or financial-posting command exists.
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import console from "node:console";
import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
const [command, ...flags] = process.argv.slice(2),
  options = {};
if (
  ![
    "prepare-import",
    "verify-import",
    "verify-originals",
    "encrypt",
    "decrypt",
    "restore-rehearsal",
    "verify-production-backup",
    "monitor-production-backup",
    "watch-backup-monitor",
  ].includes(command)
) {
  console.error(
    "Use prepare-import | verify-import | verify-originals | encrypt | decrypt | restore-rehearsal | verify-production-backup | monitor-production-backup | watch-backup-monitor. Original verification requires --input, --manifest and --output; monitor commands require explicit status path and age limits.",
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
  input = command === "watch-backup-monitor" ? "" : required("--input");
await fs.mkdir("tmp/launch-tools", { recursive: true });
// Scheduled verification and its independent watchdog may start together.
// Never let concurrent invocations overwrite the same temporary module.
const runtimeFile = path.resolve(
  "tmp/launch-tools",
  `runtime-${process.pid}-${randomBytes(12).toString("hex")}.mjs`,
);
await build({
  stdin: {
    contents:
      'export {prepareImportReview,verifyImportReview} from "./src/backend/import-plan.ts"; export {verifyImportOriginals} from "./src/backend/import-originals.ts"; export {encryptBusinessBackup,decryptBusinessBackup} from "./src/backend/launch-backup.ts"; export {rehearseEncryptedBusinessRestore} from "./src/backend/launch-backup-rehearsal.ts"; export {checkProductionBackupHealth} from "./src/backend/backup-health.ts"; export {createBackupMonitorReceipt,checkBackupMonitorReceipt} from "./src/backend/backup-monitor.ts";',
    resolveDir: process.cwd(),
    loader: "ts",
  },
  outfile: runtimeFile,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  logLevel: "silent",
});
let tool;
try {
  tool = await import(pathToFileURL(runtimeFile).href);
} finally {
  await fs.unlink(runtimeFile);
}
const json = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const write = async (p, data) => {
  await fs.writeFile(p, data, { flag: "wx", mode: 0o600 });
};
const positiveAge = (flag) => {
  const value = required(flag);
  if (!/^[1-9][0-9]*$/.test(value))
    throw Error(flag + " must be an explicit positive integer.");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n > 31_536_000)
    throw Error(flag + " exceeds the supported limit.");
  return n;
};
const statusPath = () => {
  const value = required("--status-file");
  if (!path.isAbsolute(value) || !value.toLowerCase().endsWith(".json"))
    throw Error(
      "Use an absolute JSON status-file path in a private directory.",
    );
  return value;
};
async function isolatedStatusPath(value, protectedFiles) {
  const parent = await fs.realpath(path.dirname(value));
  const file = path.join(parent, path.basename(value));
  const equivalent = (value) =>
    process.platform === "win32"
      ? path.normalize(value).toLowerCase()
      : path.normalize(value);
  let status;
  try {
    status = await fs.lstat(file);
    if (!status.isFile() || status.isSymbolicLink())
      throw Error(
        "Backup monitor status must be a regular file in a private directory.",
      );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const protectedFile of protectedFiles.filter(Boolean)) {
    if (equivalent(file) === equivalent(path.resolve(protectedFile)))
      throw Error("Backup monitor status cannot overwrite a key or archive.");
    let actual;
    try {
      actual = await fs.realpath(protectedFile);
    } catch (error) {
      if (error.code === "ENOENT") {
        try {
          const parent = await fs.realpath(
            path.dirname(path.resolve(protectedFile)),
          );
          const projected = path.join(parent, path.basename(protectedFile));
          if (equivalent(file) === equivalent(projected))
            throw Error(
              "Backup monitor status cannot overwrite a key or archive.",
            );
        } catch (parentError) {
          if (parentError.code !== "ENOENT") throw parentError;
        }
        continue;
      }
      throw error;
    }
    if (equivalent(file) === equivalent(actual))
      throw Error("Backup monitor status cannot overwrite a key or archive.");
    if (status) {
      const protectedStat = await fs.stat(actual);
      if (
        status.ino &&
        protectedStat.ino &&
        status.dev === protectedStat.dev &&
        status.ino === protectedStat.ino
      )
        throw Error(
          "Backup monitor status cannot share a key or archive file.",
        );
    }
  }
  return file;
}
async function writeMonitorStatus(file, receipt) {
  const lock = file + ".lock",
    temporary = file + "." + randomBytes(12).toString("hex") + ".tmp";
  const handle = await fs.open(lock, "wx", 0o600);
  try {
    const out = await fs.open(temporary, "wx", 0o600);
    try {
      await out.writeFile(JSON.stringify(receipt) + "\n");
      await out.sync();
    } finally {
      await out.close();
    }
    await fs.rename(temporary, file);
  } finally {
    await handle.close();
    await fs.unlink(lock);
  }
}
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
  } else if (command === "verify-originals") {
    const manifestFile = path.resolve(required("--manifest"));
    const entries = await json(manifestFile);
    if (!Array.isArray(entries) || entries.length > 10000)
      throw Error(
        "Original manifest must be an array of at most 10,000 files.",
      );
    const originals = [];
    let total = 0;
    for (const entry of entries) {
      if (
        !entry ||
        Object.keys(entry).sort().join(",") !==
          "documentId,file,originalName" ||
        typeof entry.documentId !== "string" ||
        typeof entry.originalName !== "string" ||
        typeof entry.file !== "string" ||
        !entry.file.trim()
      )
        throw Error(
          "Each original manifest entry requires documentId, originalName and file only.",
        );
      const file = path.resolve(path.dirname(manifestFile), entry.file);
      let stat;
      try {
        stat = await fs.stat(file);
      } catch (error) {
        if (error?.code === "ENOENT") continue;
        throw error;
      }
      if (
        !stat.isFile() ||
        stat.size > 100 * 1024 * 1024 ||
        total + stat.size > 250 * 1024 * 1024
      )
        throw Error(
          "Originals must be files under 100 MiB each and 250 MiB total per check.",
        );
      const bytes = await fs.readFile(file);
      if (bytes.byteLength !== stat.size)
        throw Error(
          "An original changed during verification; retry with a stable copy.",
        );
      total += bytes.byteLength;
      originals.push({
        documentId: entry.documentId,
        originalName: entry.originalName,
        bytes,
      });
    }
    const result = tool.verifyImportOriginals(await json(input), originals);
    await write(required("--output"), JSON.stringify(result, null, 2) + "\n");
    console.log(
      JSON.stringify({
        status: result.status,
        documentCount: result.documentCount,
        verifiedCount: result.verifiedCount,
        issues: result.issues.length,
        manifestSha256: result.manifestSha256,
        publication: result.publication,
        financialPostingAllowed: false,
      }),
    );
    if (result.status === "blocked") process.exitCode = 1;
  } else {
    const keyPath = required("--key-file");
    const keyFile = await fs.readFile(keyPath);
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
      const age = positiveAge("--max-age-seconds");
      const status = tool.checkProductionBackupHealth(
        await json(input),
        key,
        scope,
        {
          now: new Date(),
          maxAgeSeconds: age,
        },
      );
      console.log(JSON.stringify(status));
    } else if (command === "monitor-production-backup") {
      const maxAgeSeconds = positiveAge("--max-age-seconds"),
        file = await isolatedStatusPath(statusPath(), [input, keyPath]);
      let status;
      try {
        status = tool.checkProductionBackupHealth(
          await json(input),
          key,
          scope,
          { now: new Date(), maxAgeSeconds },
        );
      } catch {
        status = null;
      }
      const receipt = tool.createBackupMonitorReceipt(key, {
        ...scope,
        checkedAt: new Date().toISOString(),
        maxBackupAgeSeconds: maxAgeSeconds,
        result: status ? "pass" : "fail",
        backupCapturedAt: status?.capturedAt || null,
      });
      await writeMonitorStatus(file, receipt);
      console.log(
        JSON.stringify({
          healthy: !!status,
          notificationDelivered: false,
          cloudRecoveryVerified: false,
        }),
      );
      if (!status) process.exitCode = 1;
    } else if (command === "watch-backup-monitor") {
      const maxBackupAgeSeconds = positiveAge("--max-age-seconds"),
        maxMonitorAgeSeconds = positiveAge("--max-monitor-age-seconds"),
        file = await isolatedStatusPath(statusPath(), [keyPath]);
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096)
        throw Error("Backup monitor status file is invalid.");
      const result = tool.checkBackupMonitorReceipt(await json(file), key, {
        ...scope,
        maxBackupAgeSeconds,
        maxMonitorAgeSeconds,
        now: new Date(),
      });
      console.log(JSON.stringify(result));
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
