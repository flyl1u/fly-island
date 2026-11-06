// Author signatures of plugin packages (docs/architecture/plugin-author-signing.md).
// The author signs "focusd-plugin-package/1\n<id>\n<version>\n<sha256 of the zip>"
// with an Ed25519 key and publishes <id>-<version>.zip.sig ({ keyId, signature })
// next to the zip. The market lists the key; the island checks the signature and
// keeps updates on the same key. Checked the same way by
// src-tauri/src/plugin_host/author_signing.rs.
//
// Private key: FLY_ISLAND_PLUGIN_SIGNING_KEY (PEM text) if set, else a key file
// (default ~/.fly-island-plugin/signing.key): on Windows encrypted with DPAPI for
// the current user, elsewhere a PEM readable only by its owner.
import { spawnSync } from "node:child_process";
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const SIGNATURE_DOMAIN = "focusd-plugin-package/1";
export const DEFAULT_KEY_FILE = path.join(homedir(), ".fly-island-plugin", "signing.key");
export const KEY_ENV = "FLY_ISLAND_PLUGIN_SIGNING_KEY";
// DER prefix of an Ed25519 SubjectPublicKeyInfo; the raw 32-byte key follows.
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** What is signed for one package. */
export const signedText = (id, version, sha256) => `${SIGNATURE_DOMAIN}\n${id}\n${version}\n${sha256.toLowerCase()}`;

/** `keyId` is the first 16 hex digits of the raw public key's SHA-256. */
export const keyIdOf = (raw) => createHash("sha256").update(raw).digest("hex").slice(0, 16);

/** { keyId, publicKey } (base64 of the raw 32 bytes), as the market lists it. */
export function publicKeyOf(privateKey) {
  const raw = createPublicKey(privateKey).export({ format: "der", type: "spki" }).subarray(SPKI_PREFIX.length);
  return { keyId: keyIdOf(raw), publicKey: raw.toString("base64") };
}

export const sha256Hex = (buffer) => createHash("sha256").update(buffer).digest("hex");

/** The signature of a package: { keyId, signature }. */
export function signPackage(id, version, zip, privateKey) {
  const { keyId } = publicKeyOf(privateKey);
  return { keyId, signature: sign(null, Buffer.from(signedText(id, version, sha256Hex(zip))), privateKey).toString("base64") };
}

/** The keyId of the key in `keys` that made `signature` ({ keyId, signature }) of `text`, or null. */
function verifyText(text, signature, keys) {
  const key = keys.find((item) => item.keyId === signature?.keyId);
  if (!key || typeof signature.signature !== "string") return null;
  const raw = Buffer.from(key.publicKey, "base64");
  if (raw.length !== 32 || keyIdOf(raw) !== key.keyId) return null;
  const publicKey = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: "der", type: "spki" });
  return verify(null, Buffer.from(text), publicKey, Buffer.from(signature.signature, "base64")) ? key.keyId : null;
}

/** The keyId of the key in `keys` ({ keyId, publicKey }[]) that made `signature`, or null. */
export function verifyPackage(id, version, sha256, signature, keys) {
  return verifyText(signedText(id, version, sha256), signature, keys);
}

export const KEY_DOMAIN = "focusd-plugin-key/1";

/** What the old key signs to vouch for a new key of plugin `id` (src-tauri/src/plugin_host/author_signing.rs). */
export const endorsementText = (id, key) => `${KEY_DOMAIN}\n${id}\n${key.keyId}\n${key.publicKey}`;

/** `newKey` ({ keyId, publicKey }) with `endorsedBy`, the old private key's signature for plugin `id`. */
export function endorseKey(id, newKey, oldPrivateKey) {
  const { keyId } = publicKeyOf(oldPrivateKey);
  const signature = sign(null, Buffer.from(endorsementText(id, newKey)), oldPrivateKey).toString("base64");
  return { keyId: newKey.keyId, publicKey: newKey.publicKey, endorsedBy: { keyId, signature } };
}

/** Whether `key.endorsedBy` is a valid signature for plugin `id` by one of `keys`. */
export function verifyEndorsement(id, key, keys) {
  return Boolean(key?.endorsedBy) && verifyText(endorsementText(id, key), key.endorsedBy, keys) !== null;
}

/** Runs DPAPI (CurrentUser) through Windows PowerShell; `mode` is Protect or Unprotect. */
function dpapi(mode, input) {
  const command = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$data = [Convert]::FromBase64String($env:FLY_ISLAND_DPAPI_INPUT)
$out = [Security.Cryptography.ProtectedData]::${mode}($data, $null, 'CurrentUser')
[Console]::Out.Write([Convert]::ToBase64String($out))`;
  const env = { ...process.env, FLY_ISLAND_DPAPI_INPUT: input.toString("base64") };
  // PowerShell 7 module paths are incompatible with the Windows PowerShell 5 host.
  delete env.PSModulePath;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8", windowsHide: true, env });
  if (result.error || result.status !== 0) {
    throw new Error(`DPAPI ${mode} failed. Run as the Windows user who created the key, or set ${KEY_ENV}.`);
  }
  return Buffer.from(result.stdout.trim(), "base64");
}

/** The private key from `env[envName]` or `file`; throws when there is none. */
export function loadSigningKey({ file = DEFAULT_KEY_FILE, env = process.env, envName = KEY_ENV } = {}) {
  if (env[envName]?.trim()) return createPrivateKey(env[envName]);
  if (!existsSync(file)) throw new Error(`No signing key: run "fly-island-plugin keygen" once, or set ${envName}.`);
  const stored = readFileSync(file, "utf8").trim();
  const pem = process.platform === "win32" ? dpapi("Unprotect", Buffer.from(stored, "base64")).toString("utf8") : stored;
  return createPrivateKey(pem);
}

/** Creates a key pair in `file` (refuses to replace one); returns { keyId, publicKey }. */
export function generateSigningKey(file = DEFAULT_KEY_FILE) {
  if (existsSync(file)) throw new Error(`${file} already exists. Delete it first only if you mean to replace the key.`);
  const { privateKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ format: "pem", type: "pkcs8" });
  mkdirSync(path.dirname(file), { recursive: true });
  if (process.platform === "win32") {
    writeFileSync(file, dpapi("Protect", Buffer.from(pem, "utf8")).toString("base64"));
  } else {
    writeFileSync(file, pem, { mode: 0o600 });
    chmodSync(file, 0o600);
  }
  return publicKeyOf(privateKey);
}

/** Writes `<zip>.sig` for a package; returns the signature. */
export function writePackageSignature(zipFile, id, version, zip, privateKey) {
  const signature = signPackage(id, version, zip, privateKey);
  writeFileSync(`${zipFile}.sig`, `${JSON.stringify(signature, null, 2)}\n`);
  return signature;
}

/** "<id>-<version>.zip" into { id, version }, or null. */
export function parsePackageName(fileName) {
  const match = /^(.+)-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\.zip$/.exec(path.basename(fileName));
  return match ? { id: match[1], version: match[2] } : null;
}
