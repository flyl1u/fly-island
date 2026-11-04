// Ed25519 signing of plugins/index.json. The app trusts the keys in
// plugins/signing-keys.json (compiled in) and refuses an index whose
// index.json.sig does not verify. The index lists each package's SHA-256, so
// signing the index covers the packages too.
//
//   pnpm plugins:keygen   create the key pair (once); the private key is kept
//                         outside the repo, encrypted for this Windows user
//   pnpm plugins:index    packs, writes and signs the index
//
// Private key: FOCUSD_PLUGIN_SIGNING_KEY (PEM text) if set, else
// ~/.tauri/fly-island/plugin-index-signing.key (DPAPI-protected PEM).
import { spawnSync } from "node:child_process";
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const KEY_FILE = path.join(homedir(), ".tauri", "fly-island", "plugin-index-signing.key");
export const TRUSTED_KEYS_PATH = "plugins/signing-keys.json";
// DER prefix of an Ed25519 SubjectPublicKeyInfo; the raw 32-byte key follows.
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** The bytes that are signed: CRLF line ends become LF, so a CRLF checkout verifies too. */
export const signedBytes = (text) => Buffer.from(text.replaceAll("\r\n", "\n"), "utf8");

export function rawPublicKey(publicKey) {
  return publicKey.export({ format: "der", type: "spki" }).subarray(SPKI_PREFIX.length);
}

export const keyIdOf = (raw) => createHash("sha256").update(raw).digest("hex").slice(0, 16);

export function signIndex(text, privateKey) {
  const raw = rawPublicKey(createPublicKey(privateKey));
  return { keyId: keyIdOf(raw), signature: sign(null, signedBytes(text), privateKey).toString("base64") };
}

/** True when `signature` ({ keyId, signature }) is a valid signature of `text` by one of `trustedKeys`. */
export function verifyIndex(text, signature, trustedKeys) {
  const trusted = trustedKeys.find((key) => key.keyId === signature?.keyId);
  if (!trusted || typeof signature.signature !== "string") return false;
  const publicKey = createPublicKey({
    key: Buffer.concat([SPKI_PREFIX, Buffer.from(trusted.publicKey, "base64")]),
    format: "der",
    type: "spki",
  });
  return verify(null, signedBytes(text), publicKey, Buffer.from(signature.signature, "base64"));
}

/** Runs DPAPI (CurrentUser) through Windows PowerShell; `mode` is Protect or Unprotect. */
function dpapi(mode, input) {
  const command = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$data = [Convert]::FromBase64String($env:FOCUSD_DPAPI_INPUT)
$out = [Security.Cryptography.ProtectedData]::${mode}($data, $null, 'CurrentUser')
[Console]::Out.Write([Convert]::ToBase64String($out))`;
  const env = { ...process.env, FOCUSD_DPAPI_INPUT: input.toString("base64") };
  // PowerShell 7 module paths are incompatible with the Windows PowerShell 5 host.
  delete env.PSModulePath;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
    windowsHide: true,
    env,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`DPAPI ${mode} failed. Run as the Windows user who created the key, or set FOCUSD_PLUGIN_SIGNING_KEY.`);
  }
  return Buffer.from(result.stdout.trim(), "base64");
}

export function loadPrivateKey(env = process.env) {
  if (env.FOCUSD_PLUGIN_SIGNING_KEY?.trim()) return createPrivateKey(env.FOCUSD_PLUGIN_SIGNING_KEY);
  if (!existsSync(KEY_FILE)) {
    throw new Error(`No plugin signing key: run "pnpm plugins:keygen" once, or set FOCUSD_PLUGIN_SIGNING_KEY.`);
  }
  const pem = dpapi("Unprotect", Buffer.from(readFileSync(KEY_FILE, "utf8").trim(), "base64"));
  return createPrivateKey(pem.toString("utf8"));
}

function keygen(root) {
  if (existsSync(KEY_FILE)) {
    throw new Error(`${KEY_FILE} already exists. Delete it first only if you mean to replace the key.`);
  }
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ format: "pem", type: "pkcs8" });
  mkdirSync(path.dirname(KEY_FILE), { recursive: true });
  writeFileSync(KEY_FILE, dpapi("Protect", Buffer.from(pem, "utf8")).toString("base64"));

  const raw = rawPublicKey(publicKey);
  const trustedPath = path.join(root, TRUSTED_KEYS_PATH);
  const trusted = existsSync(trustedPath) ? JSON.parse(readFileSync(trustedPath, "utf8")) : { keys: [] };
  trusted.keys.push({ keyId: keyIdOf(raw), publicKey: raw.toString("base64") });
  writeFileSync(trustedPath, `${JSON.stringify(trusted, null, 2)}\n`);
  console.log(`Saved the private key to ${KEY_FILE} (encrypted for this Windows user).`);
  console.log(`Added key ${keyIdOf(raw)} to ${TRUSTED_KEYS_PATH}; rebuild the app so it trusts the key.`);
  console.log("Back up the key file: losing it means publishing a new key with a new app release.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  if (process.argv[2] === "keygen") {
    keygen(root);
  } else {
    console.error("Usage: node scripts/plugin-signing.mjs keygen");
    process.exit(1);
  }
}
