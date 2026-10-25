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
let stopping = false;
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
  prepareBackend();
  prepareJudge0();
  console.log("Frontend: http://localhost:5173 | Backend: http://localhost:8000");
  console.log("Ctrl+C zatrzymuje oba serwery. Baza i Judge0 pozostaja uruchomione.");
  start(python, backendArgs, backend);
  start(process.execPath, [vite, "--host", "localhost", "--port", "5173", "--strictPort"], frontend);
}

main().catch((error) => {
  console.error(error.message);
  stop(1);
});
