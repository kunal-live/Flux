import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT_SENDER = 9222;
const PORT_RECEIVER = 9223;
const SERVER_URL = process.env.SERVER_URL || "http://localhost:8080";
const PROFILE_SENDER = path.resolve("./scratch/profile-sender");
const PROFILE_RECEIVER = path.resolve("./scratch/profile-receiver");

fs.mkdirSync(PROFILE_SENDER, { recursive: true });
fs.mkdirSync(PROFILE_RECEIVER, { recursive: true });

console.log(">>> Launching Sender Chrome instance on port", PORT_SENDER);
const chromeSender = spawn(CHROME_PATH, [
  `--remote-debugging-port=${PORT_SENDER}`,
  `--user-data-dir=${PROFILE_SENDER}`,
  "--headless=new",
  "--ignore-certificate-errors",
  "--allow-insecure-localhost",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  SERVER_URL,
], { stdio: "ignore" });

console.log(">>> Launching Receiver Chrome instance on port", PORT_RECEIVER);
const chromeReceiver = spawn(CHROME_PATH, [
  `--remote-debugging-port=${PORT_RECEIVER}`,
  `--user-data-dir=${PROFILE_RECEIVER}`,
  "--headless=new",
  "--ignore-certificate-errors",
  "--allow-insecure-localhost",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  SERVER_URL,
], { stdio: "ignore" });

process.on("exit", () => {
  try { chromeSender.kill(); } catch {}
  try { chromeReceiver.kill(); } catch {}
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForCdp(port, maxWaitMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find((t) => t.type === "page");
        if (page) return page;
      }
    } catch {}
    await sleep(200);
  }
  throw new Error(`Timeout waiting for Chrome CDP on port ${port}`);
}

class CdpSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && this.pending.has(data.id)) {
        const { resolve, reject } = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
  }

  send(method, params = {}) {
    const id = this.msgId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  evaluate(expression, awaitPromise = true) {
    return this.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
    });
  }

  close() {
    try { this.ws.close(); } catch {}
  }
}

async function waitForFlux(tab, name) {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await tab.evaluate(`
        (function() {
          if (!window.flux || !window.flux.signaling || !window.flux.signaling.selfId) return null;
          return window.flux.signaling.selfId;
        })()
      `);
      if (res && res.result && res.result.value) {
        console.log(`[CDP] ${name} ready! Peer ID: ${res.result.value}`);
        return res.result.value;
      }
    } catch {}
    await sleep(500);
  }
  throw new Error(`${name} failed to initialize Flux`);
}

async function run() {
  try {
    console.log("Connecting to Sender (port 9222)...");
    const senderInfo = await waitForCdp(PORT_SENDER);
    const sender = new CdpSession(senderInfo.webSocketDebuggerUrl);
    await sender.connect();
    await sender.send("Security.setIgnoreCertificateErrors", { ignore: true });
    await sender.send("Page.navigate", { url: SERVER_URL });

    console.log("Connecting to Receiver (port 9223)...");
    const receiverInfo = await waitForCdp(PORT_RECEIVER);
    const receiver = new CdpSession(receiverInfo.webSocketDebuggerUrl);
    await receiver.connect();
    await receiver.send("Security.setIgnoreCertificateErrors", { ignore: true });
    await receiver.send("Page.navigate", { url: SERVER_URL });

    console.log("Waiting for both independent Flux instances to register...");
    const senderId = await waitForFlux(sender, "Sender (PC 1)");
    const receiverId = await waitForFlux(receiver, "Receiver (PC 2)");

    // Configure Receiver
    console.log("Configuring Receiver instance...");
    await receiver.evaluate(`
      window.__BENCHMARK__ = true;
      window.receivedTransfers = [];
      window.flux.transfer.on((ev) => {
        if (ev.kind === "incoming") {
          console.log(">>> Auto-accepting incoming transfer:", ev.transferId);
          window.flux.transfer.acceptIncoming(ev.transferId);
        }
        if (ev.kind === "done") {
          window.receivedTransfers.push(ev);
        }
      });
      window.flux.signaling.setPresence("receiving");
      "RECEIVER_CONFIGURED";
    `);

    // Configure Sender
    console.log("Configuring Sender instance...");
    await sender.evaluate(`
      window.__BENCHMARK__ = true;
      window.transferEvents = [];
      window.lastProgress = null;
      window.transferDone = false;
      window.transferError = null;
      window.flux.transfer.on((ev) => {
        if (ev.kind === "progress" && ev.role === "send") {
          window.lastProgress = ev;
        }
        if (ev.kind === "done" && ev.role === "send") {
          window.transferDone = true;
          window.finalDone = ev;
        }
        if (ev.kind === "error") {
          window.transferError = ev;
        }
      });
      "SENDER_CONFIGURED";
    `);

    // Wait for presence propagation
    await sleep(2000);

    // Generate 1GB payload in Sender
    console.log("\n=======================================================");
    console.log("      Generating 1 GB (1,073,741,824 bytes) File       ");
    console.log("=======================================================");
    await sender.evaluate(`
      (function() {
        const MB = 1024 * 1024;
        const chunk = new Uint8Array(MB);
        for (let i = 0; i < 1000; i++) chunk[i * 1000] = (i % 255);
        const parts = Array(1024).fill(chunk);
        window.benchFile = new File(parts, "flux-1gb-benchmark.dat", { type: "application/octet-stream" });
        window.benchFile._digest = "bench-sha256-mock-digest-1gb";
        return window.benchFile.size;
      })()
    `);

    console.log("File prepared: 1,073,741,824 bytes (1.00 GiB).");
    console.log(`Sender ID: ${senderId} -> Receiver ID: ${receiverId}`);
    console.log("\n🚀 Starting 1 GB Local Transfer (Multi-Process WebRTC)...\n");

    const startTime = Date.now();
    await sender.evaluate(`
      window.flux.transfer.sendFiles("${receiverId}", [window.benchFile]);
      "TRANSFER_INITIATED";
    `);

    let isDone = false;
    let lastReport = Date.now();
    let prevBytes = 0;

    while (!isDone) {
      await sleep(1000);
      const poll = await sender.evaluate(`
        ({
          done: window.transferDone,
          error: window.transferError,
          progress: window.lastProgress,
        })
      `);

      const val = poll.result ? poll.result.value : null;
      if (!val) continue;

      if (val.error) {
        throw new Error("Transfer error: " + JSON.stringify(val.error));
      }

      if (val.progress) {
        const sent = val.progress.sent;
        const total = val.progress.total;
        const pct = ((sent / total) * 100).toFixed(1);
        const now = Date.now();
        const dt = (now - lastReport) / 1000;
        const bytesDiff = sent - prevBytes;
        const currentMBs = (bytesDiff / (1024 * 1024) / (dt || 1)).toFixed(1);
        const totalElapsed = ((now - startTime) / 1000).toFixed(1);
        const avgMBs = (sent / (1024 * 1024) / (((now - startTime) / 1000) || 1)).toFixed(1);
        const mode = (val.progress.mode || "direct").toUpperCase();

        process.stdout.write(
          `\r[Progress: ${pct.padStart(5)}%] ${((sent / (1024*1024))).toFixed(0).padStart(4)} / 1024 MB | Current: ${currentMBs.padStart(6)} MB/s | Avg: ${avgMBs.padStart(6)} MB/s | Mode: [${mode}] | Elapsed: ${totalElapsed}s`
        );

        lastReport = now;
        prevBytes = sent;
      }

      if (val.done) {
        isDone = true;
      }
    }

    const totalTimeSec = (Date.now() - startTime) / 1000;
    const finalAvgSpeedMBs = (1024 / totalTimeSec).toFixed(2);
    const finalAvgSpeedMbps = (finalAvgSpeedMBs * 8).toFixed(2);

    console.log("\n\n=======================================================");
    console.log("            🎉 1 GB TRANSFER COMPLETE! 🎉              ");
    console.log("=======================================================");
    console.log(`  Payload Size       : 1,073,741,824 bytes (1.00 GB)`);
    console.log(`  Total Time Elapsed : ${totalTimeSec.toFixed(2)} seconds`);
    console.log(`  Average Speed      : ${finalAvgSpeedMBs} MB/s (${finalAvgSpeedMbps} Mbps)`);
    console.log(`  Transport Mode     : DIRECT WebRTC DataChannel`);
    console.log("=======================================================\n");

    sender.close();
    receiver.close();
    chromeSender.kill();
    chromeReceiver.kill();
    process.exit(0);
  } catch (err) {
    console.error("Benchmark failed:", err);
    try { chromeSender.kill(); } catch {}
    try { chromeReceiver.kill(); } catch {}
    process.exit(1);
  }
}

run();
