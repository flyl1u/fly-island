import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

function decryptWindowsPassword(passwordFile) {
  if (process.platform !== "win32") {
    throw new Error("Local signing credentials use Windows DPAPI. Supply the three TAURI signing variables on other systems.");
  }
  const command = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
$secret = Get-Content -LiteralPath $env:FOCUSD_RELEASE_PASSWORD_FILE -Raw | ConvertTo-SecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  @{ password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) } | ConvertTo-Json -Compress
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}`;
  const childEnv = { ...process.env, FOCUSD_RELEASE_PASSWORD_FILE: passwordFile };
  // PowerShell 7 module paths are incompatible with the Windows PowerShell 5 host.
  delete childEnv.PSModulePath;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
    windowsHide: true,
    env: childEnv,
  });
  if (result.error || result.status !== 0) {
    throw new Error("Cannot unlock the local signing password. Run as the Windows user who configured it, or supply TAURI signing variables.");
  }
  const { password } = JSON.parse(result.stdout.replace(/^\uFEFF/, ""));
  if (typeof password !== "string") throw new Error("Invalid local signing password response.");
  return password;
}

export function loadSigningEnvironment(env = process.env, options = {}) {
  // CI or an explicitly selected key must never be mixed with the local key pair.
  if (env.TAURI_UPDATER_PUBKEY?.trim() || env.TAURI_SIGNING_PRIVATE_KEY?.trim()) return { ...env };

  const configPath = options.configPath ?? env.FOCUSD_SIGNING_CONFIG
    ?? join(homedir(), ".tauri", "fly-island", "release.json");
  if (!existsSync(configPath)) return { ...env };
  const config = JSON.parse(readFileSync(configPath, "utf8").replace(/^\uFEFF/, ""));
  if (config.schemaVersion !== 1) throw new Error("Unsupported local signing configuration version.");
  for (const field of ["privateKeyPath", "publicKeyPath", "passwordFile"]) {
    if (typeof config[field] !== "string" || !isAbsolute(config[field]) || !existsSync(config[field])) {
      throw new Error(`Missing or invalid ${field} in the local signing configuration.`);
    }
  }
  const pubkey = readFileSync(config.publicKeyPath, "utf8").trim();
  if (!pubkey) throw new Error("The local updater public key is empty.");
  const decrypt = options.decryptPassword ?? decryptWindowsPassword;
  return {
    ...env,
    TAURI_UPDATER_PUBKEY: pubkey,
    TAURI_SIGNING_PRIVATE_KEY: config.privateKeyPath,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? decrypt(config.passwordFile),
  };
}
