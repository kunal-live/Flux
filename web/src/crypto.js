// ==========================================================================
// FLUX WEB CRYPTO ENGINE — AES-GCM 256-bit Password Protected Transfers
// Zero external libraries • Native Web Crypto API
// ==========================================================================

export async function deriveKeyFromPassphrase(passphrase, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptBuffer(key, dataBuffer) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    dataBuffer
  );

  // Return IV prepended to ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return combined.buffer;
}

export async function decryptBuffer(key, combinedBuffer) {
  const combined = new Uint8Array(combinedBuffer);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  return await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    key,
    ciphertext
  );
}

export async function encryptString(text, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKeyFromPassphrase(passphrase, salt);
  const data = new TextEncoder().encode(text);
  const encryptedBuf = await encryptBuffer(key, data.buffer);

  const saltB64 = btoa(String.fromCharCode(...salt));
  const dataB64 = btoa(String.fromCharCode(...new Uint8Array(encryptedBuf)));
  return JSON.stringify({ flux_enc: true, v: 1, salt: saltB64, data: dataB64 });
}

export function isEncryptedPayload(str) {
  if (typeof str !== "string" || !str.includes("flux_enc")) return false;
  try {
    const obj = JSON.parse(str);
    return !!(obj && obj.flux_enc && obj.salt && obj.data);
  } catch {
    return false;
  }
}

export async function decryptString(encryptedJsonStr, passphrase) {
  const obj = JSON.parse(encryptedJsonStr);
  const salt = Uint8Array.from(atob(obj.salt), c => c.charCodeAt(0));
  const combined = Uint8Array.from(atob(obj.data), c => c.charCodeAt(0));
  const key = await deriveKeyFromPassphrase(passphrase, salt);
  const decryptedBuf = await decryptBuffer(key, combined.buffer);
  return new TextDecoder().decode(decryptedBuf);
}

