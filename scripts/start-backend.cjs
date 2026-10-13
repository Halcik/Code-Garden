const { existsSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const backend = path.resolve(__dirname, "../backend");
const python = path.join(backend, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: backend, stdio: "inherit" });
  if (result.error) {
    console.error(`Nie mozna uruchomic ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function prepareBackend() {
  if (!existsSync(python) || !existsSync(path.join(backend, ".env"))) {
    console.error("Najpierw przygotuj backend/.venv i backend/.env zgodnie z backend/README.md.");
    process.exit(1);
  }
  console.log("Uruchamianie PostgreSQL (Docker Desktop musi byc wlaczony)...");
  run("docker", ["compose", "up", "-d", "--wait"]);
  console.log("Aktualizacja tabel bazy...");
  run(python, ["-m", "alembic", "upgrade", "head"]);
}

const backendArgs = ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload"];
module.exports = { prepareBackend, backend, python, backendArgs };

if (require.main === module) {
  prepareBackend();
  console.log("Uruchamianie backendu: http://localhost:8000 (Ctrl+C zatrzymuje serwer)");
  run(python, backendArgs);
}
