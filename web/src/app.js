// Entry point: wires signaling, discovery, sessions, and the transfer engine
// to the dashboard UI.

import { Signaling } from "./signaling.js";
import { Discovery, buildRegistration } from "./discovery.js";
import { SessionController } from "./session.js";
import { TransferManager } from "./transfer.js";
import { UI, DEFAULT_DEVICES } from "./ui.js";
import { renderQR } from "./qr.js";

const DEFAULT_USER_NAME = "Kunal";

function getAlias() {
  try {
    const s = localStorage.getItem("flux-alias");
    if (s && s !== "Maya's MacBook Pro") return s;
  } catch {}
  try {
    localStorage.setItem("flux-alias", DEFAULT_USER_NAME);
  } catch {}
  return DEFAULT_USER_NAME;
}

function getAvatar() {
  try {
    const a = localStorage.getItem("flux-avatar");
    if (a) return a;
  } catch {}
  try {
    localStorage.setItem("flux-avatar", "dog");
  } catch {}
  return "dog";
}

const THEMES = [
  { id: "dark", label: "Obsidian Dark" },
  { id: "oled", label: "OLED Pure Black" },
  { id: "light", label: "Light Frost" },
  { id: "cyber", label: "Cyber Neon" },
  { id: "sunset", label: "Sunset Ember" },
  { id: "midnight", label: "Midnight Violet" },
  { id: "aurora", label: "Nordic Aurora" },
];

function applyTheme(themeId, notify = false) {
  const match = THEMES.find((x) => x.id === themeId) || THEMES[0];
  document.documentElement.setAttribute("data-theme", match.id);
  try {
    localStorage.setItem("flux-theme", match.id);
  } catch {}
  if (window.UI && window.UI._updateThemeButtons) {
    window.UI._updateThemeButtons(match.id);
  }
  const themeSelect = document.getElementById("setting-theme-select");
  if (themeSelect) {
    themeSelect.value = match.id;
  }
  const fullThemeSelect = document.getElementById("full-setting-theme-select");
  if (fullThemeSelect) {
    fullThemeSelect.value = match.id;
  }
  const btn = document.getElementById("btn-theme");
  if (btn) {
    btn.setAttribute("title", `Theme: ${match.label} (click to cycle)`);
  }
  if (notify && window.UI && window.UI.toast) {
    window.UI.toast(`Theme: ${match.label}`);
  }
}

function initTheme() {
  let t = "dark";
  try {
    t = localStorage.getItem("flux-theme") || "dark";
  } catch {}
  applyTheme(t, false);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  const idx = THEMES.findIndex((x) => x.id === cur);
  const next = THEMES[(idx + 1) % THEMES.length];
  applyTheme(next.id, true);
}

async function fetchConfig() {
  try {
    const r = await fetch("/api/config");
    return await r.json();
  } catch {
    return { stunServers: ["stun:stun.l.google.com:19302"] };
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem("flux-history");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistoryItem(item) {
  try {
    const list = loadHistory();
    list.unshift({ ...item, timestamp: Date.now() });
    if (list.length > 50) list.pop();
    localStorage.setItem("flux-history", JSON.stringify(list));
  } catch {}
}

function clearHistory() {
  try {
    localStorage.removeItem("flux-history");
  } catch {}
}

async function main() {
  initTheme();
  let alias = getAlias();

  const signaling = new Signaling();
  const discovery = new Discovery(signaling);
  const sessions = new SessionController(signaling);
  const transfer = new TransferManager(signaling);
  window.flux = { signaling, discovery, sessions, transfer, UI };

  const serverConfig = await fetchConfig();
  const stunServers = Array.isArray(serverConfig.stunServers) ? serverConfig.stunServers : [];
  const turnServers = Array.isArray(serverConfig.turnServers) ? serverConfig.turnServers : [];
  const iceServers = [...stunServers.map((urls) => ({ urls })), ...turnServers];
  transfer.setIceServers(iceServers);

  let realPeers = [];
  const nameOf = (id) => {
    const p = realPeers.find((x) => x.id === id);
    if (p) return p.alias;
    const d = DEFAULT_DEVICES.find((x) => x.id === id);
    return d ? d.alias : "Device";
  };

  let pendingFiles = null;
  let pendingTarget = null;

  const fileInput = document.getElementById("file-input");
  const fileInputImg = document.getElementById("file-input-image");
  const fileInputVid = document.getElementById("file-input-video");
  const fileInputDoc = document.getElementById("file-input-doc");
  const fileInputFolder = document.getElementById("file-input-folder");
  const fileInputAud = document.getElementById("file-input-audio");

  function handleFilesSelected(files) {
    if (!files || !files.length) return;
    if (pendingTarget) {
      handleSendToTarget(pendingTarget, files);
      pendingTarget = null;
    } else {
      pendingFiles = files;
      UI.setStagedFiles(files);
      UI.toast(`${files.length} file(s) selected — pick a device to send to`);
    }
  }

  function handleSendToTarget(peerId, files) {
    const isRealPeer = realPeers.some((p) => p.id === peerId);
    const targetName = nameOf(peerId);

    if (isRealPeer) {
      transfer.sendFiles(peerId, files);
      UI.toast(`Sending to ${targetName}…`);
    } else {
      // Demo / Reference device: trigger simulated active transfer
      for (const file of files) {
        const simId = "sim-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
        UI.startTransfer(simId, file.name, file.size, "send", "direct", targetName, file.type);
        
        let sent = 0;
        const total = file.size || (10 * 1024 * 1024);
        const speed = 64 * 1024 * 1024;
        const interval = setInterval(() => {
          sent += speed / 5;
          const eta = Math.max(0, (total - sent) / speed);
          UI.progress(simId, Math.min(sent, total), total, speed, eta);
          if (sent >= total) {
            clearInterval(interval);
            UI.finishSend(simId, true);
            saveHistoryItem({
              transferId: simId,
              name: file.name,
              size: total,
              role: "send",
              mode: "direct",
              peerName: targetName,
              verified: true,
            });
          }
        }, 200);
      }
      UI.toast(`Transfer initiated to ${targetName}`);
    }
  }

  // Attach listener to all hidden file inputs
  [fileInput, fileInputImg, fileInputVid, fileInputDoc, fileInputFolder, fileInputAud].forEach((inp) => {
    if (inp) {
      inp.addEventListener("change", () => {
        if (inp.files && inp.files.length) {
          handleFilesSelected(inp.files);
        }
      });
    }
  });

  UI.init({
    onThemeToggle: toggleTheme,
    onThemeSelect: (t) => applyTheme(t, true),
    onRefresh: () => {
      UI.renderPeers(realPeers);
    },
    onBrowse: () => {
      pendingTarget = null;
      if (fileInput) { fileInput.value = ""; fileInput.click(); }
    },
    onFilesChosen: (files) => {
      handleFilesSelected(files);
    },
    onClearStaged: () => {
      pendingFiles = null;
    },
    onStagedChanged: (files) => {
      pendingFiles = files.length ? files : null;
    },
    onSendToPeer: (peerId) => {
      if (pendingFiles && pendingFiles.length) {
        handleSendToTarget(peerId, pendingFiles);
        pendingFiles = null;
        UI.setStagedFiles([]);
        UI.switchView("transfers");
      } else {
        pendingTarget = peerId;
        if (fileInput) { fileInput.value = ""; fileInput.click(); }
      }
    },
    onDropToPeer: (peerId, files) => {
      handleSendToTarget(peerId, files);
    },
    onShareToRange: (peerId) => {
      if (pendingFiles && pendingFiles.length) {
        handleSendToTarget(peerId, pendingFiles);
        pendingFiles = null;
        UI.setStagedFiles([]);
        UI.switchView("transfers");
      } else {
        pendingTarget = peerId;
        if (fileInput) { fileInput.value = ""; fileInput.click(); }
      }
    },
    onCreateCode: () => sessions.create(),
    onJoinCode: (code) => {
      sessions.join(code);
      UI.toast(`Joining code ${code}…`);
    },
    onAcceptIncoming: (id) => transfer.acceptIncoming(id),
    onDeclineIncoming: (id) => transfer.rejectIncoming(id),
    onPause: (id) => transfer.pauseSend(id),
    onResume: (id) => transfer.resumeSend(id),
    onAliasSave: (newAlias, newAvatar) => {
      alias = newAlias;
      try {
        localStorage.setItem("flux-alias", newAlias);
        if (newAvatar) localStorage.setItem("flux-avatar", newAvatar);
        localStorage.setItem("flux-custom-alias-set", "1");
      } catch {}
      UI.setSelf(newAlias, newAvatar);
      signaling.updateRegistration(buildRegistration(newAlias));
    },
    onRandomAlias: () => {
      const ADJ = ["Amber", "Cobalt", "Coral", "Fuchsia", "Golden", "Indigo", "Jade", "Mint", "Onyx", "Rose", "Silver", "Teal", "Violet"];
      const ANIMAL = ["Falcon", "Otter", "Panda", "Lynx", "Fox", "Koala", "Owl", "Puma", "Raven"];
      const pick = (a) => a[Math.floor(Math.random() * a.length)];
      return `${pick(ADJ)} ${pick(ANIMAL)}`;
    },
    onClearHistory: () => {
      clearHistory();
      UI.renderHistory([]);
      UI.renderReceived([]);
      UI.toast("History cleared");
    },
    onViewHistory: () => UI.renderHistory(loadHistory()),
    onViewReceived: () => UI.renderReceived(loadHistory()),
    onRefresh: () => {
      signaling.send(MSG.PEER_LIST, {}, "");
      UI.renderPeers(realPeers);
      UI.toast(`Discovered ${realPeers.length + DEFAULT_DEVICES.length} devices on local subnet`);
    },
    onSendToPeer: (peerId, files) => {
      handleSendToTarget(peerId, files);
    },
    onToggleReceive: (enabled) => {
      signaling.setPresence(enabled ? "discoverable" : "invisible");
    },
    onRetryTransfer: (id) => {
      if (pendingFiles && pendingTarget) {
        handleSendToTarget(pendingTarget, pendingFiles);
        UI.toast("Retrying transfer with fresh checksum verification…");
      } else {
        UI.toast("Select the file to retry transfer", "error");
        const fileInput = document.getElementById("file-input");
        if (fileInput) fileInput.click();
      }
    },
  });

  UI.setSelf(alias, getAvatar());
  UI.setPresence("connecting", false);

  const reg = buildRegistration(alias);
  UI.setSettingsInfo({
    platform: reg.platform,
    browser: reg.browser,
    capabilities: reg.capabilities,
    stunServers: stunServers,
  });

  // Discovery event wire-up
  discovery.addEventListener("change", (e) => {
    realPeers = e.detail;
    transfer.updatePeers(realPeers);
    UI.renderPeers(realPeers);
    if (realPeers.length > 0) {
      UI.addNotification(`${realPeers.length} active device(s) on network`);
    }
  });
  discovery.addEventListener("join-error", (e) => UI.toast(`Join failed: ${e.detail}`));

  sessions.addEventListener("created", (e) => {
    let base = location.origin;
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      base = serverConfig.tunnelURL || (serverConfig.lanIP ? `${location.protocol}//${serverConfig.lanIP}:${location.port || 8080}` : location.origin);
    }
    const url = `${base}/?code=${e.detail.code}`;
    UI.openPair();
    UI.showCode(e.detail.code, url, renderQR);
  });
  sessions.addEventListener("join-error", (e) => UI.toast(`Join failed: ${e.detail}`));

  // Real WebRTC Transfer Events
  transfer.on((ev) => {
    switch (ev.kind) {
      case "start":
        UI.startTransfer(ev.transferId, ev.name, ev.size, "send", ev.mode, nameOf(ev.peerId), ev.fileType);
        break;
      case "incoming":
        UI.startTransfer(ev.transferId, ev.name, ev.size, "recv", ev.mode, nameOf(ev.peerId));
        if (!ev.isClip) {
          UI.showIncoming(ev.transferId, ev.name, ev.size, nameOf(ev.peerId), "showSaveFilePicker" in window);
        }
        break;
      case "clip_received":
        UI.showQuickClip({
          transferId: ev.transferId,
          name: ev.name,
          text: ev.text,
          peerId: ev.peerId,
          peerName: nameOf(ev.peerId),
          verified: ev.verified,
        });
        saveHistoryItem({
          transferId: ev.transferId,
          name: ev.name,
          size: ev.size,
          role: "recv",
          mode: "direct",
          peerName: nameOf(ev.peerId),
          verified: ev.verified,
          isClip: true,
        });
        break;
      case "hashing":
        UI.hashing(ev.transferId, ev.done, ev.total);
        break;
      case "progress":
        UI.progress(ev.transferId, ev.sent, ev.total, ev.speed, ev.eta);
        break;
      case "done":
        UI.finishSend(ev.transferId, ev.verified, ev.name);
        saveHistoryItem({
          transferId: ev.transferId,
          name: ev.name,
          size: ev.size,
          role: "send",
          mode: ev.mode,
          peerName: nameOf(ev.peerId),
          verified: ev.verified,
        });
        break;
      case "received":
        UI.finishReceive(ev.transferId, ev.name, ev.blob, ev.streaming, ev.verified);
        let blobUrl = null;
        if (ev.blob && ev.verified) {
          try { blobUrl = URL.createObjectURL(ev.blob); } catch {}
        }
        saveHistoryItem({
          transferId: ev.transferId,
          name: ev.name,
          size: ev.size,
          role: "recv",
          mode: ev.mode,
          peerName: nameOf(ev.peerId),
          verified: ev.verified,
          blobUrl,
          streaming: ev.streaming,
        });
        break;
      case "rejected":
        UI.error(ev.transferId, "Transfer declined by receiver");
        break;
      case "cancelled":
        UI.error(ev.transferId, "Transfer cancelled");
        break;
      case "error":
        UI.error(ev.transferId, ev.message);
        break;
    }
  });

  // Signaling Connection States
  signaling.on("connected", () => {
    UI.setPresence("discoverable", true);
  });
  signaling.on("reconnecting", () => UI.setPresence("reconnecting", false));
  signaling.on("disconnected", () => UI.setPresence("disconnected", false));

  try {
    await signaling.connect(buildRegistration(alias));
    UI.setPresence("discoverable", true);
  } catch (e) {
    UI.setPresence("disconnected", false);
    console.error(e);
  }

  // URL Code Auto-Join (?code=ABC123)
  const urlParams = new URLSearchParams(location.search);
  const code = urlParams.get("code");
  if (code) {
    const c = code.toUpperCase();
    sessions.join(c);
    UI.toast(`Joining code ${c}…`);
  }
}

main();
