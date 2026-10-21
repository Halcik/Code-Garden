const { existsSync } = require("node:fs");
const path = require("node:path");
const { backend, python, run } = require("./start-backend.cjs");

function prepareJudge0() {
  if (!existsSync(python)) {
    console.error("Najpierw przygotuj backend/.venv zgodnie z backend/README.md.");
    process.exit(1);
  }
  const judge0 = path.join(backend, "judge0");
  const compose = ["compose", "-f", path.join(judge0, "compose.yaml")];
  run(python, [path.join(judge0, "init_env.py")]);
  console.log("Przygotowanie obrazu Judge0 (kolejne uruchomienia korzystaja z cache)...");
  run("docker", [...compose, "build", "server"]);
  console.log("Uruchamianie Judge0 i oczekiwanie na gotowosc...");
  run("docker", [...compose, "up", "-d", "--no-build", "--wait", "--wait-timeout", "180"]);
}

module.exports = { prepareJudge0 };

if (require.main === module) {
  prepareJudge0();
  console.log("Judge0: http://localhost:2358 (kontenery dzialaja w tle)");
}
