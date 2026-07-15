import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

const repositoryRoot = new URL("../", import.meta.url);
const buildRoot = new URL("../build/cmake-package-smoke/", import.meta.url);
const producerBuild = new URL("producer/", buildRoot);
const installPrefix = new URL("install/", buildRoot);
const consumerBuild = new URL("consumer/", buildRoot);
const consumerSource = new URL("../tck/consumers/cmake/", import.meta.url);

function pathOf(url) {
  return decodeURIComponent(url.pathname);
}

function run(command, arguments_) {
  const result = spawnSync(command, arguments_, {
    cwd: pathOf(repositoryRoot),
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${command} ${arguments_.join(" ")} failed`);
  }
}

rmSync(buildRoot, { force: true, recursive: true });
run("cmake", [
  "-S",
  pathOf(repositoryRoot),
  "-B",
  pathOf(producerBuild),
  "-DCMAKE_BUILD_TYPE=Release",
  "-DBUILD_TESTING=OFF",
  `-DCMAKE_INSTALL_PREFIX=${pathOf(installPrefix)}`,
]);
run("cmake", ["--build", pathOf(producerBuild), "--config", "Release"]);
run("cmake", ["--install", pathOf(producerBuild), "--config", "Release"]);
run("cmake", [
  "-S",
  pathOf(consumerSource),
  "-B",
  pathOf(consumerBuild),
  "-DCMAKE_BUILD_TYPE=Release",
  `-DCMAKE_PREFIX_PATH=${pathOf(installPrefix)}`,
]);
run("cmake", ["--build", pathOf(consumerBuild), "--config", "Release"]);
run("ctest", ["--test-dir", pathOf(consumerBuild), "--output-on-failure", "-C", "Release"]);

process.stdout.write("CMake install and downstream find_package smoke passed\n");
