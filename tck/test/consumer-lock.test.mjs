import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  CONSUMER_LOCK_FAILURE_CODES,
  ConsumerLockFailure,
  verifyBundleBytes,
  verifyConsumerLock,
} from "../../scripts/verify-consumer-lock.mjs";
import { decodeJson } from "../lib/strict-json.mjs";

const repositoryRoot = new URL("../../", import.meta.url);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createConsumerFixture() {
  const root = await mkdtemp(join(tmpdir(), "aether-contract-consumer-"));
  const sourcePath = "schemas/cloudlink/v1alpha1/envelope.schema.json";
  const pendingPath = "schemas/cloudlink/v1alpha1/runtime-manifest.v1.schema.json";
  const destinationPath = "contracts/cloudlink/v1/envelope.schema.json";
  const manifestPath = "contracts/aether-contracts/v0.1.0-alpha.2/contract-manifest.json";
  const releaseRoot = join(root, "release");
  const sourceBytes = Buffer.from('{"schema":"example"}\n');
  const pendingBytes = Buffer.from('{"schema":"pending"}\n');
  const sourceDigest = sha256(sourceBytes);
  const pendingDigest = sha256(pendingBytes);

  await mkdir(join(root, "consumer", "contracts", "cloudlink", "v1"), {
    recursive: true,
  });
  await mkdir(join(root, "consumer", "contracts", "aether-contracts", "v0.1.0-alpha.2"), {
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
    release_version: "0.1.0-alpha.2",
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
      version: "0.1.0-alpha.2",
      tag: "v0.1.0-alpha.2",
      tag_object: "a".repeat(40),
      commit: "b".repeat(40),
      bundle: {
        name: "AetherContracts-0.1.0-alpha.2.tar.gz",
        url: "https://github.com/EvanL1/AetherContracts/releases/download/v0.1.0-alpha.2/AetherContracts-0.1.0-alpha.2.tar.gz",
        root: "AetherContracts-0.1.0-alpha.2",
        size: 1234,
        sha256: "c".repeat(64),
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
      releaseVersion: "0.1.0-alpha.2",
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
