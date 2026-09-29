// Best-effort QR for the pairing link. Flux targets LANs that may be offline,
// so the authoritative path is always the visible code + copyable URL. The QR
// is a lazy-loaded enhancement; if it can't load, the code still works.

const CDN = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
let loading = null;

function lib() {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    if (window.QRCode) return resolve(window.QRCode);
    const s = document.createElement("script");
    s.src = CDN;
    s.onload = () => resolve(window.QRCode);
    s.onerror = () => reject(new Error("offline"));
    document.head.appendChild(s);
  });
  return loading;
}

export async function renderQR(container, text, size = 168) {
  container.innerHTML = "";
  try {
    const QRCode = await lib();
    new QRCode(container, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
    return true;
  } catch {
    const n = document.createElement("div");
    n.className = "qr-fallback";
    n.textContent = "Scan needs internet — share the code instead.";
    container.appendChild(n);
    return false;
  }
}
