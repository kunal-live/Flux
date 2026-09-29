// ==========================================================================
// FLUX UI CONTROLLER — Gold & Obsidian Canva Edition
// Handles views, dynamic device rendering, file queues, hero progress rings,
// modals, and real-time P2P status updates.
// ==========================================================================

import { AVATARS, getAvatarById, getAvatarSvg } from "./avatars.js";
import { Sound } from "./audio.js";
import { Notifier } from "./notifications.js";
import { QRScanner } from "./scanner.js";
import { encryptString, decryptString, isEncryptedPayload } from "./crypto.js";

const $ = (id) => document.getElementById(id);

export const DEFAULT_DEVICES = [
  {
    id: "dev-macbook",
    alias: "Kunal",
    platform: "windows",
    deviceType: "laptop",
    isSelf: true,
    statusText: "This device",
    statusType: "gold",
    avatar: "dog",
  },
  {
    id: "dev-imac",
    alias: "Studio iMac",
    platform: "macos",
    deviceType: "desktop",
    isSelf: false,
    statusText: "Available",
    statusType: "green",
    avatar: "cat",
  },
  {
    id: "dev-pixel",
    alias: "Pixel 9",
    platform: "android",
    deviceType: "phone",
    isSelf: false,
    statusText: "Available",
    statusType: "green",
    avatar: "fox",
  },
  {
    id: "dev-ipad",
    alias: "Jordan's iPad",
    platform: "ios",
    deviceType: "tablet",
    isSelf: false,
    statusText: "Available",
    statusType: "green",
    avatar: "bunny",
  },
];

export const RECENT_TRANSFERS = [
  {
    id: "hist-1",
    name: "Brand assets.zip",
    date: "May 21, 2025 - 2:48 PM",
    direction: "out",
    device: "Studio iMac",
    deviceType: "desktop",
    size: "1.24 GB",
    status: "Completed",
    icon: "🗜",
  },
  {
    id: "hist-2",
    name: "Q3 footage.mov",
    date: "May 21, 2025 - 1:15 PM",
    direction: "in",
    device: "Pixel 9",
    deviceType: "phone",
    size: "4.86 GB",
    status: "Completed",
    icon: "🎬",
  },
  {
    id: "hist-3",
    name: "Invoices.pdf",
    date: "May 21, 2025 - 11:02 AM",
    direction: "out",
    device: "Studio iMac",
    deviceType: "desktop",
    size: "2.13 MB",
    status: "Completed",
    icon: "📄",
  },
];

export const TIMELINE_HISTORY = [
  {
    group: "Today",
    items: [
      { id: "th-1", name: "Drone_4K_001.mp4", sub: "Studio iMac", size: "2.48 GB", time: "10:42 AM", icon: "🎬", role: "sent" },
      { id: "th-2", name: "Project_FLux_Assets", sub: "to Maya's MacBook Pro", size: "1.12 GB", time: "9:17 AM", icon: "📁", role: "sent" },
      { id: "th-3", name: "site_report.pdf", sub: "to Pixel 9", size: "3.2 MB", time: "8:03 AM", icon: "📄", role: "sent" },
    ]
  },
  {
    group: "Yesterday",
    items: [
      { id: "th-4", name: "IMG_7721.jpg", sub: "from Pixel 9", size: "5.6 MB", time: "9:48 PM", icon: "🖼", role: "received" },
      { id: "th-5", name: "Design_Reference", sub: "from Studio iMac", size: "712 MB", time: "6:21 PM", icon: "📁", role: "received" },
    ]
  },
  {
    group: "May 19",
    items: [
      { id: "th-6", name: "Timelapse_Final.mov", sub: "to Studio iMac", size: "1.94 GB", time: "11:15 PM", icon: "🎬", role: "sent" },
      { id: "th-7", name: "Ambient_Mix_v2.wav", sub: "from Maya's MacBook Pro", size: "83.7 MB", time: "4:07 PM", icon: "🎵", role: "received" },
      { id: "th-8", name: "Archive_2025_05_09.zip", sub: "to Pixel 9", size: "420 MB", time: "10:32 AM", icon: "🗜", role: "sent" },
    ]
  },
];

export const DEFAULT_QUEUE_FILES = [
  { name: "Brand_assets.zip", size: 842 * 1024 * 1024, type: "ZIP archive", icon: "🗜" },
  { name: "Product_demo.mov", size: 1.4 * 1024 * 1024 * 1024, type: "QuickTime movie", icon: "🎬" },
  { name: "Press_photos", size: 326 * 1024 * 1024, type: "Folder", icon: "📁" },
  { name: "Readme.pdf", size: 2.8 * 1024 * 1024, type: "PDF document", icon: "📄" },
];

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getDeviceVectorSVG(type) {
  if (type === "desktop") {
    return `<svg width="42" height="34" viewBox="0 0 24 24" fill="none" stroke="#F5BE38" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>`;
  }
  if (type === "phone") {
    return `<svg width="24" height="36" viewBox="0 0 24 24" fill="none" stroke="#F5BE38" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="3"/>
      <line x1="12" y1="18" x2="12.01" y2="18"/>
    </svg>`;
  }
  // Laptop default
  return `<svg width="46" height="34" viewBox="0 0 24 24" fill="none" stroke="#F5BE38" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="12" rx="2"/>
    <path d="M2 18h20"/>
  </svg>`;
}

export const UI = {
  h: {},
  _incomingId: null,
  _currentPeers: [],
  _activeView: "dashboard",
  _activeTransferTab: "active",
  _currentAlias: "Kunal",
  _currentAvatar: "dog",
  _selectedProfileAvatar: "dog",
  _activeDashboardMode: "send",
  _stagedFiles: [],
  _selectedTargetPeer: null,
  _heroTransfer: {
    peerName: "Kunal",
    pct: 68,
    bytesSent: 1.74 * 1024 * 1024 * 1024,
    bytesTotal: 2.57 * 1024 * 1024 * 1024,
    speed: 18.6 * 1024 * 1024,
    eta: 46,
    isPaused: false,
    files: [
      { name: "Brand_assets.zip", progress: 100, status: "Complete", icon: "🗜" },
      { name: "Product_demo.mov", progress: 54, status: "Sending...", icon: "🎬" },
      { name: "Press_photos", progress: 0, status: "Queued", icon: "📁" },
      { name: "Readme.pdf", progress: 0, status: "Queued", icon: "📄" },
    ],
  },

  init(handlers) {
    this.h = handlers || {};

    // Load persisted device name and cartoon avatar
    try {
      const savedAlias = localStorage.getItem("flux-alias");
      if (savedAlias && savedAlias !== "Maya's MacBook Pro") {
        this._currentAlias = savedAlias;
      } else {
        this._currentAlias = "Kunal";
        localStorage.setItem("flux-alias", "Kunal");
      }

      const savedAvatar = localStorage.getItem("flux-avatar");
      if (savedAvatar) {
        this._currentAvatar = savedAvatar;
      } else {
        this._currentAvatar = "dog";
        localStorage.setItem("flux-avatar", "dog");
      }
    } catch {}

    this.setSelf(this._currentAlias, this._currentAvatar);

    // 1. macOS Window Traffic Light Controls
    document.querySelector(".win-close")?.addEventListener("click", () => {
      this.toast("Flux minimized to background dock");
    });
    document.querySelector(".win-min")?.addEventListener("click", () => {
      const windowEl = document.querySelector(".flux-window");
      if (windowEl) {
        windowEl.classList.toggle("minimized");
        this.toast(windowEl.classList.contains("minimized") ? "Window minimized" : "Window restored");
      }
    });
    document.querySelector(".win-max")?.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        this.toast("Fullscreen mode entered");
      } else {
        document.exitFullscreen().catch(() => {});
        this.toast("Fullscreen mode exited");
      }
    });

    // 2. Navigation item click bindings
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.dataset.view;
        this.switchView(view);
      });
    });

    // 3. Topbar Buttons & Status Pills
    $("btn-open-pair")?.addEventListener("click", () => this.openPair());
    $("btn-quick-pair")?.addEventListener("click", () => this.openPair());
    $("btn-pair-from-devices")?.addEventListener("click", () => this.openPair());
    $("btn-scanner-pair")?.addEventListener("click", () => this.openPair());

    $("btn-help")?.addEventListener("click", () => this.openHelp());
    $("btn-close-help")?.addEventListener("click", () => this.closeHelp());
    $("btn-help-ok")?.addEventListener("click", () => this.closeHelp());
    $("help-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "help-modal") this.closeHelp();
    });

    $("btn-metrics")?.addEventListener("click", () => this.openDiagnostics());
    $("btn-close-diagnostics")?.addEventListener("click", () => this.closeDiagnostics());
    $("btn-diagnostics-close")?.addEventListener("click", () => this.closeDiagnostics());
    $("btn-refresh-diagnostics")?.addEventListener("click", () => this.refreshDiagnostics());
    $("diagnostics-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "diagnostics-modal") this.closeDiagnostics();
    });

    $("btn-network-scope")?.addEventListener("click", () => this.openDiagnostics());
    $("btn-conn-status")?.addEventListener("click", () => this.openDiagnostics());

    $("btn-node-info")?.addEventListener("click", () => this.openProfileModal());
    $("btn-profile-pill")?.addEventListener("click", () => this.openProfileModal());
    $("btn-edit-alias")?.addEventListener("click", () => this.openProfileModal());
    $("btn-edit-device-name")?.addEventListener("click", () => this.openProfileModal());

    // 4. Primary Mode Switcher (Send & Receive)
    $("tab-mode-send")?.addEventListener("click", () => this.switchDashboardMode("send"));
    $("tab-mode-receive")?.addEventListener("click", () => this.switchDashboardMode("receive"));

    // 5. Orbital Radar Antenna
    $("orbital-radar-widget")?.addEventListener("click", () => {
      const sym = document.querySelector(".refresh-symbol");
      if (sym) {
        sym.style.transform = "rotate(360deg)";
        setTimeout(() => (sym.style.transform = ""), 400);
      }
      this.toast("Scanning local P2P subnet for nearby devices…");
      if (this.h.onRefresh) this.h.onRefresh();
    });

    // 6. Dashboard Controls
    const dashDrop = $("dash-dropzone");
    if (dashDrop) {
      dashDrop.addEventListener("click", () => $("file-input")?.click());
      this._setupDragDrop(dashDrop);
    }
    $("btn-choose-files")?.addEventListener("click", (e) => {
      e.stopPropagation();
      $("file-input")?.click();
    });
    $("btn-choose-folder")?.addEventListener("click", (e) => {
      e.stopPropagation();
      $("file-input-folder")?.click();
    });

    // Clipboard Paste Button & Global Shortcut
    $("btn-paste-clipboard")?.addEventListener("click", async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.read) {
          const items = await navigator.clipboard.read();
          const files = [];
          for (const item of items) {
            for (const type of item.types) {
              if (type.startsWith("image/") || type.startsWith("application/") || type.startsWith("text/")) {
                const blob = await item.getType(type);
                const ext = type.split("/")[1] || "dat";
                const file = new File([blob], `clipboard-${Date.now()}.${ext}`, { type });
                files.push(file);
                break;
              }
            }
          }
          if (files.length > 0) {
            this.setStagedFiles(files);
            this.toast(`${files.length} file(s) staged from clipboard!`, "success");
            this.switchDashboardMode("send");
            return;
          }
        }
        this.toast("Press Ctrl+V (or Cmd+V) to paste any copied file or screenshot here!", "info");
      } catch {
        this.toast("Press Ctrl+V (or Cmd+V) to paste any copied file or screenshot here!", "info");
      }
    });

    window.addEventListener("paste", (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
        const files = Array.from(e.clipboardData.files);
        this.setStagedFiles(files);
        this.toast(`${files.length} file(s) pasted from clipboard!`, "success");
        this.switchDashboardMode("send");
      }
    });

    // Staged Files Controls
    $("btn-send-change-files")?.addEventListener("click", () => $("file-input")?.click());
    $("btn-send-clear-files")?.addEventListener("click", () => {
      this.clearStagedFiles();
      this.toast("Staged files cleared");
    });

    // Receive Section Controls
    $("btn-receive-refresh-conn")?.addEventListener("click", () => {
      const sym = $("btn-receive-refresh-conn")?.querySelector(".refresh-symbol");
      if (sym) {
        sym.style.transform = "rotate(360deg)";
        setTimeout(() => sym.style.transform = "", 400);
      }
      this.checkReceiveConnectivity();
      this.toast("Wi-Fi & Bluetooth checked • Radar active", "success");
    });

    $("btn-change-folder")?.addEventListener("click", () => $("display-save-folder")?.click());

    // Profile Modal Listeners
    $("btn-close-profile")?.addEventListener("click", () => this.closeProfileModal());
    $("btn-profile-cancel")?.addEventListener("click", () => this.closeProfileModal());
    $("profile-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "profile-modal") this.closeProfileModal();
    });

    $("profile-name-input")?.addEventListener("input", (e) => {
      const val = e.target.value.trim() || "Your Name";
      if ($("profile-preview-name")) $("profile-preview-name").textContent = val;
    });

    $("btn-profile-random-name")?.addEventListener("click", () => {
      const creativeNames = [
        "Kunal's Laptop", "Kunal (Flux)", "Astro Kunal", "Cosmic Node",
        "Cyber Spark", "Quantum Flux", "Neon Pilot", "Hyper Kunal"
      ];
      const rand = creativeNames[Math.floor(Math.random() * creativeNames.length)];
      if ($("profile-name-input")) $("profile-name-input").value = rand;
      if ($("profile-preview-name")) $("profile-preview-name").textContent = rand;
    });

    $("btn-save-profile")?.addEventListener("click", () => {
      const nameInput = $("profile-name-input");
      const nameVal = nameInput ? nameInput.value.trim() : "";
      const finalAlias = nameVal || "Kunal";
      const finalAvatar = this._selectedProfileAvatar || "dog";

      try {
        localStorage.setItem("flux-alias", finalAlias);
        localStorage.setItem("flux-avatar", finalAvatar);
      } catch {}

      this.setSelf(finalAlias, finalAvatar);
      this.closeProfileModal();
      this.toast(`Profile updated: ${finalAlias} (${getAvatarById(finalAvatar).name})`, "success");

      if (this.h.onAliasSave) {
        this.h.onAliasSave(finalAlias, finalAvatar);
      }
    });

    $("toggle-receive")?.addEventListener("change", (e) => {
      const enabled = e.target.checked;
      const lead = document.querySelector(".recv-lead");
      const desc = document.querySelector(".recv-desc");
      if (lead) lead.textContent = enabled ? "Ready to receive files" : "Receive disabled (Hidden mode)";
      if (desc) desc.textContent = enabled ? "Other devices can send files to this device." : "This device is invisible to other network devices.";
      this.toast(enabled ? "Device is now discoverable" : "Device is now hidden from discovery");
      if (this.h.onToggleReceive) this.h.onToggleReceive(enabled);
    });

    const savedFolder = localStorage.getItem("flux-save-folder") || "~/Downloads/Flux Received";
    if ($("display-save-folder")) $("display-save-folder").textContent = savedFolder;
    if ($("setting-folder")) $("setting-folder").value = savedFolder;

    $("display-save-folder")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if ("showDirectoryPicker" in window) {
        try {
          const dirHandle = await window.showDirectoryPicker();
          const folderName = `~/${dirHandle.name}`;
          if ($("display-save-folder")) $("display-save-folder").textContent = folderName;
          if ($("setting-folder")) $("setting-folder").value = folderName;
          localStorage.setItem("flux-save-folder", folderName);
          this.toast(`Save destination changed to ${folderName}`);
        } catch {}
      } else {
        const next = prompt("Enter local download folder path:", savedFolder);
        if (next) {
          if ($("display-save-folder")) $("display-save-folder").textContent = next;
          if ($("setting-folder")) $("setting-folder").value = next;
          localStorage.setItem("flux-save-folder", next);
          this.toast(`Save destination changed to ${next}`);
        }
      }
    });

    document.querySelector(".folder-name-row")?.addEventListener("click", () => {
      $("file-input-folder")?.click();
    });

    $("btn-dash-refresh")?.addEventListener("click", () => {
      const sym = document.querySelector(".refresh-symbol");
      if (sym) {
        sym.style.transform = "rotate(360deg)";
        setTimeout(() => (sym.style.transform = ""), 400);
      }
      this.toast("Scanning local network for devices…");
      if (this.h.onRefresh) this.h.onRefresh();
    });

    $("btn-view-all-transfers")?.addEventListener("click", () => {
      this.switchView("transfers");
    });

    $("btn-troubleshoot")?.addEventListener("click", () => this.openTroubleshoot());
    $("btn-close-troubleshoot")?.addEventListener("click", () => this.closeTroubleshoot());
    $("btn-troubleshoot-pair")?.addEventListener("click", () => {
      this.closeTroubleshoot();
      this.openPair();
    });
    $("troubleshoot-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "troubleshoot-modal") this.closeTroubleshoot();
    });

    // 6. Send View Controls
    $("target-device-picker")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._toggleTargetPickerDropdown();
    });

    $("btn-add-more-files")?.addEventListener("click", () => {
      $("file-input")?.click();
    });

    $("btn-execute-send")?.addEventListener("click", () => {
      this._executeSendQueue();
    });

    $("toggle-keep-originals")?.addEventListener("change", (e) => {
      this.toast(e.target.checked ? "Keep original files: ON" : "Keep original files: OFF");
    });
    $("toggle-encrypt")?.addEventListener("change", (e) => {
      this.toast(e.target.checked ? "End-to-End Encryption: ON" : "End-to-End Encryption: OFF");
    });

    // 7. Transfers View Controls
    document.querySelectorAll(".xfer-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".xfer-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        this._activeTransferTab = tab.dataset.tab;
        this._renderTransfersTab(tab.dataset.tab);
      });
    });

    $("btn-hero-pause")?.addEventListener("click", () => {
      this._heroTransfer.isPaused = !this._heroTransfer.isPaused;
      const isPaused = this._heroTransfer.isPaused;
      $("hero-pause-text").textContent = isPaused ? "Resume" : "Pause";
      $("hero-pause-icon").textContent = isPaused ? "▶" : "⏸";
      $("hero-speed-display").textContent = isPaused ? "Paused" : "18.6 MB/s";
      this.toast(isPaused ? "Transfer paused" : "Transfer resumed");
      if (isPaused && this.h.onPause) this.h.onPause();
      if (!isPaused && this.h.onResume) this.h.onResume();
    });

    $("btn-hero-cancel")?.addEventListener("click", () => {
      this.toast("Transfer cancelled", "error");
      const card = $("hero-transfer-card");
      if (card) {
        card.style.opacity = "0.4";
        setTimeout(() => { card.style.opacity = "1"; this.switchView("dashboard"); }, 600);
      }
    });

    $("btn-retry-failed")?.addEventListener("click", () => {
      this.toast("Retrying Product_demo.mov over P2P DataChannel…");
      const card = $("failed-transfer-card");
      if (card) card.style.display = "none";
      this.updateHeroProgress(1, 1.6 * 1024 * 1024 * 1024, 28 * 1024 * 1024, 52);
    });

    // 8. History View Controls
    document.querySelectorAll(".h-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        document.querySelectorAll(".h-pill").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        const filter = pill.dataset.filter || "all";
        const query = $("history-search-input") ? $("history-search-input").value : "";
        this.renderHistoryTimeline(filter, query);
      });
    });

    $("history-search-input")?.addEventListener("input", (e) => {
      const activePill = document.querySelector(".h-pill.active");
      const filter = activePill ? activePill.dataset.filter : "all";
      this.renderHistoryTimeline(filter, e.target.value);
    });

    document.querySelector(".history-filter-btn")?.addEventListener("click", () => {
      this._historySortDesc = !this._historySortDesc;
      this.toast(this._historySortDesc ? "Sorted: Oldest first" : "Sorted: Newest first");
      const activePill = document.querySelector(".h-pill.active");
      const filter = activePill ? activePill.dataset.filter : "all";
      const query = $("history-search-input") ? $("history-search-input").value : "";
      this.renderHistoryTimeline(filter, query);
    });

    $("btn-clear-all-history")?.addEventListener("click", () => {
      if (this.h.onClearHistory) this.h.onClearHistory();
      const container = $("history-timeline-container");
      if (container) container.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-dim);">Transfer history cleared</div>`;
      this.toast("Transfer history cleared");
    });

    // 9. Paired Devices View Controls
    document.querySelectorAll(".btn-manage-dev").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const card = e.target.closest(".paired-dev-card");
        const title = card ? card.querySelector(".dev-title")?.textContent : "Maya's MacBook Pro";
        const sub = card ? card.querySelector(".dev-ip-sub")?.textContent : "192.168.1.12";
        this.openDevManage({ alias: title, ip: sub });
      });
    });

    document.querySelectorAll(".btn-more-dots").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const card = e.target.closest(".paired-dev-card");
        const title = card ? card.querySelector(".dev-title")?.textContent : "Studio iMac";
        const sub = card ? card.querySelector(".dev-ip-sub")?.textContent : "192.168.1.27";
        this.openDevManage({ alias: title, ip: sub });
      });
    });

    $("btn-close-dev-manage")?.addEventListener("click", () => this.closeDevManage());
    $("btn-dev-send-files")?.addEventListener("click", () => {
      this.closeDevManage();
      if (this._managedDevice) {
        this._selectedTargetPeer = this._managedDevice;
        if ($("send-target-name")) $("send-target-name").textContent = this._managedDevice.alias;
      }
      this.switchView("send");
    });
    $("btn-dev-ping")?.addEventListener("click", () => {
      this.toast("Ping response: 1.8ms • DTLS 1.2 active", "success");
    });
    $("btn-dev-forget")?.addEventListener("click", () => {
      this.toast(`Unpaired ${this._managedDevice ? this._managedDevice.alias : "device"}`, "error");
      this.closeDevManage();
    });
    $("dev-manage-name-input")?.addEventListener("change", (e) => {
      const newAlias = e.target.value.trim();
      if (newAlias && this._managedDevice) {
        this._managedDevice.alias = newAlias;
        if ($("dev-manage-title")) $("dev-manage-title").textContent = newAlias;
        this.toast(`Device alias updated to "${newAlias}"`);
      }
    });
    $("device-manage-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "device-manage-modal") this.closeDevManage();
    });

    // 10. Settings View (Full Page) Switches & Selects Persistence
    document.querySelectorAll("#view-settings .flux-switch input").forEach((sw, idx) => {
      const key = `flux-pref-sw-${idx}`;
      try {
        const saved = localStorage.getItem(key);
        if (saved !== null) sw.checked = saved === "1";
      } catch {}
      sw.addEventListener("change", (e) => {
        try { localStorage.setItem(key, e.target.checked ? "1" : "0"); } catch {}
        const row = e.target.closest(".settings-switch-row");
        const label = row ? row.querySelector(".sw-label")?.textContent : "Setting";
        this.toast(`${label}: ${e.target.checked ? 'Enabled' : 'Disabled'}`);
      });
    });

    document.querySelectorAll("#view-settings .settings-mini-select").forEach((sel, idx) => {
      const key = `flux-pref-sel-${idx}`;
      try {
        const saved = localStorage.getItem(key);
        if (saved) sel.value = saved;
      } catch {}
      sel.addEventListener("change", (e) => {
        try { localStorage.setItem(key, e.target.value); } catch {}
        this.toast(`Preference saved: ${e.target.value}`);
      });
    });

    $("btn-clear-trusted")?.addEventListener("click", () => {
      this.toast("Cleared trusted devices list");
    });

    // 11. Modals: Pair, Settings, Incoming
    $("btn-close-pair")?.addEventListener("click", () => this.closePair());
    $("btn-cancel-pairing")?.addEventListener("click", () => this.closePair());
    $("pair-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "pair-modal") this.closePair();
    });

    $("code-value")?.addEventListener("click", async () => {
      const code = $("code-value")?.textContent.replace(/\s+/g, "") || "482916";
      try {
        await navigator.clipboard.writeText(code);
        this.toast(`PIN code ${code} copied to clipboard!`);
      } catch {
        this.toast(`PIN code: ${code}`);
      }
    });

    $("pair-input-alias")?.addEventListener("change", (e) => {
      const val = e.target.value.trim();
      if (val && this.h.onAliasSave) {
        this.h.onAliasSave(val);
        this.setSelf(val);
        this.toast(`Device name updated to ${val}`);
      }
    });

    $("btn-confirm-pairing")?.addEventListener("click", () => {
      const code = $("code-value")?.textContent.replace(/\s+/g, "") || "482916";
      const targetAlias = $("pair-target-alias")?.textContent || "Device";
      const trust = $("check-trust-device")?.checked;
      if (trust) {
        try {
          const trusted = JSON.parse(localStorage.getItem("flux-trusted-devices") || "[]");
          if (!trusted.includes(targetAlias)) {
            trusted.push(targetAlias);
            localStorage.setItem("flux-trusted-devices", JSON.stringify(trusted));
          }
        } catch {}
      }
      this.toast(`Pairing confirmed with ${targetAlias} (${code})`);
      this.closePair();
      if (this.h.onJoinCode) this.h.onJoinCode(code);
    });

    $("btn-close-settings")?.addEventListener("click", () => this.closeSettings());
    $("settings-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "settings-modal") this.closeSettings();
    });

    $("btn-save-alias")?.addEventListener("click", () => {
      const val = $("setting-alias")?.value.trim();
      if (val && this.h.onAliasSave) {
        this.h.onAliasSave(val);
        this.setSelf(val);
      }
      const folder = $("setting-folder")?.value.trim();
      if (folder) {
        localStorage.setItem("flux-save-folder", folder);
        if ($("display-save-folder")) $("display-save-folder").textContent = folder;
      }
      this.toast("Settings saved successfully");
      this.closeSettings();
    });

    $("btn-random-alias")?.addEventListener("click", () => {
      if (this.h.onRandomAlias) {
        const next = this.h.onRandomAlias();
        $("setting-alias").value = next;
      }
    });

    $("btn-copy-pair-link")?.addEventListener("click", async () => {
      const url = $("code-url")?.textContent || location.href;
      try {
        await navigator.clipboard.writeText(url);
        this.toast("Pairing link copied to clipboard");
      } catch {
        this.toast("Code: " + $("code-value").textContent);
      }
    });

    $("dest-folder-select")?.addEventListener("change", async (e) => {
      if (e.target.value === "custom") {
        if ("showDirectoryPicker" in window) {
          try {
            const dirHandle = await window.showDirectoryPicker();
            const opt = document.createElement("option");
            opt.value = dirHandle.name;
            opt.textContent = `Folder: ${dirHandle.name}`;
            opt.selected = true;
            e.target.appendChild(opt);
            this.toast(`Save destination set to ${dirHandle.name}`);
          } catch {
            e.target.value = "downloads";
          }
        } else {
          const path = prompt("Enter custom folder destination path:", "~/Downloads/Flux Received");
          if (path) {
            const opt = document.createElement("option");
            opt.value = path;
            opt.textContent = path;
            opt.selected = true;
            e.target.appendChild(opt);
            this.toast(`Destination set to ${path}`);
          } else {
            e.target.value = "downloads";
          }
        }
      } else {
        this.toast(`Destination set to: ${e.target.options[e.target.selectedIndex].text}`);
      }
    });

    $("btn-accept")?.addEventListener("click", () => {
      const id = this._incomingId;
      const remember = $("check-remember-device")?.checked;
      if (remember) {
        const sender = $("incoming-sender-title")?.textContent || "Peer Device";
        try {
          const trusted = JSON.parse(localStorage.getItem("flux-trusted-devices") || "[]");
          if (!trusted.includes(sender)) {
            trusted.push(sender);
            localStorage.setItem("flux-trusted-devices", JSON.stringify(trusted));
          }
        } catch {}
      }
      this.closeIncoming();
      if (id && this.h.onAcceptIncoming) this.h.onAcceptIncoming(id);
      this.toast("Incoming transfer accepted. Saving files…");
      this.switchView("transfers");
    });
    $("btn-decline")?.addEventListener("click", () => {
      const id = this._incomingId;
      this.closeIncoming();
      if (id && this.h.onDeclineIncoming) this.h.onDeclineIncoming(id);
      this.toast("Transfer declined");
    });

    // 12. Quick Beam Events
    $("btn-open-beam")?.addEventListener("click", () => this.openQuickBeam());
    $("btn-close-quick-beam")?.addEventListener("click", () => this.closeQuickBeam());
    $("btn-beam-cancel")?.addEventListener("click", () => this.closeQuickBeam());
    $("btn-beam-send")?.addEventListener("click", () => this.sendQuickBeam());
    $("quick-beam-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "quick-beam-modal") this.closeQuickBeam();
    });
    $("btn-beam-paste-clip")?.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          const ta = $("beam-text-content");
          if (ta) {
            ta.value = text;
            this._updateBeamCharCounter();
            this.toast("Pasted clipboard into Quick Beam 📋");
          }
        }
      } catch {
        this.toast("Clipboard access denied — press Ctrl+V in the box", "error");
      }
    });
    $("check-beam-encrypt")?.addEventListener("change", (e) => {
      const field = $("beam-password-field");
      if (field) field.hidden = !e.target.checked;
      if (e.target.checked) $("beam-password-input")?.focus();
    });
    $("beam-text-content")?.addEventListener("input", () => this._updateBeamCharCounter());
    $("beam-text-content")?.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.key === "Enter") this.sendQuickBeam();
    });

    // 13. Quick Clip Received Events
    $("btn-close-quick-clip")?.addEventListener("click", () => this.closeQuickClip());
    $("btn-clip-copy")?.addEventListener("click", () => this.copyClipText());
    $("btn-clip-save-file")?.addEventListener("click", () => this.saveClipToFile());
    $("btn-clip-decrypt")?.addEventListener("click", () => this.decryptIncomingClip());
    $("clip-decrypt-pass")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.decryptIncomingClip();
    });
    $("quick-clip-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "quick-clip-modal") this.closeQuickClip();
    });

    // 14. Shortcuts HUD Events
    $("btn-open-shortcuts")?.addEventListener("click", () => this.openShortcuts());
    $("btn-close-shortcuts")?.addEventListener("click", () => this.closeShortcuts());
    $("btn-shortcuts-close")?.addEventListener("click", () => this.closeShortcuts());
    $("shortcuts-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "shortcuts-modal") this.closeShortcuts();
    });

    // 15. Audio Soundscape Controls
    const soundEnabled = Sound.isEnabled();
    const setSoundUI = (en) => {
      if ($("sound-icon-indicator")) $("sound-icon-indicator").textContent = en ? "🔊" : "🔇";
      if ($("setting-sound-toggle")) $("setting-sound-toggle").checked = en;
      if ($("full-setting-sound-toggle")) $("full-setting-sound-toggle").checked = en;
    };
    setSoundUI(soundEnabled);

    $("btn-toggle-sound")?.addEventListener("click", () => {
      const en = Sound.toggle();
      setSoundUI(en);
      this.toast(en ? "Sound effects enabled 🔊" : "Sound effects muted 🔇");
    });
    $("setting-sound-toggle")?.addEventListener("change", (e) => {
      Sound.setEnabled(e.target.checked);
      setSoundUI(e.target.checked);
    });
    $("full-setting-sound-toggle")?.addEventListener("change", (e) => {
      Sound.setEnabled(e.target.checked);
      setSoundUI(e.target.checked);
    });
    $("btn-test-sound")?.addEventListener("click", () => {
      Sound.play("sonar");
      this.toast("Synthesized audio radar ping 🔊");
    });
    $("btn-full-test-sound")?.addEventListener("click", () => {
      Sound.play("sonar");
      this.toast("Synthesized audio radar ping 🔊");
    });

    // 16. Desktop Notifications
    const updateNotifUI = (granted) => {
      if ($("setting-notif-status")) $("setting-notif-status").textContent = granted ? "Desktop notifications enabled (Active)" : "Notifications blocked by browser";
      if ($("btn-request-notif")) $("btn-request-notif").textContent = granted ? "✓ Alerts Active" : "Blocked";
      if ($("btn-full-request-notif")) $("btn-full-request-notif").textContent = granted ? "✓ Alerts Active" : "Enable Notifications";
    };
    if (Notifier.isSupported() && Notification.permission === "granted") {
      updateNotifUI(true);
    }
    const handleNotifRequest = async () => {
      const granted = await Notifier.requestPermission();
      updateNotifUI(granted);
      this.toast(granted ? "Desktop notifications enabled!" : "Notifications permission denied");
    };
    $("btn-request-notif")?.addEventListener("click", handleNotifRequest);
    $("btn-full-request-notif")?.addEventListener("click", handleNotifRequest);

    // 17. Theme Selector in Settings
    const curTheme = localStorage.getItem("flux-theme") || "dark";
    if ($("setting-theme-select")) {
      $("setting-theme-select").value = curTheme;
      $("setting-theme-select").addEventListener("change", (e) => {
        if (this.h.onThemeSelect) this.h.onThemeSelect(e.target.value);
      });
    }
    if ($("full-setting-theme-select")) {
      $("full-setting-theme-select").value = curTheme;
      $("full-setting-theme-select").addEventListener("change", (e) => {
        if (this.h.onThemeSelect) this.h.onThemeSelect(e.target.value);
      });
    }

    // 18. Pair Tabs & Camera Scanning
    $("tab-pair-code")?.addEventListener("click", () => this.switchPairTab("code"));
    $("tab-pair-camera")?.addEventListener("click", () => this.switchPairTab("camera"));
    $("btn-camera-pin-join")?.addEventListener("click", () => {
      const code = $("camera-pin-input")?.value.trim().toUpperCase();
      if (code) {
        this.closePair();
        if (this.h.onJoinCode) this.h.onJoinCode(code);
      } else {
        this.toast("Please enter a 6-digit PIN code", "error");
      }
    });
    $("camera-pin-input")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("btn-camera-pin-join")?.click();
    });
    $("btn-camera-flip")?.addEventListener("click", () => {
      if (this._qrScanner) this._qrScanner.flipCamera();
    });
    $("btn-camera-toggle")?.addEventListener("click", () => {
      if (this._qrScanner) {
        this._qrScanner.stop();
        this._qrScanner.start();
        this.toast("Camera restarted 📷");
      }
    });

    // 19. Global Keyboard Shortcuts
    window.addEventListener("keydown", (e) => {
      // Don't intercept typing in inputs
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") {
        if (e.key === "Escape") {
          e.target.blur();
          this.closeAllModals();
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (e.key === "Escape") {
        this.closeAllModals();
      } else if (k === "s" || e.key === "1") {
        this.switchDashboardMode("send");
        this.switchView("dashboard");
      } else if (k === "r") {
        this.switchDashboardMode("receive");
        this.switchView("dashboard");
      } else if (k === "t" || e.key === "3") {
        this.switchView("transfers");
      } else if (k === "h" || e.key === "4") {
        this.switchView("history");
      } else if (k === "d" || e.key === "5") {
        this.switchView("devices");
      } else if (k === "p") {
        this.openPair();
      } else if (k === "b") {
        this.openQuickBeam();
      } else if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        this.toggleShortcuts();
      }
    });

    // Initial render passes
    this.renderNearbyDevices(DEFAULT_DEVICES);
    this.renderRecentTransfers(RECENT_TRANSFERS);
    this.renderQueue();
    this.renderHistoryTimeline();
    this.updateHeroRing(68);
    this._renderHeroBreakdown();

    // URL view override for instant viewing / testing
    const viewParam = new URLSearchParams(location.search).get("view");
    if (viewParam) {
      if (viewParam === "pair") {
        this.openPair();
      } else if (viewParam === "incoming") {
        this.showIncoming("demo-1", "Launch_video.mp4", 684 * 1024 * 1024, "Jordan's MacBook Air");
      } else if (viewParam === "help") {
        this.openHelp();
      } else if (viewParam === "diagnostics") {
        this.openDiagnostics();
      } else {
        this.switchView(viewParam);
      }
    }
  },

  closeAllModals() {
    this.closePair();
    this.closeIncoming();
    this.closeSettings();
    this.closeHelp();
    this.closeDiagnostics();
    this.closeTroubleshoot();
    this.closeDevManage();
    this.closeProfileModal();
    this.closeQuickBeam();
    this.closeQuickClip();
    this.closeShortcuts();
    if (this._qrScanner) this._qrScanner.stop();
    document.querySelector(".target-picker-dropdown")?.remove();
  },

  switchView(viewName) {
    if (viewName === "receive") {
      this.switchDashboardMode("receive");
      viewName = "dashboard";
      this._activeNavView = "receive";
    } else if (viewName === "dashboard") {
      this.switchDashboardMode("send");
      this._activeNavView = "dashboard";
    } else {
      this._activeNavView = viewName;
    }

    this._activeView = viewName;
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === (this._activeNavView || viewName));
    });

    const views = ["dashboard", "send", "transfers", "history", "devices", "settings"];
    views.forEach((v) => {
      const el = $("view-" + v);
      if (el) {
        el.hidden = v !== viewName;
        el.classList.toggle("active", v === viewName);
      }
    });

    if (viewName === "history") {
      this.renderHistoryTimeline();
    }
  },

  renderHistoryTimeline(filter = "all", query = "") {
    const container = $("history-timeline-container");
    if (!container) return;
    container.innerHTML = "";
    const q = (query || "").trim().toLowerCase();

    TIMELINE_HISTORY.forEach((grp) => {
      const filteredItems = grp.items.filter((item) => {
        const matchesFilter = filter === "all" || item.role === filter;
        const matchesQuery = !q || item.name.toLowerCase().includes(q) || item.sub.toLowerCase().includes(q);
        return matchesFilter && matchesQuery;
      });

      if (filteredItems.length === 0) return;

      const dateHeader = document.createElement("div");
      dateHeader.className = "history-date-header";
      dateHeader.textContent = grp.group;
      container.appendChild(dateHeader);

      filteredItems.forEach((item) => {
        const isCorrupt = item.verified === false;
        const row = document.createElement("div");
        row.className = "history-item-card" + (isCorrupt ? " history-item-corrupt" : "");
        row.innerHTML = `
          <div class="hist-thumb-wrap">
            <span>${item.icon || '📄'}</span>
          </div>
          <div class="hist-meta">
            <span class="hist-title">${item.name}</span>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="hist-sub">${item.sub}</span>
              ${isCorrupt ? '<span class="badge-corrupt">⚠️ Corrupted (Hash Mismatch)</span>' : ''}
            </div>
          </div>
          <div class="hist-stat-col">
            <span class="hist-size">${item.size}</span>
            <span class="hist-time">${item.time}</span>
          </div>
          <div class="hist-check-icon" style="${isCorrupt ? 'color:#EF4444; border-color:#EF4444;' : ''}">
            ${isCorrupt ? '✕' : '✓'}
          </div>
        `;
        container.appendChild(row);
      });
    });

    if (container.children.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-dim);">No transfers match search criteria</div>`;
    }
  },

  setSelf(alias, avatarId) {
    if (alias) this._currentAlias = alias;
    if (avatarId) this._currentAvatar = avatarId;
    const currentAlias = this._currentAlias || "Kunal";
    const currentAvatar = this._currentAvatar || "dog";

    if ($("display-device-name")) $("display-device-name").textContent = currentAlias;
    if ($("receive-self-name")) $("receive-self-name").textContent = currentAlias;
    if ($("topbar-name-mini")) $("topbar-name-mini").textContent = currentAlias;
    if ($("profile-name-input")) $("profile-name-input").value = currentAlias;
    if ($("profile-preview-name")) $("profile-preview-name").textContent = currentAlias;
    if ($("setting-alias")) $("setting-alias").value = currentAlias;
    if ($("pair-input-alias")) $("pair-input-alias").value = currentAlias;

    // Render cartoon avatars across all UI places
    const svg24 = getAvatarSvg(currentAvatar, 24);
    const svg48 = getAvatarSvg(currentAvatar, 48);
    const svg58 = getAvatarSvg(currentAvatar, 58);
    const svg72 = getAvatarSvg(currentAvatar, 72);

    if ($("topbar-avatar-mini")) $("topbar-avatar-mini").innerHTML = svg24;
    if ($("receive-radar-self-avatar")) $("receive-radar-self-avatar").innerHTML = svg72;
    if ($("receive-identity-avatar-thumb")) $("receive-identity-avatar-thumb").innerHTML = svg48;
    if ($("send-radar-self-avatar")) $("send-radar-self-avatar").innerHTML = svg58;
    if ($("profile-preview-avatar")) $("profile-preview-avatar").innerHTML = svg48;
  },

  setPresence(state, connected) {
    const dot = document.querySelector(".node-status-dot");
    const label = $("scope-label");
    const topIp = $("topbar-ip");
    const offAlert = $("offline-alert");

    if (dot) {
      dot.style.backgroundColor = connected ? "var(--gold-primary)" : "var(--color-red)";
      dot.style.boxShadow = connected ? "0 0 6px var(--gold-primary)" : "0 0 6px var(--color-red)";
    }
    if (offAlert) {
      offAlert.hidden = connected;
    }
    if (label && location.hostname) {
      label.textContent = location.hostname === "localhost" ? "Local Mesh" : "LAN Network";
    }
    if (topIp && location.hostname) {
      topIp.textContent = "Connected to " + (location.hostname || "192.168.1.27");
    }
  },

  renderNearbyDevices(devices) {
    const container = $("nearby-devices-grid");
    if (!container) return;

    container.innerHTML = "";
    devices.forEach((dev) => {
      const card = document.createElement("div");
      card.className = "device-item-card";
      card.dataset.id = dev.id;

      const avatarId = dev.avatar || (dev.isSelf ? this._currentAvatar : (dev.id.includes("imac") ? "cat" : dev.id.includes("pixel") ? "fox" : "bunny"));

      card.innerHTML = `
        <div class="device-vector-icon" style="border-radius: 50%; overflow: hidden; width: 44px; height: 44px; border: 1.5px solid var(--gold-primary); display: flex; align-items: center; justify-content: center;">
          ${getAvatarSvg(avatarId, 44)}
        </div>
        <div class="device-item-name" title="${dev.alias}">${dev.alias}${dev.isSelf ? ' (You)' : ''}</div>
        <div class="device-status-badge">
          <span class="badge-dot ${dev.statusType}"></span>
          <span class="badge-text-${dev.statusType}">${dev.statusText}</span>
        </div>
      `;

      card.addEventListener("click", () => {
        if (dev.isSelf) {
          this.openProfileModal();
        } else {
          this._selectedTargetPeer = dev;
          if ($("send-target-name")) $("send-target-name").textContent = dev.alias;
          if (this._stagedFiles && this._stagedFiles.length > 0) {
            this._executeSendQueue();
          } else {
            this.toast(`Selected target: ${dev.alias} — choose or drop files to send`);
            $("file-input")?.click();
          }
        }
      });

      container.appendChild(card);
    });

    this.renderSendRadar();
  },

  renderFullDevicesGrid() {
    const grid = $("devices-full-grid");
    if (!grid) return;
    grid.innerHTML = "";

    const all = [...DEFAULT_DEVICES, ...this._currentPeers];
    all.forEach((dev) => {
      const card = document.createElement("div");
      card.className = "device-item-card";
      card.innerHTML = `
        <div class="device-vector-icon">
          ${getDeviceVectorSVG(dev.deviceType || "laptop")}
        </div>
        <div class="device-item-name">${dev.alias}</div>
        <div class="device-status-badge">
          <span class="badge-dot ${dev.isSelf ? 'gold' : 'green'}"></span>
          <span class="badge-text-${dev.isSelf ? 'gold' : 'green'}">${dev.isSelf ? 'This device' : 'Available'}</span>
        </div>
        <button class="btn-gold-solid btn-sm" style="margin-top: 6px; padding: 6px 14px; font-size: 11px;">Send Files</button>
      `;
      card.querySelector("button").addEventListener("click", (e) => {
        e.stopPropagation();
        this._selectedTargetPeer = dev;
        if ($("send-target-name")) $("send-target-name").textContent = dev.alias;
        this.switchView("send");
      });
      grid.appendChild(card);
    });
  },

  renderPeers(realPeers) {
    this._currentPeers = realPeers.map((p) => ({
      id: p.id,
      alias: p.alias || "Flux Peer",
      platform: p.platform || "linux",
      deviceType: p.platform === "android" || p.platform === "ios" ? "phone" : "laptop",
      isSelf: false,
      statusText: "Available",
      statusType: "green",
    }));

    const merged = [...DEFAULT_DEVICES, ...this._currentPeers];
    this.renderNearbyDevices(merged);
    if ($("footer-peers-count")) {
      $("footer-peers-count").textContent = `${merged.length} peers`;
    }
  },

  renderRecentTransfers(transfers) {
    const tbody = $("recent-transfers-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    transfers.forEach((item) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div class="file-name-cell">
            <span class="file-type-icon">${item.icon || '📄'}</span>
            <div class="file-text-col">
              <span class="file-main-name">${item.name}</span>
              <span class="file-date-sub">${item.date}</span>
            </div>
          </div>
        </td>
        <td>
          <span class="direction-arrow">${item.direction === 'out' ? '→' : '←'}</span>
        </td>
        <td>
          <div style="display:flex; align-items:center; gap:6px;">
            <span>${item.deviceType === 'phone' ? '📱' : '💻'}</span>
            <span>${item.device}</span>
          </div>
        </td>
        <td>${item.size}</td>
        <td>
          <span class="status-badge-${item.status === 'Completed' ? 'complete' : 'failed'}">
            ${item.status === 'Completed' ? '✓ ' + item.status : '! ' + item.status}
          </span>
        </td>
        <td style="color: var(--text-dim); text-align: right; cursor: pointer;">⋮</td>
      `;
      tbody.appendChild(tr);
    });
  },

  renderQueue() {
    const list = $("queue-files-list");
    if (!list) return;
    list.innerHTML = "";

    let totalBytes = 0;
    this._stagedFiles.forEach((file, idx) => {
      totalBytes += file.size || 0;
      const row = document.createElement("div");
      row.className = "queue-file-item";
      const iconHtml = file.previewUrl 
        ? `<img src="${file.previewUrl}" class="q-thumb-preview" alt="preview" />` 
        : `<span class="q-icon">${file.icon || '📄'}</span>`;

      row.innerHTML = `
        ${iconHtml}
        <div class="q-meta">
          <div class="q-name">${file.name}</div>
          <div class="q-sub">${file.type || 'File'}</div>
        </div>
        <div class="q-size">${formatBytes(file.size)}</div>
        <button class="btn-remove-q" title="Remove file" data-idx="${idx}">✕</button>
      `;

      row.querySelector(".btn-remove-q").addEventListener("click", () => {
        if (file.previewUrl) {
          try { URL.revokeObjectURL(file.previewUrl); } catch {}
        }
        this._stagedFiles.splice(idx, 1);
        this.renderQueue();
        this._updateSendStagingView();
      });

      list.appendChild(row);
    });

    if ($("queue-summary-label")) {
      $("queue-summary-label").textContent = `${this._stagedFiles.length} files • ${formatBytes(totalBytes)}`;
    }
  },

  setStagedFiles(fileList) {
    if (!fileList || !fileList.length) return;
    const newItems = Array.from(fileList).map((f) => {
      let icon = "📄";
      let type = "File";
      let previewUrl = null;
      if (f.type && f.type.startsWith("image/")) {
        icon = "🖼";
        type = "Image";
        try { previewUrl = URL.createObjectURL(f); } catch {}
      } else if (f.type && f.type.startsWith("video/")) {
        icon = "🎬";
        type = "Video";
      } else if (f.name && (f.name.endsWith(".zip") || f.name.endsWith(".rar") || f.name.endsWith(".tar"))) {
        icon = "🗜";
        type = "Archive";
      }
      return {
        name: f.name,
        size: f.size,
        type: type,
        icon: icon,
        previewUrl: previewUrl,
        rawFile: f,
      };
    });
    this._stagedFiles = [...this._stagedFiles, ...newItems];
    this.renderQueue();
    this._updateSendStagingView();
    if (this.h.onStagedChanged) this.h.onStagedChanged(this._stagedFiles.map(x => x.rawFile).filter(Boolean));
  },

  clearStagedFiles() {
    this._stagedFiles.forEach(f => {
      if (f.previewUrl) {
        try { URL.revokeObjectURL(f.previewUrl); } catch {}
      }
    });
    this._stagedFiles = [];
    this.renderQueue();
    this._updateSendStagingView();
    if (this.h.onClearStaged) this.h.onClearStaged();
  },

  _updateSendStagingView() {
    const dropzone = $("send-dropzone-container");
    const radar = $("send-radar-container");
    const hasStaged = this._stagedFiles && this._stagedFiles.length > 0;

    if (hasStaged) {
      if (dropzone) dropzone.hidden = true;
      if (radar) radar.hidden = false;
      const totalBytes = this._stagedFiles.reduce((acc, f) => acc + (f.size || 0), 0);
      if ($("send-staged-summary")) {
        $("send-staged-summary").textContent = `${this._stagedFiles.length} file(s) staged • ${formatBytes(totalBytes)}`;
      }
      this.renderSendRadar();
    } else {
      if (dropzone) dropzone.hidden = false;
      if (radar) radar.hidden = true;
    }
  },

  switchDashboardMode(mode) {
    this._activeDashboardMode = mode;
    const tabSend = $("tab-mode-send");
    const tabRecv = $("tab-mode-receive");
    const secSend = $("section-send");
    const secRecv = $("section-receive");
    const navRecv = $("nav-receive");
    const navDash = $("nav-dashboard");

    if (mode === "send") {
      if (tabSend) tabSend.classList.add("active");
      if (tabRecv) tabRecv.classList.remove("active");
      if (secSend) secSend.hidden = false;
      if (secRecv) secRecv.hidden = true;
      this._updateSendStagingView();
      if (this._activeView === "dashboard") {
        if (navDash) navDash.classList.add("active");
        if (navRecv) navRecv.classList.remove("active");
      }
    } else {
      if (tabRecv) tabRecv.classList.add("active");
      if (tabSend) tabSend.classList.remove("active");
      if (secRecv) secRecv.hidden = false;
      if (secSend) secSend.hidden = true;
      this.checkReceiveConnectivity();
      if (this._activeView === "dashboard") {
        if (navRecv) navRecv.classList.add("active");
        if (navDash) navDash.classList.remove("active");
      }
    }
  },

  checkReceiveConnectivity() {
    const isOnline = navigator.onLine !== false;
    const hasBluetooth = "bluetooth" in navigator;

    if ($("conn-wifi-text")) {
      $("conn-wifi-text").textContent = isOnline ? "Wi-Fi: Connected" : "Wi-Fi: Disconnected";
    }
    const dotWifi = $("conn-pill-wifi")?.querySelector(".conn-dot");
    if (dotWifi) {
      dotWifi.className = isOnline ? "conn-dot green" : "conn-dot gold";
    }

    if ($("conn-bt-text")) {
      $("conn-bt-text").textContent = hasBluetooth ? "Bluetooth: Active" : "Bluetooth: Ready";
    }

    const alertCard = $("receive-connectivity-alert");
    if (alertCard) {
      alertCard.style.borderColor = isOnline ? "rgba(245, 190, 56, 0.35)" : "#EF4444";
    }
  },

  renderSendRadar() {
    const container = $("send-radar-targets");
    if (!container) return;
    container.innerHTML = "";

    const devs = (this._currentPeers && this._currentPeers.length > 0)
      ? this._currentPeers
      : DEFAULT_DEVICES.filter((d) => !d.isSelf);

    const count = devs.length;
    if (!count) return;

    const radius = 135;
    devs.forEach((dev, idx) => {
      const angle = (idx * (2 * Math.PI) / count) - (Math.PI / 2);
      const x = 50 + (radius / 3.8) * Math.cos(angle);
      const y = 50 + (radius / 3.8) * Math.sin(angle);

      const node = document.createElement("div");
      node.className = "radar-target-node";
      node.style.left = `${x}%`;
      node.style.top = `${y}%`;
      node.title = `Send files to ${dev.alias}`;

      const avatarId = dev.avatar || (idx % 2 === 0 ? "cat" : "fox");
      node.innerHTML = `
        <div class="target-avatar-circle">
          ${getAvatarSvg(avatarId, 46)}
          <span class="target-pulse-beacon"></span>
        </div>
        <span class="target-node-title">${dev.alias}</span>
      `;

      node.addEventListener("click", () => {
        this.toast(`Sending files to ${dev.alias}…`, "success");
        this._selectedTargetPeer = dev;
        if ($("send-target-name")) $("send-target-name").textContent = dev.alias;
        this._executeSendQueue();
      });

      container.appendChild(node);
    });
  },

  _executeSendQueue() {
    if (!this._stagedFiles.length) {
      this.toast("Add files to the queue first");
      return;
    }
    const target = this._selectedTargetPeer ? this._selectedTargetPeer.alias : "Jordan's MacBook Air";
    this.toast(`Sending ${this._stagedFiles.length} files to ${target}…`);

    // Switch to transfers view and update hero card
    this._heroTransfer.peerName = target;
    this._heroTransfer.pct = 1;
    this._heroTransfer.files = this._stagedFiles.map((f) => ({
      name: f.name,
      progress: 0,
      status: "Sending...",
      icon: f.icon,
    }));
    this._heroTransfer.bytesSent = 0;
    this._heroTransfer.bytesTotal = this._stagedFiles.reduce((acc, f) => acc + (f.size || 1024*1024), 0);

    this.switchView("transfers");
    this.updateHeroProgress(1, this._heroTransfer.bytesTotal, 24 * 1024 * 1024, 45);
    this._renderHeroBreakdown();

    // Trigger handler if wired
    if (this.h.onSendToPeer && this._selectedTargetPeer) {
      const rawFiles = this._stagedFiles.map(f => f.rawFile).filter(Boolean);
      if (rawFiles.length) this.h.onSendToPeer(this._selectedTargetPeer.id, rawFiles);
    }
  },

  updateHeroRing(pct) {
    const circle = $("hero-ring-circle");
    if (!circle) return;
    const r = 54;
    const circumference = 2 * Math.PI * r; // 339.292
    const offset = circumference - (circumference * pct) / 100;
    circle.style.strokeDashoffset = offset;

    if ($("hero-pct-display")) $("hero-pct-display").textContent = `${Math.round(pct)}%`;
    if ($("hero-bar-fill")) $("hero-bar-fill").style.width = `${pct}%`;
  },

  updateHeroProgress(sent, total, speed, eta) {
    const pct = total > 0 ? (sent / total) * 100 : 0;
    this.updateHeroRing(pct);

    if ($("hero-bytes-display")) {
      $("hero-bytes-display").textContent = `${formatBytes(sent)} of ${formatBytes(total)}`;
    }
    if ($("hero-speed-display")) {
      $("hero-speed-display").textContent = `${formatBytes(speed)}/s`;
    }
    if ($("hero-eta-display")) {
      $("hero-eta-display").textContent = eta > 0 ? `About ${Math.round(eta)} sec left` : "Finalizing…";
    }
    if ($("stat-data-val")) {
      $("stat-data-val").textContent = `${formatBytes(sent)} / ${formatBytes(total)}`;
    }
    if ($("stat-speed-val")) {
      $("stat-speed-val").textContent = `${formatBytes(speed)}/s`;
    }
    if ($("stat-eta-val")) {
      $("stat-eta-val").textContent = eta > 0 ? `About ${Math.round(eta)} sec` : "Done";
    }
    if ($("footer-dl-speed")) {
      $("footer-dl-speed").textContent = `${formatBytes(speed)}/s`;
    }
  },

  _renderHeroBreakdown() {
    const container = $("files-breakdown-list");
    if (!container) return;
    container.innerHTML = "";

    this._heroTransfer.files.forEach((file) => {
      const row = document.createElement("div");
      row.className = "file-breakdown-row";
      row.innerHTML = `
        <span class="fb-icon">${file.icon || '📄'}</span>
        <div class="fb-meta">
          <span class="fb-name">${file.name}</span>
          <span class="fb-sub">${file.status}</span>
        </div>
        <div class="fb-progress-col">
          <div class="fb-progress-bar">
            <div class="fb-bar-fill" style="width: ${file.progress}%;"></div>
          </div>
          <span class="fb-status-icon">${file.progress >= 100 ? '✓' : file.progress + '%'}</span>
        </div>
      `;
      container.appendChild(row);
    });
  },

  _renderTransfersTab(tab) {
    const heroCard = $("hero-transfer-card");
    const failedCard = $("failed-transfer-card");
    const breakdown = document.querySelector(".transfer-files-section");

    if (tab === "active") {
      if (heroCard) heroCard.style.display = "flex";
      if (breakdown) breakdown.style.display = "flex";
      if (failedCard) failedCard.style.display = "none";
    } else if (tab === "failed") {
      if (heroCard) heroCard.style.display = "none";
      if (breakdown) breakdown.style.display = "none";
      if (failedCard) failedCard.style.display = "flex";
    } else if (tab === "completed") {
      if (heroCard) heroCard.style.display = "none";
      if (breakdown) breakdown.style.display = "flex";
      if (failedCard) failedCard.style.display = "none";
    }
  },

  // Pair Modal Methods
  openPair() {
    const modal = $("pair-modal");
    if (modal) modal.hidden = false;
    this.switchPairTab("code");
    this._renderDefaultQR();
    if (this.h.onCreateCode) this.h.onCreateCode();
  },

  switchPairTab(tab) {
    const tabCode = $("tab-pair-code");
    const tabCam = $("tab-pair-camera");
    const viewCode = $("pair-tab-code-view");
    const viewCam = $("pair-tab-camera-view");

    if (tab === "camera") {
      if (tabCam) tabCam.classList.add("active");
      if (tabCode) tabCode.classList.remove("active");
      if (viewCam) {
        viewCam.hidden = false;
        viewCam.style.display = "flex";
      }
      if (viewCode) {
        viewCode.hidden = true;
        viewCode.style.display = "none";
      }

      const video = $("qr-camera-video");
      if (video) {
        if (!this._qrScanner) {
          this._qrScanner = new QRScanner(video, (raw) => this._onQrCodeScanned(raw));
        }
        this._qrScanner.start();
        if ($("camera-status-msg")) $("camera-status-msg").textContent = "Align peer QR code within the golden frame";
      }
    } else {
      if (tabCode) tabCode.classList.add("active");
      if (tabCam) tabCam.classList.remove("active");
      if (viewCode) {
        viewCode.hidden = false;
        viewCode.style.display = "grid";
      }
      if (viewCam) {
        viewCam.hidden = true;
        viewCam.style.display = "none";
      }
      if (this._qrScanner) this._qrScanner.stop();
    }
  },

  _onQrCodeScanned(raw) {
    if (!raw) return;
    let code = raw;
    try {
      if (raw.includes("code=")) {
        const u = new URL(raw, location.origin);
        if (u.searchParams.has("code")) {
          code = u.searchParams.get("code");
        }
      }
    } catch {}
    code = code.trim().toUpperCase();
    Sound.play("sonar");
    this.closePair();
    if (this.h.onJoinCode) this.h.onJoinCode(code);
    this.toast(`Pairing code recognized: ${code} 📷`, "success");
  },

  _renderDefaultQR() {
    const qrHolder = $("qr");
    if (!qrHolder) return;
    if (qrHolder.children.length === 0) {
      qrHolder.innerHTML = `
        <svg width="140" height="140" viewBox="0 0 100 100" fill="none">
          <rect width="100" height="100" fill="#101114"/>
          <!-- Top Left Finder -->
          <rect x="8" y="8" width="28" height="28" stroke="#F5BE38" stroke-width="4" rx="2" fill="none"/>
          <rect x="16" y="16" width="12" height="12" fill="#F5BE38" rx="1"/>
          <!-- Top Right Finder -->
          <rect x="64" y="8" width="28" height="28" stroke="#F5BE38" stroke-width="4" rx="2" fill="none"/>
          <rect x="72" y="16" width="12" height="12" fill="#F5BE38" rx="1"/>
          <!-- Bottom Left Finder -->
          <rect x="8" y="64" width="28" height="28" stroke="#F5BE38" stroke-width="4" rx="2" fill="none"/>
          <rect x="16" y="72" width="12" height="12" fill="#F5BE38" rx="1"/>
          <!-- QR Data Dots Pattern in Gold -->
          <rect x="42" y="12" width="6" height="6" fill="#F5BE38"/>
          <rect x="52" y="12" width="6" height="6" fill="#FFE885"/>
          <rect x="42" y="24" width="6" height="12" fill="#F5BE38"/>
          <rect x="52" y="30" width="6" height="6" fill="#FFE885"/>
          <rect x="12" y="44" width="12" height="6" fill="#F5BE38"/>
          <rect x="30" y="44" width="6" height="6" fill="#FFE885"/>
          <rect x="42" y="44" width="16" height="6" fill="#F5BE38"/>
          <rect x="64" y="44" width="6" height="12" fill="#F5BE38"/>
          <rect x="76" y="44" width="12" height="6" fill="#FFE885"/>
          <rect x="12" y="54" width="6" height="6" fill="#FFE885"/>
          <rect x="24" y="54" width="12" height="6" fill="#F5BE38"/>
          <rect x="44" y="56" width="6" height="12" fill="#FFE885"/>
          <rect x="56" y="56" width="12" height="6" fill="#F5BE38"/>
          <rect x="74" y="56" width="14" height="6" fill="#F5BE38"/>
          <rect x="42" y="74" width="8" height="6" fill="#F5BE38"/>
          <rect x="56" y="70" width="6" height="14" fill="#FFE885"/>
          <rect x="68" y="70" width="6" height="6" fill="#F5BE38"/>
          <rect x="80" y="70" width="8" height="16" fill="#F5BE38"/>
          <rect x="44" y="86" width="16" height="6" fill="#FFE885"/>
          <rect x="66" y="86" width="8" height="6" fill="#F5BE38"/>
        </svg>
      `;
    }
  },

  closePair() {
    const modal = $("pair-modal");
    if (modal) modal.hidden = true;
    if (this._qrScanner) this._qrScanner.stop();
  },

  // Quick Beam Modal Methods
  openQuickBeam(targetPeer = null) {
    const modal = $("quick-beam-modal");
    if (!modal) return;
    modal.hidden = false;
    Sound.play("click");

    const select = $("beam-target-select");
    if (select) {
      select.innerHTML = "";
      const devs = (this._devices && this._devices.length) ? this._devices.filter(d => !d.isSelf) : DEFAULT_DEVICES.filter(d => !d.isSelf);
      if (devs.length > 0) {
        select.innerHTML = devs.map(d => `<option value="${d.id}">${d.alias} (${d.platform || 'Nearby'})</option>`).join("");
        select.innerHTML += `<option value="all">⚡ Broadcast to All Nearby Devices</option>`;
      } else {
        select.innerHTML = `<option value="broadcast">⚡ Broadcast to Subnet</option>`;
      }
      if (targetPeer && select.querySelector(`option[value="${targetPeer.id}"]`)) {
        select.value = targetPeer.id;
      }
    }
    const ta = $("beam-text-content");
    if (ta) {
      setTimeout(() => ta.focus(), 100);
      this._updateBeamCharCounter();
    }
  },

  closeQuickBeam() {
    const modal = $("quick-beam-modal");
    if (modal) modal.hidden = true;
  },

  _updateBeamCharCounter() {
    const ta = $("beam-text-content");
    const counter = $("beam-char-counter");
    if (ta && counter) {
      const len = ta.value.length;
      counter.textContent = `${len} character${len === 1 ? '' : 's'}`;
    }
  },

  async sendQuickBeam() {
    const ta = $("beam-text-content");
    const text = ta ? ta.value.trim() : "";
    if (!text) {
      this.toast("Please type or paste text to beam", "error");
      return;
    }

    const encryptCheck = $("check-beam-encrypt");
    const isEncrypted = encryptCheck && encryptCheck.checked;
    const passInput = $("beam-password-input");
    const pass = passInput ? passInput.value : "";

    if (isEncrypted && !pass) {
      this.toast("Please enter a passphrase for encryption", "error");
      return;
    }

    let payload = text;
    let noteName = (text.startsWith("http://") || text.startsWith("https://")) ? "Shared Link.url" : "Quick Note.txt";

    if (isEncrypted) {
      try {
        payload = await encryptString(text, pass);
        noteName = "Encrypted Note.flux";
      } catch (e) {
        this.toast("Encryption failed: " + e.message, "error");
        return;
      }
    }

    const blob = new Blob([payload], { type: "text/plain;flux-clip=true" });
    blob.name = noteName;
    blob.isClip = true;
    blob.relativePath = noteName;

    const select = $("beam-target-select");
    const targetId = select ? select.value : "all";

    Sound.play("start");
    this.closeQuickBeam();

    if (targetId === "all" || targetId === "broadcast") {
      const devs = (this._devices && this._devices.length) ? this._devices.filter(d => !d.isSelf) : DEFAULT_DEVICES.filter(d => !d.isSelf);
      devs.forEach(d => {
        if (this.h.onSendToPeer) this.h.onSendToPeer(d.id, [blob]);
      });
      this.toast(`Beamed to ${devs.length} nearby device(s) ⚡`, "success");
    } else {
      if (this.h.onSendToPeer) this.h.onSendToPeer(targetId, [blob]);
      this.toast(`Beaming text snippet to recipient ⚡`, "success");
    }
    if (ta) ta.value = "";
    if (passInput) passInput.value = "";
    if (encryptCheck) encryptCheck.checked = false;
    if ($("beam-password-field")) $("beam-password-field").hidden = true;
  },

  // Quick Clip Received Modal Methods
  showQuickClip(ev) {
    const modal = $("quick-clip-modal");
    if (!modal) return;
    modal.hidden = false;
    Sound.play("incoming");

    const senderEl = $("clip-sender-name");
    if (senderEl) senderEl.textContent = ev.peerName || "Nearby Device";

    const decryptBox = $("clip-decrypt-box");
    const contentBox = $("clip-content-box");
    const ta = $("clip-result-text");
    const btnOpenUrl = $("btn-clip-open-url");

    this._currentClipData = ev;

    const isEnc = isEncryptedPayload(ev.text);
    if (isEnc) {
      if (decryptBox) decryptBox.hidden = false;
      if (contentBox) contentBox.hidden = true;
      if (btnOpenUrl) btnOpenUrl.hidden = true;
      setTimeout(() => $("clip-decrypt-pass")?.focus(), 100);
    } else {
      if (decryptBox) decryptBox.hidden = true;
      if (contentBox) contentBox.hidden = false;
      if (ta) ta.value = ev.text || "";
      this._updateClipUrlButton(ev.text);
    }

    Notifier.notify("⚡ Text / Link Received", {
      body: `From ${ev.peerName || 'Peer'}: ${(ev.text || '').slice(0, 60)}`,
    });
  },

  _updateClipUrlButton(text) {
    const btnOpenUrl = $("btn-clip-open-url");
    if (!btnOpenUrl) return;
    const trimmed = (text || "").trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      btnOpenUrl.hidden = false;
      btnOpenUrl.onclick = () => {
        window.open(trimmed, "_blank", "noopener,noreferrer");
      };
    } else {
      btnOpenUrl.hidden = true;
    }
  },

  async decryptIncomingClip() {
    const pass = $("clip-decrypt-pass")?.value || "";
    if (!pass) {
      this.toast("Enter passphrase to decrypt", "error");
      return;
    }
    try {
      const plain = await decryptString(this._currentClipData.text, pass);
      const decryptBox = $("clip-decrypt-box");
      const contentBox = $("clip-content-box");
      const ta = $("clip-result-text");
      if (decryptBox) decryptBox.hidden = true;
      if (contentBox) contentBox.hidden = false;
      if (ta) ta.value = plain;
      this._currentClipData.decryptedText = plain;
      this._updateClipUrlButton(plain);
      Sound.play("sonar");
      this.toast("Decrypted successfully 🔓", "success");
    } catch (err) {
      Sound.play("error");
      this.toast("Decryption failed: Incorrect passphrase", "error");
    }
  },

  copyClipText() {
    const ta = $("clip-result-text");
    const text = ta ? ta.value : "";
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      Sound.play("click");
      const copyText = $("clip-copy-text");
      if (copyText) copyText.textContent = "✓ Copied to Clipboard!";
      setTimeout(() => {
        if (copyText) copyText.textContent = "Copy to Clipboard";
      }, 2000);
      this.toast("Copied to clipboard 📋", "success");
    }).catch(() => {
      this.toast("Failed to copy to clipboard", "error");
    });
  },

  saveClipToFile() {
    const ta = $("clip-result-text");
    const text = ta ? ta.value : "";
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (this._currentClipData?.name || "flux-note.txt").replace(".flux", ".txt");
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    Sound.play("click");
    this.toast("Saved as text note 💾", "success");
  },

  closeQuickClip() {
    const modal = $("quick-clip-modal");
    if (modal) modal.hidden = true;
  },

  // Shortcuts HUD Methods
  openShortcuts() {
    const modal = $("shortcuts-modal");
    if (modal) modal.hidden = false;
    Sound.play("click");
  },

  closeShortcuts() {
    const modal = $("shortcuts-modal");
    if (modal) modal.hidden = true;
  },

  toggleShortcuts() {
    const modal = $("shortcuts-modal");
    if (!modal) return;
    if (modal.hidden) {
      this.openShortcuts();
    } else {
      this.closeShortcuts();
    }
  },

  showCode(code, url, renderQR) {
    if ($("code-value")) $("code-value").textContent = code;
    if ($("code-url")) $("code-url").textContent = url;
    const qrHolder = $("qr");
    if (qrHolder && renderQR) {
      qrHolder.innerHTML = "";
      try {
        renderQR(qrHolder, url, 140);
      } catch {
        this._renderDefaultQR();
      }
    }
  },

  // Settings Modal Methods
  openSettings() {
    const modal = $("settings-modal");
    if (modal) modal.hidden = false;
  },

  closeSettings() {
    const modal = $("settings-modal");
    if (modal) modal.hidden = true;
  },

  setSettingsInfo(info) {
    const card = $("settings-stun-info");
    if (!card) return;
    card.innerHTML = `
      <div><b>Platform:</b> ${info.platform || 'windows'} (${info.browser || 'Chrome'})</div>
      <div><b>STUN Servers:</b> ${(info.stunServers || []).join(", ") || "stun.l.google.com:19302"}</div>
      <div><b>WebRTC Direct:</b> Supported (Adaptive chunking)</div>
      <div><b>Direct Disk Stream:</b> Supported</div>
    `;
  },

  // Incoming Request Modal (Matching Canva Image 1)
  showIncoming(id, name, size, peerName) {
    this._incomingId = id;
    const modal = $("incoming-modal");
    if (!modal) return;

    if ($("incoming-sender-title")) {
      $("incoming-sender-title").textContent = `${peerName || "Jordan's MacBook Air"} wants to send files`;
    }
    const container = $("incoming-files-container");
    if (container) {
      container.innerHTML = `
        <div class="incoming-file-row">
          <div class="f-left">
            <span class="f-type-icon">▶</span>
            <span class="f-name">Launch_video.mp4</span>
          </div>
          <span class="f-size">684 MB</span>
        </div>
        <div class="incoming-file-row">
          <div class="f-left">
            <span class="f-type-icon">📄</span>
            <span class="f-name">Brand guidelines.pdf</span>
          </div>
          <span class="f-size">12.4 MB</span>
        </div>
        <div class="incoming-file-row">
          <div class="f-left">
            <span class="f-type-icon">🗜</span>
            <span class="f-name">Logo_exports.zip</span>
          </div>
          <span class="f-size">48.1 MB</span>
        </div>
      `;
    }
    if ($("incoming-count-label")) $("incoming-count-label").textContent = "3 files";
    if ($("incoming-total-size-label")) $("incoming-total-size-label").textContent = "744.5 MB";

    modal.hidden = false;
    Sound.play("incoming");
    Notifier.notify("Incoming Transfer Request", {
      body: `${peerName || "Nearby Device"} wants to send "${name}" (${formatBytes(size)})`,
    });
  },

  closeIncoming() {
    const modal = $("incoming-modal");
    if (modal) modal.hidden = true;
    this._incomingId = null;
  },

  // Real Transfer Callbacks from app.js / transfer engine
  startTransfer(id, name, size, role, mode, peerName, fileType) {
    Sound.play("start");
    this._heroTransfer.peerName = peerName || "Jordan's MacBook Air";
    this._heroTransfer.bytesTotal = size;
    this._heroTransfer.bytesSent = 0;
    this._heroTransfer.files = [{ name, progress: 0, status: role === 'send' ? 'Sending...' : 'Receiving...', icon: '📄' }];
    this.updateHeroProgress(0, size, 0, 0);
    this._renderHeroBreakdown();
    if ($("hero-target-name")) $("hero-target-name").textContent = this._heroTransfer.peerName;
    this._clearHeroRetryBanner();
  },

  updateHeroProgress(sent, total, speed, eta) {
    const pct = total > 0 ? Math.min(100, Math.floor((sent / total) * 100)) : 0;
    this.updateHeroRing(pct, false);
    const sentStr = formatBytes(sent);
    const totalStr = formatBytes(total);
    const speedStr = speed > 0 ? `${formatBytes(speed)}/s` : "Calculating...";
    const etaStr = eta > 0 ? `About ${Math.ceil(eta)} sec left` : "Calculating...";

    if ($("hero-bytes-display")) $("hero-bytes-display").textContent = `${sentStr} of ${totalStr}`;
    if ($("hero-speed-display")) $("hero-speed-display").textContent = speedStr;
    if ($("hero-eta-display")) $("hero-eta-display").textContent = etaStr;

    if ($("stat-data-val")) $("stat-data-val").textContent = `${sentStr} / ${totalStr}`;
    if ($("stat-speed-val")) $("stat-speed-val").textContent = speedStr;
    if ($("stat-eta-val")) $("stat-eta-val").textContent = eta > 0 ? `About ${Math.ceil(eta)} sec` : "--";

    if ($("hero-bar-fill")) $("hero-bar-fill").style.width = pct + "%";
  },

  updateHeroRing(pct, isError = false) {
    const circumference = 339.292;
    const offset = circumference * (1 - Math.max(0, Math.min(100, pct)) / 100);
    const circle = $("hero-ring-circle");
    if (circle) {
      circle.style.strokeDasharray = `${circumference}`;
      circle.style.strokeDashoffset = `${offset}`;
      circle.style.stroke = isError ? "#EF4444" : "#F5BE38";
    }
    const pctDisp = $("hero-pct-display");
    if (pctDisp) {
      pctDisp.textContent = isError ? "⚠️" : `${pct}%`;
      pctDisp.style.color = isError ? "#EF4444" : "#F5BE38";
    }
  },

  progress(id, sent, total, speed, eta) {
    this.updateHeroProgress(sent, total, speed, eta);
  },

  hashing(id, done, total) {
    if ($("hero-speed-display")) $("hero-speed-display").textContent = "Verifying SHA-256…";
  },

  finishSend(id, verified, name) {
    if (!verified) {
      this.updateHeroRing(100, true);
      Sound.play("error");
      if ($("hero-speed-display")) $("hero-speed-display").textContent = "Integrity check failed!";
      if ($("hero-eta-display")) $("hero-eta-display").innerHTML = `<span style="color:#EF4444;font-weight:600;">SHA-256 Mismatch • Transfer Corrupted</span>`;
      this.toast(`⚠️ Transfer failed integrity check for ${name || "file"} (SHA-256 mismatch)`, "error");
      this._showHeroRetryBanner(id, name, "send");
      return;
    }
    this.updateHeroRing(100, false);
    Sound.play("complete");
    Notifier.notify("Transfer Complete", {
      body: `"${name || 'File'}" was sent and verified with SHA-256.`,
    });
    if ($("hero-speed-display")) $("hero-speed-display").textContent = "Verified with SHA-256";
    if ($("hero-eta-display")) $("hero-eta-display").textContent = "Transfer complete";
    this.toast("✓ Transfer complete • All files verified with SHA-256", "success");
    this._clearHeroRetryBanner();
  },

  finishReceive(id, name, blob, streaming, verified) {
    if (!verified) {
      this.updateHeroRing(100, true);
      Sound.play("error");
      if ($("hero-speed-display")) $("hero-speed-display").textContent = "Integrity check failed!";
      if ($("hero-eta-display")) $("hero-eta-display").innerHTML = `<span style="color:#EF4444;font-weight:600;">SHA-256 Mismatch • File Corrupted</span>`;
      this.toast(`⚠️ Received ${name || "file"} failed integrity verification (SHA-256 mismatch)`, "error");
      this._showHeroRetryBanner(id, name, "recv");
      return;
    }
    this.updateHeroRing(100, false);
    Sound.play("complete");
    Notifier.notify("File Received", {
      body: `"${name}" received and verified with SHA-256.`,
    });
    if ($("hero-speed-display")) $("hero-speed-display").textContent = "Verified integrity";
    if ($("hero-eta-display")) $("hero-eta-display").textContent = streaming ? "Saved to disk" : "Downloaded";
    this.toast(`✓ Received ${name || "file"} • Verified integrity`, "success");
    this._clearHeroRetryBanner();
  },

  _showHeroRetryBanner(id, name, role) {
    this._clearHeroRetryBanner();
    const card = $("hero-transfer-card");
    if (!card) return;

    const banner = document.createElement("div");
    banner.className = "hero-integrity-error-banner";
    banner.id = "hero-integrity-error-banner";
    banner.innerHTML = `
      <div class="integrity-error-msg">
        <span class="error-badge-icon">⚠️</span>
        <div>
          <strong>Cryptographic Integrity Verification Failed</strong>
          <p>The SHA-256 checksum calculated on received data does not match the sender's origin digest. The file may have suffered transmission corruption.</p>
        </div>
      </div>
      <div class="integrity-error-actions">
        <button class="btn-retry-transfer" id="btn-hero-retry">Retry Transfer</button>
        <button class="btn-dismiss-error" id="btn-hero-dismiss">Dismiss</button>
      </div>
    `;

    banner.querySelector("#btn-hero-dismiss").addEventListener("click", () => banner.remove());
    banner.querySelector("#btn-hero-retry").addEventListener("click", () => {
      banner.remove();
      if (this.h && typeof this.h.onRetryTransfer === "function") {
        this.h.onRetryTransfer(id);
      } else {
        this.toast("Please re-select the file to retry transfer", "error");
      }
    });

    card.appendChild(banner);
  },

  _clearHeroRetryBanner() {
    const existing = $("hero-integrity-error-banner");
    if (existing) existing.remove();
  },

  error(id, msg) {
    this.toast("Transfer alert: " + msg, "error");
  },

  // Toast Notification System
  toast(msg, type = "success") {
    const container = $("toasts");
    if (!container) return;

    const isErr = type === "error";
    const item = document.createElement("div");
    item.className = "toast-item" + (isErr ? " toast-error" : "");
    item.innerHTML = `
      <span class="toast-check-icon">${isErr ? '⚠️' : '✓'}</span>
      <span>${msg}</span>
      <button class="toast-close-x">✕</button>
    `;

    item.querySelector(".toast-close-x").addEventListener("click", () => item.remove());
    container.appendChild(item);

    const timeout = isErr ? 8000 : 4000;
    setTimeout(() => {
      item.style.opacity = "0";
      setTimeout(() => item.remove(), 250);
    }, timeout);
  },

  _setupDragDrop(el) {
    el.addEventListener("dragover", (e) => {
      e.preventDefault();
      el.classList.add("dragover");
    });
    el.addEventListener("dragleave", () => el.classList.remove("dragover"));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        this.setStagedFiles(e.dataTransfer.files);
        this.toast(`${e.dataTransfer.files.length} file(s) dropped into queue`);
      }
    });
  },

  // Modal Controllers
  openHelp() {
    const modal = $("help-modal");
    if (modal) modal.hidden = false;
  },

  closeHelp() {
    const modal = $("help-modal");
    if (modal) modal.hidden = true;
  },

  async openDiagnostics() {
    const modal = $("diagnostics-modal");
    if (!modal) return;
    modal.hidden = false;
    try {
      const res = await fetch("/metrics");
      if (res.ok) {
        const data = await res.json();
        if ($("diag-server-status")) $("diag-server-status").textContent = "Online • " + (data.version || "v2.4.0-obsidian");
        if ($("diag-active-conns")) $("diag-active-conns").textContent = String(data.active_connections ?? 1);
        if ($("diag-total-conns")) $("diag-total-conns").textContent = String(data.total_connections ?? 1);
        if ($("diag-transfers-started")) $("diag-transfers-started").textContent = String(data.transfers_started ?? 0);
        if ($("diag-relayed-bytes")) $("diag-relayed-bytes").textContent = formatBytes(data.relayed_bytes ?? 0);
        if ($("diag-stun-server")) $("diag-stun-server").textContent = (data.stun_servers && data.stun_servers.join(", ")) || "stun:stun.l.google.com:19302";
        if ($("diag-scope-key")) $("diag-scope-key").textContent = data.scope || (this._peerInfo ? this._peerInfo.scope : "net:192.168.1.0/24");
        if ($("diag-primary-path")) $("diag-primary-path").textContent = "WebRTC DataChannel (Direct P2P)";
        if ($("diag-lan-ip")) $("diag-lan-ip").textContent = window.location.hostname || "192.168.1.x";
      }
    } catch {
      if ($("diag-server-status")) $("diag-server-status").textContent = "Connected (Local Mode)";
      if ($("diag-primary-path")) $("diag-primary-path").textContent = "WebRTC DataChannel (Direct P2P)";
      if ($("diag-scope-key")) $("diag-scope-key").textContent = "net:192.168.1.0/24";
      if ($("diag-lan-ip")) $("diag-lan-ip").textContent = window.location.hostname || "127.0.0.1";
      if ($("diag-stun-server")) $("diag-stun-server").textContent = "stun:stun.l.google.com:19302";
    }
  },

  closeDiagnostics() {
    const modal = $("diagnostics-modal");
    if (modal) modal.hidden = true;
  },

  openTroubleshoot() {
    const modal = $("troubleshoot-modal");
    if (modal) modal.hidden = false;
  },

  closeTroubleshoot() {
    const modal = $("troubleshoot-modal");
    if (modal) modal.hidden = true;
  },

  openDevManage(dev) {
    this._managedDevice = dev;
    const modal = $("device-manage-modal");
    if (!modal) return;
    modal.hidden = false;
    if ($("dev-manage-title")) $("dev-manage-title").textContent = dev?.alias || "Device Details";
    if ($("dev-manage-sub")) $("dev-manage-sub").textContent = dev?.ip ? `${dev.ip} • P2P Trusted` : "LAN Peer • WebRTC";
    if ($("dev-manage-name-input")) $("dev-manage-name-input").value = dev?.alias || "";
    if ($("dev-manage-ip-val")) $("dev-manage-ip-val").textContent = dev?.ip || "192.168.1.x";
  },

  closeDevManage() {
    const modal = $("device-manage-modal");
    if (modal) modal.hidden = true;
    this._managedDevice = null;
  },

  openProfileModal() {
    const modal = $("profile-modal");
    if (!modal) return;
    this._selectedProfileAvatar = this._currentAvatar || "dog";
    const currentName = this._currentAlias || "Kunal";
    if ($("profile-name-input")) $("profile-name-input").value = currentName;
    if ($("profile-preview-name")) $("profile-preview-name").textContent = currentName;
    if ($("profile-preview-avatar")) $("profile-preview-avatar").innerHTML = getAvatarSvg(this._selectedProfileAvatar, 48);

    this._renderProfileAvatarGrid();
    modal.hidden = false;
  },

  closeProfileModal() {
    const modal = $("profile-modal");
    if (modal) modal.hidden = true;
  },

  _renderProfileAvatarGrid() {
    const grid = $("profile-avatar-grid");
    if (!grid) return;
    grid.innerHTML = "";

    AVATARS.forEach((av) => {
      const tile = document.createElement("div");
      tile.className = "avatar-tile" + (av.id === this._selectedProfileAvatar ? " selected" : "");
      tile.dataset.id = av.id;

      tile.innerHTML = `
        <div class="avatar-tile-svg">${getAvatarSvg(av.id, 44)}</div>
        <span class="avatar-tile-name">${av.name}</span>
        <span class="avatar-tile-check">✓</span>
      `;

      tile.addEventListener("click", () => {
        document.querySelectorAll(".avatar-tile").forEach(t => t.classList.remove("selected"));
        tile.classList.add("selected");
        this._selectedProfileAvatar = av.id;
        if ($("profile-preview-avatar")) $("profile-preview-avatar").innerHTML = getAvatarSvg(av.id, 48);
      });

      grid.appendChild(tile);
    });
  },

  closeAllModals() {
    this.closeHelp();
    this.closeDiagnostics();
    this.closeTroubleshoot();
    this.closeDevManage();
    this.closePair();
    this.closeSettings();
    this.closeIncoming();
    this.closeProfileModal();
    this.closeQuickBeam();
    this.closeQuickClip();
    this.closeShortcuts();
    if (this._qrScanner) this._qrScanner.stop();
    const pickerDropdown = document.querySelector(".target-picker-dropdown");
    if (pickerDropdown) pickerDropdown.remove();
  },

  _toggleTargetPickerDropdown() {
    const existing = document.querySelector(".target-picker-dropdown");
    if (existing) {
      existing.remove();
      return;
    }
    const picker = $("target-device-picker");
    if (!picker) return;

    const dd = document.createElement("div");
    dd.className = "target-picker-dropdown";
    const devs = (this._devices && this._devices.length) ? this._devices : DEFAULT_DEVICES;

    dd.innerHTML = devs.map(d => `
      <div class="picker-item" data-dev-id="${d.id}">
        <span class="picker-icon">${d.deviceType === 'mobile' ? '📱' : d.deviceType === 'desktop' ? '🖥️' : '💻'}</span>
        <div class="picker-meta">
          <div class="picker-name">${d.alias}${d.isSelf ? ' (You)' : ''}</div>
          <div class="picker-sub">${d.platform || 'Local Peer'} • ${d.statusText || 'Online'}</div>
        </div>
      </div>
    `).join("");

    picker.style.position = "relative";
    picker.appendChild(dd);

    const onDocClick = (e) => {
      if (!picker.contains(e.target)) {
        dd.remove();
        document.removeEventListener("click", onDocClick);
      }
    };
    setTimeout(() => document.addEventListener("click", onDocClick), 0);

    dd.querySelectorAll(".picker-item").forEach(item => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const devId = item.dataset.devId;
        const target = devs.find(d => d.id === devId);
        if (target) {
          this._selectedTargetPeer = target;
          if ($("send-target-name")) $("send-target-name").textContent = target.alias;
          this.toast(`Selected target: ${target.alias}`);
        }
        dd.remove();
        document.removeEventListener("click", onDocClick);
      });
    });
  },
};
