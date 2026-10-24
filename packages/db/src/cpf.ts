import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { isValidCpf } from "@pulso/domain";

const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface CpfKeys {
  keyId: string;
  encKey: Buffer;
  hmacKey: Buffer;
}

export interface SealedCpf {
  cpfEnc: Buffer;
  cpfKeyId: string;
  cpfHash: string;
}

function keyBytes(value: string | undefined, name: string): Buffer | null {
  if (!value) return null;
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32) throw new Error(`${name} precisa ter 32 bytes em base64.`);
  return decoded;
}

export function loadCpfKeys(env: NodeJS.ProcessEnv = process.env): CpfKeys | null {
  const keyId = env.CPF_KEY_ID?.trim();
  if (!env.CPF_ENC_KEY && !env.CPF_HMAC_KEY && !keyId) return null;
  const encKey = keyBytes(env.CPF_ENC_KEY, "CPF_ENC_KEY");
  const hmacKey = keyBytes(env.CPF_HMAC_KEY, "CPF_HMAC_KEY");
  if (!encKey || !hmacKey || !keyId) throw new Error("CPF_ENC_KEY, CPF_HMAC_KEY e CPF_KEY_ID precisam vir juntos.");
  return { keyId, encKey, hmacKey };
}

export function normalizeCpf(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (!isValidCpf(digits)) return null;
  return digits;
}

export function hashCpf(normalized: string, keys: CpfKeys): string {
  return createHmac("sha256", keys.hmacKey).update(normalized, "utf8").digest("hex");
}

export function encryptCpf(normalized: string, keys: CpfKeys): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keys.encKey, iv);
  const ciphertext = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

export function decryptCpf(payload: Uint8Array, keys: CpfKeys): string {
  const bytes = Buffer.from(payload);
  if (bytes.length < IV_BYTES + TAG_BYTES + 1) throw new Error("CPF cifrado incompleto.");
  const iv = bytes.subarray(0, IV_BYTES);
  const tag = bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = bytes.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", keys.encKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function sealCpf(plain: string, keys: CpfKeys): SealedCpf | null {
  const normalized = normalizeCpf(plain);
  if (!normalized) return null;
  return { cpfEnc: encryptCpf(normalized, keys), cpfKeyId: keys.keyId, cpfHash: hashCpf(normalized, keys) };
}
