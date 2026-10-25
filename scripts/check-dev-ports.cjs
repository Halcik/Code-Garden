const net = require("node:net");

function checkPort(port, host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        reject(new Error(`Port ${port} jest juz zajety. Poprzedni frontend lub backend moze nadal dzialac. Zatrzymaj poprzednie npm run dev przez Ctrl+C w jego terminalu, a potem sprobuj ponownie.`));
      } else if (host === "::1" && ["EAFNOSUPPORT", "EADDRNOTAVAIL"].includes(error.code)) {
        resolve(); // IPv6 may be disabled on this machine.
      } else {
        reject(error);
      }
    });
    server.listen({ port, host, exclusive: true }, () => server.close(resolve));
  });
}

async function checkDevPorts() {
  for (const port of [5173, 8000]) {
    await checkPort(port, "127.0.0.1");
    await checkPort(port, "::1");
  }
}

module.exports = { checkDevPorts, checkPort };
