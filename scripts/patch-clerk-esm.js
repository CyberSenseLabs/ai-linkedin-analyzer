// @clerk/nextjs's published ESM dist (dist/esm/**/*.js) contains relative
// import/export/dynamic-import specifiers without file extensions
// (e.g. `from "./routeMatcher"`). Bundlers tolerate this, but Node's native
// ESM resolver (used by Vercel's Node.js Middleware) rejects it with
// ERR_MODULE_NOT_FOUND. This script rewrites those specifiers in place to
// add the missing ".js" (or "/index.js") extension so middleware.ts can be
// loaded directly by Node.
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { glob } from "node:fs/promises";

const projectRoot = resolve(import.meta.dirname, "..");
const nodeModules = join(projectRoot, "node_modules");
const root = join(nodeModules, "@clerk/nextjs/dist/esm");

if (!existsSync(root)) {
  process.exit(0);
}

const specifierPattern = /((?:from|import)\s*\(?\s*["'])([^"']+)(["'])/g;

let patchedFiles = 0;
let patchedSpecifiers = 0;

for await (const file of glob("**/*.js", { cwd: root })) {
  const filePath = join(root, file);
  const source = readFileSync(filePath, "utf8");
  const fileDir = dirname(filePath);

  let changed = false;
  const updated = source.replace(specifierPattern, (match, prefix, specifier, suffix) => {
    if (/\.(js|mjs|cjs|json|css)$/.test(specifier)) {
      return match;
    }

    let baseDir;
    if (specifier.startsWith(".")) {
      // Relative imports resolve against the importing file's directory.
      baseDir = fileDir;
    } else {
      // Bare subpath imports (e.g. "next/navigation") only need an extension
      // when the target package has no "exports" map — packages with an
      // exports map (e.g. "react") resolve subpaths themselves and must be
      // left untouched.
      const scoped = specifier.startsWith("@");
      const pkgName = specifier.split("/").slice(0, scoped ? 2 : 1).join("/");
      const pkgJsonPath = join(nodeModules, pkgName, "package.json");
      if (!existsSync(pkgJsonPath)) {
        return match;
      }
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
      if (pkgJson.exports) {
        return match;
      }
      baseDir = nodeModules;
    }
    const asFile = resolve(baseDir, `${specifier}.js`);
    const asIndex = resolve(baseDir, specifier, "index.js");

    let resolved = null;
    if (existsSync(asFile) && statSync(asFile).isFile()) {
      resolved = `${specifier}.js`;
    } else if (existsSync(asIndex) && statSync(asIndex).isFile()) {
      resolved = `${specifier}/index.js`;
    }

    if (!resolved) {
      return match;
    }

    changed = true;
    patchedSpecifiers += 1;
    return `${prefix}${resolved}${suffix}`;
  });

  // Node's native ESM loader requires `with { type: "json" }` on JSON
  // imports, which this dist also omits (e.g. `import pkg from "next/package.json"`).
  const jsonImportPattern = /(import\s+\w+\s+from\s+["'][^"']+\.json["'])(\s*;)/g;
  const withJsonAttrs = updated.replace(jsonImportPattern, (match, importClause, terminator) => {
    if (/\bwith\s*\{/.test(match)) {
      return match;
    }
    changed = true;
    patchedSpecifiers += 1;
    return `${importClause} with { type: "json" }${terminator}`;
  });

  if (changed) {
    writeFileSync(filePath, withJsonAttrs);
    patchedFiles += 1;
  }
}

console.log(`patch-clerk-esm: patched ${patchedSpecifiers} import specifier(s) across ${patchedFiles} file(s)`);
