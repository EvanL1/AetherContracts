import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  CONSUMER_LOCK_FAILURE_CODES,
  ConsumerLockFailure,
  extractVerifiedBundle,
  resolveConsumerLockPath,
  verifyActionCommit,
  verifyBundleBytes,
  verifyConsumerLock,
} from "../../scripts/verify-consumer-lock.mjs";
import { decodeJson } from "../lib/strict-json.mjs";

const repositoryRoot = new URL("../../", import.meta.url);
const execFileAsync = promisify(execFile);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function writeTarOctal(header, offset, length, value) {
  const encoded = value.toString(8).padStart(length - 1, "0");
  header.write(encoded, offset, length - 1, "ascii");
  header[offset + length - 1] = 0;
}

function tarEntry({ body = Buffer.alloc(0), linkName = "", name, type = "0" }) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  writeTarOctal(header, 100, 8, type === "5" ? 0o700 : 0o600);
  writeTarOctal(header, 108, 8, 0);
  writeTarOctal(header, 116, 8, 0);
  writeTarOctal(header, 124, 12, body.byteLength);
  writeTarOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header.write(type, 156, 1, "ascii");
  header.write(linkName, 157, 100, "utf8");
  header.write("ustar\0", 257, 6, "binary");
  header.write("00", 263, 2, "ascii");
  const checksum = header.reduce((total, byte) => total + byte, 0);
  const checksumText = checksum.toString(8).padStart(6, "0");
  header.write(checksumText, 148, 6, "ascii");
  header[154] = 0;
  header[155] = 0x20;
  const padding = Buffer.alloc((512 - (body.byteLength % 512)) % 512);
  return Buffer.concat([header, body, padding]);
}

function tarGzip(entries) {
  return gzipSync(Buffer.concat([...entries.map(tarEntry), Buffer.alloc(1024)]), {
    mtime: 0,
  });
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createConsumerFixture() {
  const root = await mkdtemp(join(tmpdir(), "aether-contract-consumer-"));
  const sourcePath = "schemas/cloudlink/v1alpha1/envelope.schema.json";
  const pendingPath = "schemas/cloudlink/v1alpha1/runtime-manifest.v1.schema.json";
  const destinationPath = "contracts/cloudlink/v1/envelope.schema.json";
  const manifestPath = "contracts/aether-contracts/v0.1.0-alpha.3/contract-manifest.json";
  const releaseRoot = join(root, "release");
  const sourceBytes = Buffer.from('{"schema":"example"}\n');
  const pendingBytes = Buffer.from('{"schema":"pending"}\n');
  const sourceDigest = sha256(sourceBytes);
  const pendingDigest = sha256(pendingBytes);

  await mkdir(join(root, "consumer", "contracts", "cloudlink", "v1"), {
    recursive: true,
  });
  await mkdir(join(root, "consumer", "contracts", "aether-contracts", "v0.1.0-alpha.3"), {
    recursive: true,
  });
  await mkdir(join(releaseRoot, "schemas", "cloudlink", "v1alpha1"), {
    recursive: true,
  });
  await writeFile(join(root, "consumer", destinationPath), sourceBytes);
  await writeFile(join(releaseRoot, sourcePath), sourceBytes);
  await writeFile(join(releaseRoot, pendingPath), pendingBytes);

  const manifest = {
    contract: "aether.contracts",
    release_version: "0.1.0-alpha.3",
    production_release: false,
    legacy_default: true,
    physical_control: false,
    artifacts: [
      { path: sourcePath, sha256: sourceDigest },
      { path: pendingPath, sha256: pendingDigest },
    ],
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(root, "consumer", manifestPath), manifestBytes);
  await writeFile(join(releaseRoot, "contract-manifest.json"), manifestBytes);

  const lock = {
    schema: "aether.contracts.consumer-lock.v1alpha1",
    status: "partial-consumer",
    repository: "https://github.com/EvanL1/AetherContracts",
    release: {
      version: "0.1.0-alpha.3",
      tag: "v0.1.0-alpha.3",
      tag_object: "a".repeat(40),
      commit: "b".repeat(40),
      bundle: {
        name: "AetherContracts-0.1.0-alpha.3.tar.gz",
        url: "https://github.com/EvanL1/AetherContracts/releases/download/v0.1.0-alpha.3/AetherContracts-0.1.0-alpha.3.tar.gz",
        root: "AetherContracts-0.1.0-alpha.3",
        size: 1234,
        sha256: "c".repeat(64),
        limits: {
          maximum_path_bytes: 512,
          maximum_file_bytes: 8_388_608,
          maximum_total_file_bytes: 67_108_864,
          maximum_entries: 4096,
        },
      },
    },
    manifest: {
      release_path: "contract-manifest.json",
      local_path: manifestPath,
      sha256: sha256(manifestBytes),
    },
    policy: {
      conformance_claim: "distribution-only",
      production_release: false,
      legacy_default: true,
      physical_control: false,
    },
    adoption: {
      scope: "cloudlink-alpha-interoperability",
      modules: ["cloudlink", "distribution", "tck"],
      closure: "required-artifacts",
      required_artifacts: [sourcePath, pendingPath],
    },
    imports: [
      {
        source: sourcePath,
        destination: destinationPath,
        sha256: sourceDigest,
      },
    ],
    pending_imports: [
      {
        source: pendingPath,
        sha256: pendingDigest,
        reason: "codec behavior is not yet conformant",
      },
    ],
  };
  const lockPath = join(root, "consumer", "aether-contracts.lock.json");
  await writeJson(lockPath, lock);

  return {
    cleanup: () => rm(root, { force: true, recursive: true }),
    consumerRoot: join(root, "consumer"),
    destinationPath,
    lock,
    lockPath,
    releaseRoot,
    sourceBytes,
  };
}

test("consumer lock schema is closed and preserves the safety boundary", async () => {
  const schema = decodeJson(
    await readFile(
      new URL(
        "schemas/distribution/v1alpha1/consumer-lock.schema.json",
        repositoryRoot,
      ),
    ),
  );
  const fixture = await createConsumerFixture();
  try {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    assert.equal(validate(fixture.lock), true, JSON.stringify(validate.errors));

    assert.equal(
      validate({ ...fixture.lock, policy: { ...fixture.lock.policy, legacy_default: false } }),
      false,
    );
    assert.equal(validate({ ...fixture.lock, unexpected: true }), false);
  } finally {
    await fixture.cleanup();
  }
});

test("offline verification binds the vendored manifest and imported consumer bytes", async () => {
  const fixture = await createConsumerFixture();
  try {
    const result = await verifyConsumerLock({
      consumerRoot: fixture.consumerRoot,
      lockPath: fixture.lockPath,
    });
    assert.deepEqual(result, {
      imported: 1,
      pending: 1,
      releaseCommit: "b".repeat(40),
      releaseVersion: "0.1.0-alpha.3",
      scope: "cloudlink-alpha-interoperability",
      status: "partial-consumer",
    });
  } finally {
    await fixture.cleanup();
  }
});

test("release-root verification proves source bytes as well as consumer bytes", async () => {
  const fixture = await createConsumerFixture();
  try {
    const result = await verifyConsumerLock({
      consumerRoot: fixture.consumerRoot,
      lockPath: fixture.lockPath,
      releaseRoot: fixture.releaseRoot,
    });
    assert.equal(result.imported, 1);
  } finally {
    await fixture.cleanup();
  }
});

test("consumer drift fails closed with a stable failure code", async () => {
  const fixture = await createConsumerFixture();
  try {
    await writeFile(
      join(fixture.consumerRoot, fixture.destinationPath),
      "mutated\n",
      "utf8",
    );
    await assert.rejects(
      verifyConsumerLock({
        consumerRoot: fixture.consumerRoot,
        lockPath: fixture.lockPath,
      }),
      (error) =>
        error instanceof ConsumerLockFailure &&
        error.code === "CONSUMER_ARTIFACT_DIGEST_MISMATCH",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("duplicate destinations and imported/pending overlap fail closed", async () => {
  const fixture = await createConsumerFixture();
  try {
    const duplicate = {
      ...fixture.lock,
      imports: [fixture.lock.imports[0], { ...fixture.lock.imports[0] }],
    };
    await writeJson(fixture.lockPath, duplicate);
    await assert.rejects(
      verifyConsumerLock({
        consumerRoot: fixture.consumerRoot,
        lockPath: fixture.lockPath,
      }),
      (error) =>
        error instanceof ConsumerLockFailure && error.code === "LOCK_PATH_CONFLICT",
    );

    await writeJson(fixture.lockPath, {
      ...fixture.lock,
      pending_imports: [
        {
          ...fixture.lock.pending_imports[0],
          source: fixture.lock.imports[0].source,
          sha256: fixture.lock.imports[0].sha256,
        },
      ],
    });
    await assert.rejects(
      verifyConsumerLock({
        consumerRoot: fixture.consumerRoot,
        lockPath: fixture.lockPath,
      }),
      (error) =>
        error instanceof ConsumerLockFailure && error.code === "LOCK_PATH_CONFLICT",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("adoption scope is an exact module closure and complete means every required artifact is imported", async () => {
  const fixture = await createConsumerFixture();
  try {
    await writeJson(fixture.lockPath, {
      ...fixture.lock,
      adoption: {
        ...fixture.lock.adoption,
        required_artifacts: [fixture.lock.adoption.required_artifacts[0]],
      },
    });
    await assert.rejects(
      verifyConsumerLock({
        consumerRoot: fixture.consumerRoot,
        lockPath: fixture.lockPath,
      }),
      (error) =>
        error instanceof ConsumerLockFailure && error.code === "ADOPTION_CLOSURE_MISMATCH",
    );

    await writeJson(fixture.lockPath, {
      ...fixture.lock,
      status: "complete-consumer",
    });
    await assert.rejects(
      verifyConsumerLock({
        consumerRoot: fixture.consumerRoot,
        lockPath: fixture.lockPath,
      }),
      (error) =>
        error instanceof ConsumerLockFailure && error.code === "ADOPTION_CLOSURE_MISMATCH",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("the action commit must exactly match the release commit in the lock", async () => {
  const fixture = await createConsumerFixture();
  try {
    const result = await verifyConsumerLock({
      actionCommit: fixture.lock.release.commit,
      consumerRoot: fixture.consumerRoot,
      lockPath: fixture.lockPath,
    });
    assert.equal(result.releaseCommit, fixture.lock.release.commit);

    assert.throws(
      () => verifyActionCommit("d".repeat(40), fixture.lock.release.commit),
      (error) =>
        error instanceof ConsumerLockFailure && error.code === "ACTION_COMMIT_MISMATCH",
    );
    assert.throws(
      () => verifyActionCommit("v0.1.0-alpha.3", fixture.lock.release.commit),
      (error) =>
        error instanceof ConsumerLockFailure && error.code === "ACTION_COMMIT_MISMATCH",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("consumer lock paths are portable relative paths confined to the consumer root", async () => {
  const fixture = await createConsumerFixture();
  try {
    assert.equal(
      resolveConsumerLockPath(fixture.consumerRoot, "aether-contracts.lock.json"),
      fixture.lockPath,
    );
    for (const candidate of [
      fixture.lockPath,
      "../aether-contracts.lock.json",
      "contracts\\aether-contracts.lock.json",
      "./aether-contracts.lock.json",
    ]) {
      assert.throws(
        () => resolveConsumerLockPath(fixture.consumerRoot, candidate),
        (error) =>
          error instanceof ConsumerLockFailure && error.code === "LOCK_SCHEMA_INVALID",
        candidate,
      );
    }
  } finally {
    await fixture.cleanup();
  }
});

test("all malformed manifest declarations return MANIFEST_INVALID", async () => {
  const fixture = await createConsumerFixture();
  try {
    const manifestBytes = await readFile(
      join(fixture.consumerRoot, fixture.lock.manifest.local_path),
    );
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    manifest.artifacts[0].path = "../escape";
    const invalidBytes = Buffer.from(`${JSON.stringify(manifest)}\n`);
    await writeFile(
      join(fixture.consumerRoot, fixture.lock.manifest.local_path),
      invalidBytes,
    );
    await writeJson(fixture.lockPath, {
      ...fixture.lock,
      manifest: { ...fixture.lock.manifest, sha256: sha256(invalidBytes) },
    });
    await assert.rejects(
      verifyConsumerLock({
        consumerRoot: fixture.consumerRoot,
        lockPath: fixture.lockPath,
      }),
      (error) =>
        error instanceof ConsumerLockFailure && error.code === "MANIFEST_INVALID",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("archive extraction accepts one bounded regular-file tree", async () => {
  const fixture = await createConsumerFixture();
  const temporaryRoot = await mkdtemp(join(tmpdir(), "aether-archive-test-"));
  try {
    const root = fixture.lock.release.bundle.root;
    const bundle = tarGzip([
      { name: `${root}/`, type: "5" },
      { name: `${root}/contract-manifest.json`, body: Buffer.from("{}\n") },
    ]);
    const releaseRoot = await extractVerifiedBundle(bundle, fixture.lock, temporaryRoot);
    assert.equal(
      (await readFile(join(releaseRoot, "contract-manifest.json"))).toString("utf8"),
      "{}\n",
    );
  } finally {
    await Promise.all([fixture.cleanup(), rm(temporaryRoot, { force: true, recursive: true })]);
  }
});

test("archive extraction accepts the exact git-archive layout used by releases", async () => {
  const fixture = await createConsumerFixture();
  const temporaryRoot = await mkdtemp(join(tmpdir(), "aether-git-archive-test-"));
  try {
    const root = fixture.lock.release.bundle.root;
    const { stdout } = await execFileAsync(
      "git",
      ["archive", "--format=tar", `--prefix=${root}/`, "HEAD"],
      {
        cwd: fileURLToPath(repositoryRoot),
        encoding: "buffer",
        maxBuffer: 80 * 1024 * 1024,
      },
    );
    const releaseRoot = await extractVerifiedBundle(
      gzipSync(stdout, { mtime: 0 }),
      fixture.lock,
      temporaryRoot,
    );
    assert.match(
      (await readFile(join(releaseRoot, "contract-manifest.json"))).toString("utf8"),
      /"contract": "aether\.contracts"/u,
    );
  } finally {
    await Promise.all([fixture.cleanup(), rm(temporaryRoot, { force: true, recursive: true })]);
  }
});

test("archive extraction rejects traversal, links, duplicate paths, and bounded-resource violations", async () => {
  const fixture = await createConsumerFixture();
  const root = fixture.lock.release.bundle.root;
  const cases = [
    [{ name: `${root}/../escape`, body: Buffer.from("x") }],
    [{ name: `${root}/link`, type: "2", linkName: "target" }],
    [{ name: `${root}/hardlink`, type: "1", linkName: `${root}/target` }],
    [
      { name: `${root}/same`, body: Buffer.from("a") },
      { name: `${root}/same`, body: Buffer.from("b") },
    ],
  ];

  try {
    for (const [index, entries] of cases.entries()) {
      const temporaryRoot = await mkdtemp(join(tmpdir(), `aether-archive-unsafe-${index}-`));
      try {
        await assert.rejects(
          extractVerifiedBundle(tarGzip(entries), fixture.lock, temporaryRoot),
          (error) =>
            error instanceof ConsumerLockFailure && error.code === "ARCHIVE_UNSAFE",
        );
      } finally {
        await rm(temporaryRoot, { force: true, recursive: true });
      }
    }

    for (const mutation of [
      { maximum_file_bytes: 3 },
      { maximum_total_file_bytes: 3 },
      { maximum_entries: 1 },
      { maximum_path_bytes: root.length + 2 },
    ]) {
      const temporaryRoot = await mkdtemp(join(tmpdir(), "aether-archive-limit-"));
      const lock = structuredClone(fixture.lock);
      Object.assign(lock.release.bundle.limits, mutation);
      try {
        await assert.rejects(
          extractVerifiedBundle(
            tarGzip([
              { name: `${root}/one`, body: Buffer.from("four") },
              { name: `${root}/two`, body: Buffer.from("four") },
            ]),
            lock,
            temporaryRoot,
          ),
          (error) =>
            error instanceof ConsumerLockFailure &&
            error.code === "ARCHIVE_LAYOUT_MISMATCH",
        );
      } finally {
        await rm(temporaryRoot, { force: true, recursive: true });
      }
    }
  } finally {
    await fixture.cleanup();
  }
});

test("bundle verification binds exact size and digest before extraction", async () => {
  const bytes = Buffer.from("authenticated release bytes");
  assert.doesNotThrow(() =>
    verifyBundleBytes(bytes, { size: bytes.length, sha256: sha256(bytes) }),
  );
  assert.throws(
    () => verifyBundleBytes(bytes, { size: bytes.length + 1, sha256: sha256(bytes) }),
    (error) =>
      error instanceof ConsumerLockFailure && error.code === "BUNDLE_SIZE_MISMATCH",
  );
  assert.throws(
    () => verifyBundleBytes(bytes, { size: bytes.length, sha256: "d".repeat(64) }),
    (error) =>
      error instanceof ConsumerLockFailure && error.code === "BUNDLE_DIGEST_MISMATCH",
  );
});

test("consumer verifier failure codes are published in the common taxonomy", async () => {
  const taxonomy = decodeJson(
    await readFile(new URL("compatibility/failure-codes.json", repositoryRoot)),
  );
  const published = new Set(taxonomy.failures.map((failure) => failure.code));
  assert.deepEqual(
    CONSUMER_LOCK_FAILURE_CODES.filter((code) => !published.has(code)),
    [],
  );
});
