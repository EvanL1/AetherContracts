import { constants } from "node:fs";
import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const COMMON_SCHEMAS = [
  "data-loss.schema.json",
  "durable-ack.schema.json",
  "envelope.schema.json",
  "heartbeat.schema.json",
  "replay-request.schema.json",
  "runtime-manifest-report.schema.json",
  "runtime-manifest.v1.schema.json",
  "session-accepted.schema.json",
  "session-hello.schema.json",
  "telemetry-batch.schema.json",
];

const COMMON_FIXTURES = [
  "conflicting-replay.json",
  "data-loss.valid.json",
  "durable-ack.valid.json",
  "heartbeat-ack.valid.json",
  "heartbeat.valid.json",
  "invalid-digest.json",
  "overflow-uint64.json",
  "oversized-payload.json",
  "replay-request.valid.json",
  "runtime-manifest-report.valid.json",
  "session-accepted.valid.json",
  "session-hello.valid.json",
  "stale-ack.json",
  "telemetry-batch.valid.json",
  "unknown-field.json",
  "unsafe-uint64.json",
  "unsupported-version.json",
  "wrong-session-epoch.json",
];

function parseArguments(argv) {
  const result = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error("usage: --cloud <contract-dir> --edge <contract-dir>");
    }
    result.set(key.slice(2), value);
  }
  const cloud = result.get("cloud");
  const edge = result.get("edge");
  if (cloud === undefined || edge === undefined) {
    throw new Error("both --cloud and --edge are required");
  }
  return { cloud: resolve(cloud), edge: resolve(edge) };
}

async function assertReadableDirectory(path) {
  await access(path, constants.R_OK);
}

async function assertByteIdentical(cloudPath, edgePath) {
  const [cloudBytes, edgeBytes] = await Promise.all([readFile(cloudPath), readFile(edgePath)]);
  if (!cloudBytes.equals(edgeBytes)) {
    throw new Error(`refusing disputed contract file: ${basename(cloudPath)}`);
  }
}

async function importFiles({ cloud, edge }) {
  const repositoryRoot = resolve(new URL("..", import.meta.url).pathname);
  const schemaTarget = resolve(repositoryRoot, "schemas/cloudlink/v1alpha1");
  const fixtureTarget = resolve(repositoryRoot, "fixtures/cloudlink/v1alpha1");
  await Promise.all([mkdir(schemaTarget, { recursive: true }), mkdir(fixtureTarget, { recursive: true })]);

  for (const file of COMMON_SCHEMAS) {
    const cloudPath = resolve(cloud, file);
    const edgePath = resolve(edge, file);
    await assertByteIdentical(cloudPath, edgePath);
    await copyFile(cloudPath, resolve(schemaTarget, file));
  }

  for (const file of COMMON_FIXTURES) {
    const cloudPath = resolve(cloud, "fixtures", file);
    const edgePath = resolve(edge, "fixtures", file);
    await assertByteIdentical(cloudPath, edgePath);
    await copyFile(cloudPath, resolve(fixtureTarget, file));
  }
}

const sources = parseArguments(process.argv.slice(2));
await Promise.all([assertReadableDirectory(sources.cloud), assertReadableDirectory(sources.edge)]);
await importFiles(sources);
