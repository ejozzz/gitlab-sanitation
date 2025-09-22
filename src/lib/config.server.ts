// src/lib/config.server.ts
import crypto from "crypto";

const ENC_ALGO = "aes-256-gcm";
let _key: Buffer | null = null;

function getKey(): Buffer {
  if (_key) return _key;
  const raw = process.env.GITLAB_TOKEN_KEY;
  if (!raw) throw new Error("Missing env GITLAB_TOKEN_KEY");
  _key = crypto.createHash("sha256").update(raw).digest(); // 32 bytes
  return _key;
}

export function encryptToken(plaintext: string) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENC_ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString("base64"),
    nonce: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptToken(ciphertext: string, nonce: string, tag: string) {
  const key = getKey();
  const decipher = crypto.createDecipheriv(ENC_ALGO, key, Buffer.from(nonce, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
