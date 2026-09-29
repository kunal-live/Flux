// ==========================================================================
// FLUX DESKTOP NOTIFICATION CONTROLLER
// Handles system alerts when browser tab is minimized or backgrounded
// ==========================================================================

class NotificationController {
  constructor() {
    this._permission = "default";
    if ("Notification" in window) {
      this._permission = Notification.permission;
    }
  }

  isSupported() {
    return "Notification" in window;
  }

  async requestPermission() {
    if (!this.isSupported()) return false;
    try {
      this._permission = await Notification.requestPermission();
      return this._permission === "granted";
    } catch {
      return false;
    }
  }

  notify(title, options = {}) {
    if (!this.isSupported() || this._permission !== "granted") return null;

    // Only fire desktop notifications when window is in background / minimized
    if (!document.hidden && !options.force) {
      return null;
    }

    try {
      const n = new Notification(title, {
        icon: "/icon.svg",
        badge: "/icon.svg",
        silent: true, // We use our custom synthesized Web Audio sounds
        ...options,
      });

      n.onclick = () => {
        window.focus();
        n.close();
      };

      return n;
    } catch {
      return null;
    }
  }
}

export const Notifier = new NotificationController();
