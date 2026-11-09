const { existsSync } = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { prepareBackend, backend, python, backendArgs } = require("./start-backend.cjs");
const { prepareJudge0 } = require("./start-judge0.cjs");
const { checkDevPorts } = require("./check-dev-ports.cjs");

const frontend = path.resolve(__dirname, "../frontend");
const vite = path.join(frontend, "node_modules/vite/bin/vite.js");
if (!existsSync(vite)) {
  console.error("Najpierw zainstaluj frontend: npm run setup");
  process.exit(1);
}

const children = [];
const containerProjects = [];
let stopping = false;
// Also clean up when a preparation script exits after a failed command.
process.on("exit", () => {
  for (const cwd of [...containerProjects].reverse()) {
    console.log(`Zatrzymywanie kontenerow: ${path.relative(backend, cwd) || "PostgreSQL"}...`);
    const result = spawnSync("docker", ["compose", "stop"], {
      cwd, stdio: "inherit", windowsHide: true,
    });
    if (result.error || result.status !== 0) {
      console.error(`Nie udalo sie zatrzymac kontenerow w ${cwd}: ${result.error?.message || "docker compose stop zakonczyl sie bledem"}`);
      process.exitCode = 1;
    }
  }
});
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid) continue;
    if (process.platform === "win32") {
      // Uvicorn reload and Vite can create children; stop the entire tree.
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore", windowsHide: true,
      });
    } else {
      try { process.kill(-child.pid, "SIGTERM"); } catch (error) {
        if (error.code !== "ESRCH") console.error(error.message);
      }
    }
  }
  process.exit(code);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

function start(command, args, cwd) {
  const child = spawn(command, args, {
    cwd, stdio: "inherit", detached: process.platform !== "win32",
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code ?? 1));
}

async function main() {
  await checkDevPorts();
  containerProjects.push(backend);
  prepareBackend();
  containerProjects.push(path.join(backend, "judge0"));
  prepareJudge0();
  console.log("Frontend: http://localhost:5173 | Backend: http://localhost:8000");
  console.log("Ctrl+C zatrzymuje oba serwery oraz kontenery bazy i Judge0.");
  start(python, backendArgs, backend);
  start(process.execPath, [vite, "--host", "localhost", "--port", "5173", "--strictPort"], frontend);
}

main().catch((error) => {
  console.error(error.message);
  stop(1);
});
