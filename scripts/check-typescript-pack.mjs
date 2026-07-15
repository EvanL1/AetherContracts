import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function assertPackageSurface(label, report) {
  const paths = new Set(report.files.map((entry) => entry.path));

  for (const required of [
    "LICENSE",
    "README.md",
    "package.json",
    "dist/src/index.js",
    "dist/src/index.d.ts",
  ]) {
    assert.ok(paths.has(required), `${label} package is missing ${required}`);
  }

  assert.equal(
    [...paths].some((path) => path.startsWith("dist/test/")),
    false,
    `${label} package must not contain compiled tests`,
  );
}

const pnpmResult = spawnSync(
  "pnpm",
  ["--filter", "@aether-contracts/typescript", "pack", "--dry-run", "--json"],
  { encoding: "utf8" },
);
assert.equal(pnpmResult.status, 0, pnpmResult.stderr || pnpmResult.stdout);
assertPackageSurface("pnpm", JSON.parse(pnpmResult.stdout));

const npmResult = spawnSync(
  "npm",
  ["pack", "--dry-run", "--json"],
  { cwd: new URL("../packages/typescript/", import.meta.url), encoding: "utf8" },
);
assert.equal(npmResult.status, 0, npmResult.stderr || npmResult.stdout);
const npmReports = JSON.parse(npmResult.stdout);
assert.equal(npmReports.length, 1, "npm must report exactly one package");
assertPackageSurface("npm", npmReports[0]);
