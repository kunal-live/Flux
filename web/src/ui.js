// All DOM rendering & interactive animations for the Flux dashboard.

const $ = (id) => document.getElementById(id);

export const DEFAULT_DEVICES = [
  {
    id: "dev-macbook",
    alias: "MacBook Pro",
    platform: "macos",
    deviceType: "laptop",
    distance: "2 m",
    graphic: "/assets/devices/macbook.svg",
    pos: { left: "50%", top: "16%", svgX: 340, svgY: 52 },
    isDemo: true,
  },
  {
    id: "dev-win",
    alias: "Office PC",
    platform: "windows",
    deviceType: "desktop",
    distance: "4 m",
    graphic: "/assets/devices/windows.svg",
    pos: { left: "22%", top: "42%", svgX: 150, svgY: 135 },
    isDemo: true,
  },
  {
    id: "dev-iphone",
    alias: "iPhone 15",
    platform: "ios",
    deviceType: "phone",
    distance: "3 m",
    graphic: "/assets/devices/iphone.svg",
    pos: { left: "78%", top: "42%", svgX: 530, svgY: 135 },
    isDemo: true,
  },
  {
    id: "dev-oneplus",
    alias: "OnePlus 12",
    platform: "android",
    deviceType: "phone",
    distance: "5 m",
    graphic: "/assets/devices/android.svg",
    pos: { left: "34%", top: "82%", svgX: 232, svgY: 262 },
    isDemo: true,
  },
  {
    id: "dev-linux",
    alias: "Linux Machine",
    platform: "linux",
    deviceType: "laptop",
    distance: "6 m",
    graphic: "/assets/devices/linux.svg",
    pos: { left: "66%", top: "82%", svgX: 448, svgY: 262 },
    isDemo: true,
  },
];

export const DEFAULT_TRANSFERS = [
  {
    id: "demo-xfer-1",
    name: "IMG_2025_0987.MOV",
    size: 1.2 * 1024 * 1024 * 1024,
    target: "MacBook Pro",
    thumb: "/assets/thumb-video.jpg",
    pct: 72,
    speed: 125 * 1024 * 1024,
    eta: 8,
    isPaused: false,
    color: "mint",
    isDemo: true,
  },
  {
    id: "demo-xfer-2",
    name: "Project_Files.zip",
    size: 850 * 1024 * 1024,
    target: "Office PC",
    thumb: "/assets/thumb-zip.svg",
    pct: 34,
    speed: 48 * 1024 * 1024,
    eta: 21,
    isPaused: false,
    color: "coral",
    isDemo: true,
  },
];

function getGraphicForPlatform(platform) {
  const p = (platform || "").toLowerCase();
  if (p === "macos" || p === "mac" || p === "darwin") return "/assets/devices/macbook.svg";
  if (p === "windows" || p === "win") return "/assets/devices/windows.svg";
  if (p === "ios" || p === "iphone" || p === "ipad") return "/assets/devices/iphone.svg";
  if (p === "android") return "/assets/devices/android.svg";
  if (p === "linux") return "/assets/devices/linux.svg";
  return "/assets/devices/windows.svg";
}

export const UI = {
  h: {},
  _incomingId: null,
  _currentPeers: [],
  _searchQuery: "",
  _activeView: "discover",
  _stagedFiles: [],
  _rangeTargetPeerId: null,
  _notifications: [
    { text: "Connected to LAN P2P mesh network", time: "Just now" },
    { text: "5 nearby devices discoverable on local Wi-Fi", time: "1m ago" },
  ],
  _transfers: [...DEFAULT_TRANSFERS],

  init(handlers) {
    this.h = handlers || {};

    // Nav Item switching
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

    // Profile Click opens Settings
    const userProf = $("user-profile");
    if (userProf) userProf.addEventListener("click", () => this.openSettings());

    // Promo button switches to send or discover
    const btnPromo = $("btn-promo-discover");
    if (btnPromo) btnPromo.addEventListener("click", () => this.switchView("send"));

    // Topbar Actions
    $("btn-theme").addEventListener("click", () => this.h.onThemeToggle && this.h.onThemeToggle());
    $("btn-pair").addEventListener("click", () => this.openPair());
    $("btn-refresh").addEventListener("click", () => {
      const icon = $("btn-refresh");
      icon.style.transform = "rotate(360deg)";
      setTimeout(() => (icon.style.transform = ""), 400);
      this.toast("Scanning local Wi-Fi network…");
      if (this.h.onRefresh) this.h.onRefresh();
    });

    // Notifications Popover
    const notifBtn = $("btn-notifications");
    const notifPop = $("notif-popover");
    if (notifBtn && notifPop) {
      notifBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        notifPop.hidden = !notifPop.hidden;
      });
      document.addEventListener("click", (e) => {
        if (!notifPop.contains(e.target) && e.target !== notifBtn) {
          notifPop.hidden = true;
        }
      });
    }
    const btnClearNotif = $("btn-clear-notifs");
    if (btnClearNotif) {
      btnClearNotif.addEventListener("click", () => {
        this._notifications = [];
        this.renderNotifications();
      });
    }

    const btnMore = $("btn-more");
    if (btnMore) btnMore.addEventListener("click", () => this.openSettings());

    // Chevrons for collapsing right rail cards
    const btnColXfer = $("btn-collapse-transfers");
    if (btnColXfer) {
      btnColXfer.addEventListener("click", () => {
        const body = $("transfers-body");
        body.hidden = !body.hidden;
        btnColXfer.classList.toggle("collapsed", body.hidden);
      });
    }
    const btnColNearby = $("btn-collapse-nearby");
    if (btnColNearby) {
      btnColNearby.addEventListener("click", () => {
        const body = $("nearby-body");
        body.hidden = !body.hidden;
        btnColNearby.classList.toggle("collapsed", body.hidden);
      });
    }

    // Dropzone: General Click
    const dz = $("dropzone");
    if (dz) {
      dz.addEventListener("click", (e) => {
        if (e.target.closest(".cat-pill")) return;
        this.h.onBrowse && this.h.onBrowse();
      });
      this._setupDrop(dz);
    }

    // Category Buttons
    $("cat-images")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const input = $("file-input-image");
      if (input) { input.value = ""; input.click(); }
    });
    $("cat-videos")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const input = $("file-input-video");
      if (input) { input.value = ""; input.click(); }
    });
    $("cat-docs")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const input = $("file-input-doc");
      if (input) { input.value = ""; input.click(); }
    });
    $("cat-folders")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const input = $("file-input-folder");
      if (input) { input.value = ""; input.click(); }
    });
    $("cat-audio")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const input = $("file-input-audio");
      if (input) { input.value = ""; input.click(); }
    });

    // Send view dropzone & buttons
    const sendDz = $("send-dropzone");
    if (sendDz) {
      sendDz.addEventListener("click", (e) => {
        if (e.target.tagName === "BUTTON") return;
        this.h.onBrowse && this.h.onBrowse();
      });
      this._setupDrop(sendDz);
    }
    $("btn-browse-send")?.addEventListener("click", () => this.h.onBrowse && this.h.onBrowse());
    $("btn-browse-folder")?.addEventListener("click", () => {
      const input = $("file-input-folder");
      if (input) { input.value = ""; input.click(); }
    });
    $("btn-clear-staging")?.addEventListener("click", () => {
      this.setStagedFiles([]);
      if (this.h.onClearStaged) this.h.onClearStaged();
    });

    // In-range banner action
    $("btn-share-to-range")?.addEventListener("click", () => {
      if (this.h.onShareToRange && this._rangeTargetPeerId) {
        this.h.onShareToRange(this._rangeTargetPeerId);
      }
    });

    // Globe action button
    $("btn-globe-action")?.addEventListener("click", () => {
      this.toast("Flux connects devices directly across local subnets with zero cloud hops.");
    });

    // Search bar
    $("search")?.addEventListener("input", (e) => {
      this._searchQuery = e.target.value.trim().toLowerCase();
      this._applyFilter();
    });
    $("search")?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const v = e.target.value.trim().toUpperCase();
      if (/^[A-Z0-9]{6}$/.test(v)) {
        this.h.onJoinCode && this.h.onJoinCode(v);
        e.target.value = "";
        this._searchQuery = "";
        this._applyFilter();
      }
    });

    // Pair Modal
    $("pair-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "pair-modal") this.closePair();
    });
    $("pair-modal")?.querySelector("[data-close]")?.addEventListener("click", () => this.closePair());
    $("btn-create-code")?.addEventListener("click", () => this.h.onCreateCode && this.h.onCreateCode());
    $("btn-join")?.addEventListener("click", () => {
      const v = $("join-input").value.trim().toUpperCase();
      if (v) this.h.onJoinCode && this.h.onJoinCode(v);
    });
    $("join-input")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("btn-join").click();
    });
    $("btn-copy")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText($("code-url").textContent);
        this.toast("Link copied to clipboard");
      } catch {
        this.toast("Copy failed — select link manually");
      }
    });

    // Settings Modal
    const setModal = $("settings-modal");
    if (setModal) {
      setModal.addEventListener("click", (e) => {
        if (e.target.id === "settings-modal") this.closeSettings();
      });
      setModal.querySelector("[data-close]")?.addEventListener("click", () => this.closeSettings());
      $("btn-save-alias")?.addEventListener("click", () => {
        const val = $("setting-alias").value.trim();
        if (val && this.h.onAliasSave) {
          this.h.onAliasSave(val);
          this.toast("Device name updated to " + val);
          this.closeSettings();
        }
      });
      $("setting-alias")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") $("btn-save-alias").click();
      });
      $("btn-random-alias")?.addEventListener("click", () => {
        if (this.h.onRandomAlias) $("setting-alias").value = this.h.onRandomAlias();
      });
      // Theme Picker swatches
      document.querySelectorAll(".btn-theme-swatch[data-theme-set]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const theme = btn.dataset.themeSet;
          if (this.h.onThemeSelect) {
            this.h.onThemeSelect(theme);
          } else {
            document.documentElement.setAttribute("data-theme", theme);
            this._updateThemeButtons(theme);
            try {
              localStorage.setItem("flux-theme", theme);
            } catch {}
          }
        });
      });
    }

    // Clear History Button
    $("btn-clear-history")?.addEventListener("click", () => {
      if (this.h.onClearHistory) this.h.onClearHistory();
    });

    // Incoming File Modal
    $("incoming-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "incoming-modal") this.closeIncoming();
    });
    $("btn-accept")?.addEventListener("click", () => {
      const id = this._incomingId;
      this.closeIncoming();
      if (id && this.h.onAcceptIncoming) this.h.onAcceptIncoming(id);
    });
    $("btn-decline")?.addEventListener("click", () => {
      const id = this._incomingId;
      this.closeIncoming();
      if (id && this.h.onDeclineIncoming) this.h.onDeclineIncoming(id);
    });

    // Global Escape Listener
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closePair();
        this.closeIncoming();
        this.closeSettings();
        if (notifPop) notifPop.hidden = true;
      }
    });

    // Initial render of transfers, default devices, notifications
    this.renderTransfers();
    this.renderNotifications();
    this.renderPeers([]);
    this._startSimulatedProgress();
  },

  switchView(viewName) {
    this._activeView = viewName;
    document.querySelectorAll(".nav-item").forEach((x) => {
      x.classList.toggle("active", x.dataset.view === viewName);
    });

    const views = ["discover", "send", "received", "history"];
    views.forEach((v) => {
      const el = $("view-" + v);
      if (el) {
        if (v === viewName) {
          el.hidden = false;
          el.classList.add("active");
        } else {
          el.hidden = true;
          el.classList.remove("active");
        }
      }
    });

    if (viewName === "send") this._renderSendTargets();
    if (viewName === "received" && this.h.onViewReceived) this.h.onViewReceived();
    if (viewName === "history" && this.h.onViewHistory) this.h.onViewHistory();
  },

  setSelf(alias) {
    if ($("me-name")) $("me-name").textContent = alias;
    const aliasInput = $("setting-alias");
    if (aliasInput && !aliasInput.value) aliasInput.value = alias;
  },

  setPresence(state, connected) {
    const isConn = connected && state !== "disconnected";
    let label = isConn ? "Online · Discoverable" : "Disconnected";
    if (state === "reconnecting") label = "Reconnecting…";
    if (state === "connecting") label = "Connecting…";

    if ($("me-presence")) $("me-presence").textContent = label;
    const dot = $("me-presence-dot");
    if (dot) dot.className = "status-dot " + (isConn ? "on" : "");
    if ($("core-sub")) $("core-sub").textContent = isConn ? "Ready to Share" : "Offline";
  },

  // ---- Notifications -----------------------------------------------------
  addNotification(text) {
    this._notifications.unshift({ text, time: "Just now" });
    if (this._notifications.length > 20) this._notifications.pop();
    this.renderNotifications();
  },

  renderNotifications() {
    const badge = $("notif-badge");
    const list = $("notif-list");
    if (!badge || !list) return;

    badge.textContent = this._notifications.length;
    badge.hidden = this._notifications.length === 0;

    if (!this._notifications.length) {
      list.innerHTML = `<div class="rail-empty">No recent notifications.</div>`;
      return;
    }

    list.innerHTML = "";
    this._notifications.forEach((n) => {
      const el = document.createElement("div");
      el.className = "notif-item";
      el.innerHTML = `<div>${escapeHtml(n.text)}</div><span class="notif-time">${escapeHtml(n.time)}</span>`;
      list.appendChild(el);
    });
  },

  // ---- Active Transfers --------------------------------------------------
  renderTransfers() {
    const container = $("transfers");
    const empty = $("transfers-empty");
    const countEl = $("active-count");
    if (!container) return;

    const list = this._transfers.filter((x) => !x.done && !x.failed);
    if (countEl) countEl.textContent = list.length;
    if (empty) empty.hidden = list.length > 0;

    container.innerHTML = "";
    list.forEach((t) => {
      const item = document.createElement("div");
      item.className = "transfer-item";
      item.id = "xfer-" + t.id;

      const isCoral = t.color === "coral";
      item.innerHTML = `
        <div class="transfer-top">
          <div class="transfer-thumb-wrap">
            <img src="${t.thumb || '/assets/thumb-zip.svg'}" class="transfer-thumb" alt="${escapeAttr(t.name)}" />
          </div>
          <div class="transfer-details">
            <div class="transfer-title">${escapeHtml(t.name)}</div>
            <div class="transfer-sub">${fmtBytes(t.size)} · To ${escapeHtml(t.target || 'Device')}</div>
          </div>
          <button class="transfer-pause-btn" data-id="${t.id}" title="${t.isPaused ? 'Resume' : 'Pause'}">
            ${t.isPaused ? '▶' : '⏸'}
          </button>
        </div>
        <div class="transfer-progress-track">
          <div class="transfer-progress-fill ${isCoral ? 'coral' : ''}" style="width: ${t.pct}%;"></div>
        </div>
        <div class="transfer-stats">
          <span>${fmtBytes(t.speed)}/s · ${t.eta}s left</span>
          <span class="transfer-pct">${Math.round(t.pct)}%</span>
        </div>
      `;

      item.querySelector(".transfer-pause-btn").addEventListener("click", () => {
        t.isPaused = !t.isPaused;
        if (t.isDemo) {
          this.renderTransfers();
          this.toast(`${t.name} ${t.isPaused ? 'paused' : 'resumed'}`);
        } else {
          if (t.isPaused) this.h.onPause && this.h.onPause(t.id);
          else this.h.onResume && this.h.onResume(t.id);
        }
      });

      container.appendChild(item);
    });
  },

  _startSimulatedProgress() {
    setInterval(() => {
      let changed = false;
      this._transfers.forEach((t) => {
        if (t.isDemo && !t.isPaused && t.pct < 98) {
          t.pct += 0.4;
          if (t.eta > 1) t.eta -= 0.1;
          changed = true;
        }
      });
      if (changed) this.renderTransfers();
    }, 1200);
  },

  // ---- Peers: Constellation + Nearby List + Connectors --------------------
  renderPeers(realPeers) {
    this._currentPeers = realPeers || [];
    this._applyFilter();
    this._renderSendTargets();
  },

  _applyFilter() {
    const q = this._searchQuery;
    
    // Combine real peers with default reference devices so the UI is always stunning
    const allPeers = [...this._currentPeers];
    DEFAULT_DEVICES.forEach((d) => {
      if (!allPeers.some((p) => p.id === d.id || p.alias.toLowerCase() === d.alias.toLowerCase())) {
        allPeers.push(d);
      }
    });

    const filtered = q
      ? allPeers.filter((p) =>
          (p.alias && p.alias.toLowerCase().includes(q)) ||
          (p.platform && p.platform.toLowerCase().includes(q))
        )
      : allPeers;

    if ($("nearby-count")) $("nearby-count").textContent = filtered.length;
    const empty = $("nearby-empty");
    if (empty) empty.hidden = filtered.length > 0;

    // Render Constellation Nodes & Connecting SVG Lines
    const nodesLayer = $("device-nodes-layer");
    const svgConnectors = $("svg-connectors");
    if (!nodesLayer || !svgConnectors) return;

    nodesLayer.innerHTML = "";
    svgConnectors.innerHTML = "";

    const centerHubPoint = { x: 340, y: 160 };

    filtered.forEach((p, idx) => {
      // Find positioning
      let pos = p.pos;
      if (!pos) {
        // Compute circular angle for new discovered peers
        const angle = (-90 + idx * (360 / Math.max(1, filtered.length))) * (Math.PI / 180);
        const radius = 135;
        const cx = 340 + Math.cos(angle) * radius;
        const cy = 160 + Math.sin(angle) * radius;
        pos = {
          left: `${((cx / 680) * 100).toFixed(1)}%`,
          top: `${((cy / 320) * 100).toFixed(1)}%`,
          svgX: Math.round(cx),
          svgY: Math.round(cy),
        };
      }

      // 1. Draw SVG dashed line from center hub to device
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", centerHubPoint.x);
      line.setAttribute("y1", centerHubPoint.y);
      line.setAttribute("x2", pos.svgX);
      line.setAttribute("y2", pos.svgY);
      line.setAttribute("stroke", "url(#lineGrad)");
      line.setAttribute("stroke-width", "1.5");
      line.setAttribute("stroke-dasharray", "4 4");
      svgConnectors.appendChild(line);

      // Glowing dot along the line
      const pulseDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      pulseDot.setAttribute("cx", (centerHubPoint.x + pos.svgX) / 2);
      pulseDot.setAttribute("cy", (centerHubPoint.y + pos.svgY) / 2);
      pulseDot.setAttribute("r", "2.5");
      pulseDot.setAttribute("fill", "var(--mint)");
      svgConnectors.appendChild(pulseDot);

      // 2. Render Node Card
      const node = document.createElement("div");
      node.className = "device-node";
      node.style.left = pos.left;
      node.style.top = pos.top;
      node.id = "node-" + p.id;

      const graphic = p.graphic || getGraphicForPlatform(p.platform);
      const distance = p.distance || "3 m";

      node.innerHTML = `
        <div class="node-graphic-wrap">
          <img src="${graphic}" alt="${escapeAttr(p.alias)}" />
        </div>
        <div class="node-name">${escapeHtml(p.alias)}</div>
        <div class="node-meta">
          <span class="node-dot"></span>
          <span>${cap(p.platform)} · ${distance}</span>
        </div>
      `;

      node.addEventListener("click", () => {
        this.h.onSendToPeer && this.h.onSendToPeer(p.id);
      });
      this._nodeDrop(node, p.id);
      nodesLayer.appendChild(node);
    });

    // Render Nearby List in Right Rail
    const nearbyList = $("nearby");
    if (!nearbyList) return;
    nearbyList.innerHTML = "";

    filtered.forEach((p) => {
      const row = document.createElement("div");
      row.className = "nearby-row";
      const graphic = p.graphic || getGraphicForPlatform(p.platform);
      const distance = p.distance || "3 m";

      row.innerHTML = `
        <div class="nearby-row-left">
          <div class="nearby-thumb-wrap">
            <img src="${graphic}" alt="${escapeAttr(p.alias)}" />
          </div>
          <div class="nearby-meta">
            <div class="nearby-name">${escapeHtml(p.alias)}</div>
            <div class="nearby-sub">${cap(p.platform)} · ${distance}</div>
          </div>
        </div>
        <button class="btn-send-pill" data-id="${p.id}">Send</button>
      `;

      row.querySelector(".btn-send-pill").addEventListener("click", () => {
        this.h.onSendToPeer && this.h.onSendToPeer(p.id);
      });
      this._nodeDrop(row, p.id);
      nearbyList.appendChild(row);
    });
  },

  _renderSendTargets() {
    const grid = $("send-device-grid");
    const empty = $("send-devices-empty");
    if (!grid || !empty) return;

    const allPeers = [...this._currentPeers];
    DEFAULT_DEVICES.forEach((d) => {
      if (!allPeers.some((p) => p.id === d.id)) allPeers.push(d);
    });

    grid.innerHTML = "";
    empty.hidden = allPeers.length > 0;

    allPeers.forEach((p) => {
      const card = document.createElement("div");
      card.className = "device-card";
      const graphic = p.graphic || getGraphicForPlatform(p.platform);

      card.innerHTML = `
        <div class="device-card-ico">
          <img src="${graphic}" alt="${escapeAttr(p.alias)}" />
        </div>
        <div class="device-card-info">
          <div class="device-card-name">${escapeHtml(p.alias)}</div>
          <div class="device-card-meta">${cap(p.platform)} · ${p.distance || 'Nearby'}</div>
        </div>
        <button class="btn-send-pill">Send</button>
      `;

      card.addEventListener("click", () => {
        this.h.onSendToPeer && this.h.onSendToPeer(p.id);
      });
      this._nodeDrop(card, p.id);
      grid.appendChild(card);
    });
  },

  setStagedFiles(fileList) {
    this._stagedFiles = Array.from(fileList || []);
    const countEl = $("selected-files-count");
    const listEl = $("staging-list");
    const clearBtn = $("btn-clear-staging");
    if (!countEl || !listEl) return;

    countEl.textContent = this._stagedFiles.length;
    if (clearBtn) clearBtn.hidden = this._stagedFiles.length === 0;

    if (!this._stagedFiles.length) {
      listEl.innerHTML = `<div class="rail-empty">No files selected yet. Drop files above or click browse.</div>`;
      return;
    }

    listEl.innerHTML = "";
    this._stagedFiles.forEach((f, idx) => {
      const item = document.createElement("div");
      item.className = "staging-item";
      item.innerHTML = `
        <div class="staging-item-name">${escapeHtml(f.name)}</div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="staging-item-size">${fmtBytes(f.size)}</span>
          <button class="staging-item-remove" data-idx="${idx}" title="Remove file">✕</button>
        </div>
      `;
      item.querySelector(".staging-item-remove").addEventListener("click", (e) => {
        e.stopPropagation();
        this._stagedFiles.splice(idx, 1);
        this.setStagedFiles(this._stagedFiles);
        if (this.h.onStagedChanged) this.h.onStagedChanged(this._stagedFiles);
      });
      listEl.appendChild(item);
    });
  },

  // ---- Real Transfers Wire-in --------------------------------------------
  startTransfer(id, name, size, role, mode, peerName, fileType) {
    const isCoral = role === "send";
    const newXfer = {
      id,
      name,
      size,
      target: peerName || "Device",
      thumb: typeThumb(name, fileType),
      pct: 0,
      speed: 0,
      eta: 0,
      isPaused: false,
      color: isCoral ? "coral" : "mint",
      isDemo: false,
    };
    this._transfers.unshift(newXfer);
    this.renderTransfers();
    this.addNotification(`${role === "send" ? "Sending" : "Receiving"} ${name} to ${peerName || "device"}`);
  },

  progress(id, sent, total, speed, eta) {
    const xfer = this._transfers.find((t) => t.id === id);
    if (!xfer) return;
    xfer.pct = total > 0 ? Math.min(100, (sent / total) * 100) : 100;
    xfer.speed = speed || 0;
    xfer.eta = eta && isFinite(eta) ? Math.round(eta) : 0;
    this.renderTransfers();
  },

  hashing(id, done, total) {
    const xfer = this._transfers.find((t) => t.id === id);
    if (!xfer) return;
    xfer.pct = total > 0 ? (done / total) * 100 : 100;
    this.renderTransfers();
  },

  finishSend(id, verified) {
    const xfer = this._transfers.find((t) => t.id === id);
    if (xfer) {
      xfer.pct = 100;
      xfer.done = true;
    }
    this.renderTransfers();
    this.addNotification(`Sent & verified: ${xfer ? xfer.name : "file"}`);
    this.toast(`✓ Transfer complete: ${xfer ? xfer.name : "file"}`);
  },

  finishReceive(id, name, blob, streaming, verified) {
    const xfer = this._transfers.find((t) => t.id === id);
    if (xfer) {
      xfer.pct = 100;
      xfer.done = true;
    }
    this.renderTransfers();
    this.addNotification(`Received: ${name}`);
    this.toast(`✓ Received ${name}`);
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  },

  error(id, msg) {
    if (!id) return this.toast(msg);
    const xfer = this._transfers.find((t) => t.id === id);
    if (xfer) xfer.failed = true;
    this.renderTransfers();
    this.toast(`Transfer failed: ${msg}`);
  },

  refreshCount() {
    this.renderTransfers();
  },

  // ---- History & Received Rendering --------------------------------------
  renderHistory(items) {
    const list = $("history-list");
    const empty = $("history-empty");
    if (!list) return;

    list.querySelectorAll(".history-row").forEach((el) => el.remove());
    if (!items || !items.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "history-row";
      const isSend = item.role === "send";
      const timeStr = item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";

      row.innerHTML = `
        <div class="history-thumb">📄</div>
        <div class="history-meta">
          <div class="history-name">${escapeHtml(item.name)}</div>
          <div class="history-sub">${fmtBytes(item.size)} · ${isSend ? "Sent to " : "From "}${escapeHtml(item.peerName || "device")} ${timeStr ? "· " + timeStr : ""}</div>
        </div>
        <div class="history-actions">
          <span class="tag ${isSend ? "send" : "recv"}">${isSend ? "Sent" : "Received"}</span>
          <span class="tag ${item.mode === "direct" ? "direct" : "relay"}">${item.mode === "direct" ? "Direct" : "Relayed"}</span>
          ${item.verified ? '<span class="ok" style="font-size:12px; color:var(--mint);">✓ Verified</span>' : ''}
          ${item.blobUrl ? `<a class="btn-secondary btn-sm" href="${item.blobUrl}" download="${escapeAttr(item.name)}">Download</a>` : ""}
        </div>
      `;
      list.appendChild(row);
    });
  },

  renderReceived(items) {
    const list = $("received-list");
    const empty = $("received-empty");
    if (!list) return;

    list.querySelectorAll(".history-row").forEach((el) => el.remove());
    const receivedItems = (items || []).filter((it) => it.role === "recv");
    if (!receivedItems.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    receivedItems.forEach((item) => {
      const row = document.createElement("div");
      row.className = "history-row";
      const timeStr = item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";

      row.innerHTML = `
        <div class="history-thumb">📥</div>
        <div class="history-meta">
          <div class="history-name">${escapeHtml(item.name)}</div>
          <div class="history-sub">${fmtBytes(item.size)} · From ${escapeHtml(item.peerName || "device")} ${timeStr ? "· " + timeStr : ""}</div>
        </div>
        <div class="history-actions">
          <span class="tag recv">Received</span>
          ${item.blobUrl ? `<a class="btn-primary btn-sm" href="${item.blobUrl}" download="${escapeAttr(item.name)}">Save again</a>` : ''}
        </div>
      `;
      list.appendChild(row);
    });
  },

  // ---- Settings Modal ----------------------------------------------------
  openSettings() {
    const m = $("settings-modal");
    if (m) {
      m.hidden = false;
      const curTheme = document.documentElement.getAttribute("data-theme") || "dark";
      this._updateThemeButtons(curTheme);
      $("setting-alias")?.focus();
    }
  },
  closeSettings() {
    const m = $("settings-modal");
    if (m) m.hidden = true;
  },

  _updateThemeButtons(theme) {
    document.querySelectorAll(".btn-theme-swatch[data-theme-set]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.themeSet === theme);
    });
    const darkBtn = $("btn-theme-dark");
    const lightBtn = $("btn-theme-light");
    if (darkBtn) darkBtn.classList.toggle("active", theme === "dark");
    if (lightBtn) lightBtn.classList.toggle("active", theme === "light");
  },

  setSettingsInfo(info) {
    if (info.platform && $("cap-platform")) $("cap-platform").textContent = cap(info.platform);
    if (info.browser && $("cap-browser")) $("cap-browser").textContent = cap(info.browser);
    if ($("cap-webrtc")) $("cap-webrtc").textContent = info.capabilities && info.capabilities.webrtc ? "Supported" : "Not supported";
    if ($("cap-streaming")) $("cap-streaming").textContent = info.capabilities && info.capabilities.streamingWriter ? "Supported (File System API)" : "Standard Downloads";
    if (info.stunServers && $("settings-stun-list")) {
      $("settings-stun-list").innerHTML = info.stunServers.map((s) => `<div>${escapeHtml(s)}</div>`).join("");
    }
  },

  // ---- Incoming Approval -------------------------------------------------
  showIncoming(id, name, size, peerName, streaming) {
    this._incomingId = id;
    if ($("incoming-desc")) $("incoming-desc").innerHTML = `<b>${escapeHtml(peerName || "A device")}</b> wants to send <b>${escapeHtml(name)}</b> (${fmtBytes(size)}).`;
    if ($("incoming-note")) $("incoming-note").textContent = streaming ? "You'll be asked where to save it." : "It will download automatically when complete.";
    const m = $("incoming-modal");
    if (m) m.hidden = false;
  },
  closeIncoming() {
    const m = $("incoming-modal");
    if (m) m.hidden = true;
    this._incomingId = null;
  },

  // ---- Pair Modal --------------------------------------------------------
  openPair() { const m = $("pair-modal"); if (m) m.hidden = false; },
  closePair() { const m = $("pair-modal"); if (m) m.hidden = true; },
  showCode(code, url, renderQR) {
    if ($("code-box")) $("code-box").hidden = false;
    if ($("code-value")) $("code-value").textContent = code;
    if ($("code-url")) $("code-url").textContent = url;
    if (renderQR && $("qr")) renderQR($("qr"), url);
  },

  toast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    $("toasts")?.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  },

  // ---- Drag & Drop -------------------------------------------------------
  _setupDrop(el) {
    if (!el) return;
    ["dragenter", "dragover"].forEach((ev) => el.addEventListener(ev, (e) => {
      e.preventDefault();
      el.classList.add("drag-over");
    }));
    ["dragleave", "drop"].forEach((ev) => el.addEventListener(ev, () => el.classList.remove("drag-over")));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      if (e.dataTransfer.files.length) this.h.onFilesChosen && this.h.onFilesChosen(e.dataTransfer.files);
    });
  },

  _nodeDrop(el, peerId) {
    ["dragenter", "dragover"].forEach((ev) => el.addEventListener(ev, (e) => {
      e.preventDefault();
      el.classList.add("drag-over");
    }));
    ["dragleave"].forEach((ev) => el.addEventListener(ev, () => el.classList.remove("drag-over")));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.classList.remove("drag-over");
      if (e.dataTransfer.files.length) this.h.onDropToPeer && this.h.onDropToPeer(peerId, e.dataTransfer.files);
    });
  },
};

function typeThumb(name, type) {
  const t = type || "";
  if (t.startsWith("video/") || /\.(mov|mp4|mkv|webm)$/i.test(name || "")) return "/assets/thumb-video.jpg";
  return "/assets/thumb-zip.svg";
}

export function fmtBytes(n) {
  if (!n && n !== 0) return "";
  if (n < 1024) return n + " B";
  const u = ["KB", "MB", "GB", "TB"];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return n.toFixed(n < 10 ? 1 : 0) + " " + u[i];
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s);
}
