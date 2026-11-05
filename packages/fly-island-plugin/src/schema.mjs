// The protocol description: copies of plugins/schema/ that `pnpm sdk:build`
// puts into this package, so the published CLI has them too.
import { readFileSync } from "node:fs";

const load = (name) => JSON.parse(readFileSync(new URL(`../schema/${name}`, import.meta.url), "utf8"));

let cache = null;

/** { manifestSchema, rpc } from the package's schema folder. */
export function protocol() {
  cache ??= { manifestSchema: load("manifest.schema.json"), rpc: load("rpc.json") };
  return cache;
}

/** Host method name -> the permission it needs (null: none). */
export function methodPermissions() {
  return new Map(protocol().rpc.methods.map((method) => [method.name, method.permission ?? null]));
}

/** Event name -> the permission subscribing needs (null: none). */
export function eventPermissions() {
  return new Map(protocol().rpc.events.map((event) => [event.name, event.permission ?? null]));
}
