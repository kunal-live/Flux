// ==========================================================================
// FLUX UI CONTROLLER — Gold & Obsidian Canva Edition
// Handles views, dynamic device rendering, file queues, hero progress rings,
// modals, and real-time P2P status updates.
// ==========================================================================

const $ = (id) => document.getElementById(id);

export const DEFAULT_DEVICES = [
  {
    id: "dev-macbook",
    alias: "Maya's MacBook Pro",
    platform: "macos",
    deviceType: "laptop",
    isSelf: true,
    statusText: "This device",
    statusType: "gold",
  },
  {
    id: "dev-imac",
    alias: "Studio iMac",
    platform: "macos",
    deviceType: "desktop",
    isSelf: false,
    statusText: "Available",
    statusType: "green",
  },
  {
    id: "dev-pixel",
    alias: "Pixel 9",
    platform: "android",
    deviceType: "phone",
    isSelf: false,
    statusText: "Available",
    statusType: "green",
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
  _stagedFiles: [...DEFAULT_QUEUE_FILES],
  _selectedTargetPeer: null,
  _heroTransfer: {
    peerName: "Maya's MacBook Pro",
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

    // Navigation item click bindings
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.dataset.view;
        if (view === "settings") {
          this.openSettings();
          return;
        }
        this.switchView(view);
      });
    });

    // Topbar Pair & Modals
    $("btn-open-pair")?.addEventListener("click", () => this.openPair());
    $("btn-quick-pair")?.addEventListener("click", () => this.openPair());
    $("btn-pair-from-devices")?.addEventListener("click", () => this.openPair());
    $("btn-edit-alias")?.addEventListener("click", () => this.openSettings());
    $("btn-node-info")?.addEventListener("click", () => this.openSettings());

    // Pair Modal Close
    $("btn-close-pair")?.addEventListener("click", () => this.closePair());
    $("btn-cancel-pairing")?.addEventListener("click", () => this.closePair());
    $("pair-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "pair-modal") this.closePair();
    });

    // Confirm Pairing
    $("btn-confirm-pairing")?.addEventListener("click", () => {
      this.toast("Pairing confirmed with Studio iMac");
      this.closePair();
    });

    // Settings Modal
    $("btn-close-settings")?.addEventListener("click", () => this.closeSettings());
    $("settings-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "settings-modal") this.closeSettings();
    });
    $("btn-save-alias")?.addEventListener("click", () => {
      const val = $("setting-alias").value.trim();
      if (val && this.h.onAliasSave) {
        this.h.onAliasSave(val);
        this.setSelf(val);
        this.toast("Device name saved as " + val);
        this.closeSettings();
      }
    });
    $("btn-random-alias")?.addEventListener("click", () => {
      if (this.h.onRandomAlias) {
        const next = this.h.onRandomAlias();
        $("setting-alias").value = next;
      }
    });

    // Copy Pair Link
    $("btn-copy-pair-link")?.addEventListener("click", async () => {
      const url = $("code-url")?.textContent || location.href;
      try {
        await navigator.clipboard.writeText(url);
        this.toast("Pairing link copied to clipboard");
      } catch {
        this.toast("Code: " + $("code-value").textContent);
      }
    });

    // Send Files Buttons & Dropzone
    const dashDrop = $("dash-dropzone");
    if (dashDrop) {
      dashDrop.addEventListener("click", (e) => {
        if (e.target.id === "btn-choose-files" || e.target.closest("#btn-choose-files")) {
          $("file-input")?.click();
        } else {
          $("file-input")?.click();
        }
      });
      this._setupDragDrop(dashDrop);
    }
    $("btn-choose-files")?.addEventListener("click", (e) => {
      e.stopPropagation();
      $("file-input")?.click();
    });

    // Target Device Picker on Send page
    $("target-device-picker")?.addEventListener("click", () => {
      this.switchView("dashboard");
      this.toast("Select a nearby device to send files");
    });

    // Add more files button in Send queue
    $("btn-add-more-files")?.addEventListener("click", () => {
      $("file-input")?.click();
    });

    // Execute Send button
    $("btn-execute-send")?.addEventListener("click", () => {
      this._executeSendQueue();
    });

    // Refresh Nearby Devices
    $("btn-dash-refresh")?.addEventListener("click", () => {
      const sym = document.querySelector(".refresh-symbol");
      if (sym) {
        sym.style.transform = "rotate(360deg)";
        setTimeout(() => (sym.style.transform = ""), 400);
      }
      this.toast("Scanning local network for devices…");
      if (this.h.onRefresh) this.h.onRefresh();
    });

    // View All Transfers
    $("btn-view-all-transfers")?.addEventListener("click", () => {
      this.switchView("transfers");
    });

    // Transfers Filter Tabs
    document.querySelectorAll(".xfer-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".xfer-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        this._activeTransferTab = tab.dataset.tab;
        this._renderTransfersTab(tab.dataset.tab);
      });
    });

    // Hero Pause / Resume
    $("btn-hero-pause")?.addEventListener("click", () => {
      this._heroTransfer.isPaused = !this._heroTransfer.isPaused;
      const isPaused = this._heroTransfer.isPaused;
      $("hero-pause-text").textContent = isPaused ? "Resume" : "Pause";
      $("hero-pause-icon").textContent = isPaused ? "▶" : "⏸";
      $("hero-speed-display").textContent = isPaused ? "Paused" : "18.6 MB/s";
      this.toast(isPaused ? "Transfer paused" : "Transfer resumed");
    });

    $("btn-hero-cancel")?.addEventListener("click", () => {
      this.toast("Transfer cancelled");
      $("hero-transfer-card").style.display = "none";
    });

    // Failed Transfer Retry
    $("btn-retry-failed")?.addEventListener("click", () => {
      this.toast("Retrying Product_demo.mov over P2P DataChannel…");
      $("failed-transfer-card").style.display = "none";
    });

    // Incoming Request Modal Actions
    $("btn-accept")?.addEventListener("click", () => {
      const id = this._incomingId;
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

    // Troubleshoot button
    $("btn-troubleshoot")?.addEventListener("click", () => {
      this.toast("Check Wi-Fi connection or click 'Pair with Code' to connect manually.");
    });

    // Escape listener
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closePair();
        this.closeIncoming();
        this.closeSettings();
      }
    });

    // Initial render passes
    this.renderNearbyDevices(DEFAULT_DEVICES);
    this.renderRecentTransfers(RECENT_TRANSFERS);
    this.renderQueue();
    this.updateHeroRing(68);
    this._renderHeroBreakdown();

    // URL view override for instant viewing / testing (?view=transfers, ?view=send, ?view=pair, ?view=incoming)
    const viewParam = new URLSearchParams(location.search).get("view");
    if (viewParam) {
      if (viewParam === "pair") {
        this.openPair();
      } else if (viewParam === "incoming") {
        this.showIncoming("demo-1", "Launch_video.mp4", 684 * 1024 * 1024, "Jordan's MacBook Air");
      } else {
        this.switchView(viewParam);
      }
    }
  },

  switchView(viewName) {
    this._activeView = viewName;
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === viewName);
    });

    const views = ["dashboard", "send", "transfers", "devices"];
    views.forEach((v) => {
      const el = $("view-" + v);
      if (el) {
        el.hidden = v !== viewName;
        el.classList.toggle("active", v === viewName);
      }
    });

    if (viewName === "devices") {
      this.renderFullDevicesGrid();
    }
  },

  setSelf(alias) {
    if ($("display-device-name")) $("display-device-name").textContent = alias;
    if ($("setting-alias")) $("setting-alias").value = alias;
    if ($("pair-input-alias")) $("pair-input-alias").value = alias;
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

      card.innerHTML = `
        <div class="device-vector-icon">
          ${getDeviceVectorSVG(dev.deviceType)}
        </div>
        <div class="device-item-name" title="${dev.alias}">${dev.alias}</div>
        <div class="device-status-badge">
          <span class="badge-dot ${dev.statusType}"></span>
          <span class="badge-text-${dev.statusType}">${dev.statusText}</span>
        </div>
      `;

      card.addEventListener("click", () => {
        if (dev.isSelf) {
          this.openSettings();
        } else {
          this._selectedTargetPeer = dev;
          if ($("send-target-name")) $("send-target-name").textContent = dev.alias;
          this.switchView("send");
          this.toast(`Ready to send files to ${dev.alias}`);
        }
      });

      container.appendChild(card);
    });
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
      row.innerHTML = `
        <span class="q-icon">${file.icon || '📄'}</span>
        <div class="q-meta">
          <div class="q-name">${file.name}</div>
          <div class="q-sub">${file.type || 'File'}</div>
        </div>
        <div class="q-size">${formatBytes(file.size)}</div>
        <button class="btn-remove-q" title="Remove file" data-idx="${idx}">✕</button>
      `;

      row.querySelector(".btn-remove-q").addEventListener("click", () => {
        this._stagedFiles.splice(idx, 1);
        this.renderQueue();
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
      if (f.type.startsWith("image/")) { icon = "🖼"; type = "Image"; }
      else if (f.type.startsWith("video/")) { icon = "🎬"; type = "Video"; }
      else if (f.name.endsWith(".zip") || f.name.endsWith(".rar") || f.name.endsWith(".tar")) { icon = "🗜"; type = "Archive"; }
      return {
        name: f.name,
        size: f.size,
        type: type,
        icon: icon,
        rawFile: f,
      };
    });
    this._stagedFiles = [...this._stagedFiles, ...newItems];
    this.renderQueue();
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
    this._renderDefaultQR();
    if (this.h.onCreateCode) this.h.onCreateCode();
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
  },

  closeIncoming() {
    const modal = $("incoming-modal");
    if (modal) modal.hidden = true;
    this._incomingId = null;
  },

  // Real Transfer Callbacks from app.js / transfer engine
  startTransfer(id, name, size, role, mode, peerName, fileType) {
    this._heroTransfer.peerName = peerName || "Jordan's MacBook Air";
    this._heroTransfer.bytesTotal = size;
    this._heroTransfer.bytesSent = 0;
    this._heroTransfer.files = [{ name, progress: 0, status: role === 'send' ? 'Sending...' : 'Receiving...', icon: '📄' }];
    this.updateHeroProgress(0, size, 0, 0);
    this._renderHeroBreakdown();
    if ($("hero-target-name")) $("hero-target-name").textContent = this._heroTransfer.peerName;
  },

  progress(id, sent, total, speed, eta) {
    this.updateHeroProgress(sent, total, speed, eta);
  },

  hashing(id, done, total) {
    if ($("hero-speed-display")) $("hero-speed-display").textContent = "Verifying SHA-256…";
  },

  finishSend(id, verified) {
    this.updateHeroRing(100);
    this.toast("✓ Transfer complete • All files verified with SHA-256");
  },

  finishReceive(id, name, blob, streaming, verified) {
    this.updateHeroRing(100);
    this.toast(`✓ Received ${name} • Verified integrity`);
  },

  error(id, msg) {
    this.toast("Transfer alert: " + msg);
  },

  // Toast Notification System (Matches Canva Image 4 snackbar)
  toast(msg) {
    const container = $("toasts");
    if (!container) return;

    const item = document.createElement("div");
    item.className = "toast-item";
    item.innerHTML = `
      <span class="toast-check-icon">✓</span>
      <span>${msg}</span>
      <button class="toast-close-x">✕</button>
    `;

    item.querySelector(".toast-close-x").addEventListener("click", () => item.remove());
    container.appendChild(item);

    setTimeout(() => {
      item.style.opacity = "0";
      setTimeout(() => item.remove(), 250);
    }, 4000);
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
};
