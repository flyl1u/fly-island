// `fly-island-plugin keys rotate`: replaces the signing key and has the old key
// vouch for the new one (docs/architecture/plugin-author-signing.md §3.5), so
// islands that remember the old key take updates signed by the new one without
// asking. The endorsement names the plugin, so a key shared by several plugins
// is endorsed once per plugin id.
import { existsSync, renameSync } from "node:fs";
import { endorseKey, generateSigningKey, KEY_ENV, loadSigningKey, publicKeyOf } from "./sign.mjs";

/**
 * Moves the old key file aside (`<file>.<old keyId>.old`) and creates the new key
 * in its place, or in `newFile`. With the old key in the environment, `newFile`
 * is required. Returns { oldKeyId, retiredFile, newFile, endorsed: [{ id, key }] }.
 */
export function rotateKey({ file, newFile, ids, env = process.env }) {
  if (ids.length === 0) throw new Error("Name the plugin ids the key signs.");
  const fromEnv = Boolean(env[KEY_ENV]?.trim());
  if (fromEnv && !newFile) throw new Error(`The old key comes from ${KEY_ENV}; say where the new one goes with --new-key <file>.`);
  const oldKey = loadSigningKey({ file, env });
  const oldKeyId = publicKeyOf(oldKey).keyId;
  const target = newFile ?? file;
  let retiredFile = null;
  if (target === file && !fromEnv) {
    retiredFile = `${file}.${oldKeyId}.old`;
    if (existsSync(retiredFile)) throw new Error(`${retiredFile} already exists.`);
    renameSync(file, retiredFile);
  } else if (existsSync(target)) {
    throw new Error(`${target} already exists.`);
  }
  let newKey;
  try {
    newKey = generateSigningKey(target);
  } catch (error) {
    if (retiredFile) renameSync(retiredFile, file);
    throw error;
  }
  return { oldKeyId, retiredFile, newFile: target, endorsed: ids.map((id) => ({ id, key: endorseKey(id, newKey, oldKey) })) };
}
