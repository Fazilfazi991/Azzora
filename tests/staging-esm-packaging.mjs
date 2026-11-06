import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import ts from "typescript";
const root = fileURLToPath(new URL("../", import.meta.url));
async function graph(entry) {
  const files = new Map(),
    problems = [];
  async function visit(file) {
    if (files.has(file)) return;
    const source = await fs.readFile(file, "utf8");
    files.set(file, source);
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true),
      imports = [];
    function scan(node) {
      if (ts.isStringLiteralLike(node)) {
        const p = node.parent;
        if (
          (((ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) &&
            p.moduleSpecifier === node) ||
            (ts.isCallExpression(p) &&
              p.expression.kind === ts.SyntaxKind.ImportKeyword &&
              p.arguments[0] === node) ||
            (ts.isLiteralTypeNode(p) && ts.isImportTypeNode(p.parent))) &&
          node.text.startsWith(".")
        )
          imports.push(node.text);
      }
      ts.forEachChild(node, scan);
    }
    scan(ast);
    for (const spec of imports) {
      if (!path.extname(spec))
        problems.push(path.relative(root, file) + " -> " + spec);
      const target = path.resolve(path.dirname(file), spec),
        candidates = spec.endsWith(".js")
          ? [target.slice(0, -3) + ".ts", target.slice(0, -3) + ".tsx", target]
          : [
              target + ".ts",
              target + ".tsx",
              target,
              path.join(target, "index.ts"),
            ];
      let resolved;
      for (const c of candidates) {
        try {
          if ((await fs.stat(c)).isFile()) {
            resolved = c;
            break;
          }
        } catch {}
      }
      assert.ok(resolved, "Relative dependency resolves: " + spec);
      if (/\.[cm]?[jt]sx?$/.test(resolved)) await visit(resolved);
      else files.set(resolved, await fs.readFile(resolved, "utf8"));
    }
  }
  await visit(entry);
  return { files, problems };
}
test(
  "staging function graph has explicit ESM specifiers and starts under native Node after transpilation",
  { timeout: 60000 },
  async () => {
    const { files, problems } = await graph(path.join(root, "api/staging.ts"));
    assert.deepEqual(
      problems,
      [],
      "Vercel preserves import specifiers; all relative source dependencies require extensions",
    );
    const tempRoot = path.join(root, "tmp");
    await fs.mkdir(tempRoot, { recursive: true });
    const out = await fs.mkdtemp(path.join(tempRoot, "staging-esm-proof-"));
    try {
      await fs.writeFile(path.join(out, "package.json"), '{"type":"module"}');
      for (const [file, source] of files) {
        const destination = path.join(
          out,
          path.relative(root, file).replace(/\.tsx?$/, ".js"),
        );
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(
          destination,
          /\.tsx?$/.test(file)
            ? ts.transpileModule(source, {
                fileName: file,
                compilerOptions: {
                  target: ts.ScriptTarget.ES2022,
                  module: ts.ModuleKind.ESNext,
                  jsx: ts.JsxEmit.ReactJSX,
                  verbatimModuleSyntax: false,
                },
              }).outputText
            : source,
        );
      }
      const entry = pathToFileURL(path.join(out, "api/staging.js")).href;
      const result = execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `const {default:endpoint}=await import(${JSON.stringify(entry)}); if(typeof endpoint?.fetch!=='function') throw Error('No deployable staging fetch export'); console.log('Native Node staging startup passed');`,
        ],
        { cwd: root, encoding: "utf8", timeout: 20000 },
      );
      assert.match(result, /Native Node staging startup passed/);
      console.log(
        JSON.stringify({
          reachableSourceFiles: files.size,
          nativeNodeStartup: true,
          paidCalls: 0,
        }),
      );
    } finally {
      const resolved = path.resolve(out);
      assert.ok(
        resolved.startsWith(path.resolve(tempRoot) + path.sep) &&
          path.basename(resolved).startsWith("staging-esm-proof-"),
      );
      await fs.rm(resolved, { recursive: true, force: true });
    }
  },
);
