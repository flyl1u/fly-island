import { invoke } from "@tauri-apps/api/core";
import type { AgentSoundEvent } from "./events";

/** Mirrors SoundPack in src-tauri/src/agent_status/sound_packs.rs. */
export type SoundPack = {
  id: string;
  name: string;
  author: string;
  license: string;
  /** Event to the file name inside the pack's folder. */
  sounds: Partial<Record<AgentSoundEvent, string>>;
  /** A pack an installed plugin brings (id `plugin:<plugin id>`): removed on the plugin page. */
  fromPlugin?: boolean;
  /** A plugin pack's English name; `name` is its Chinese one. */
  nameEn?: string;
};

export function listSoundPacks() {
  return invoke<SoundPack[]>("list_sound_packs");
}

/** The raw bytes of one file in an imported pack. */
export function readSoundPackFile(id: string, file: string) {
  return invoke<ArrayBuffer>("read_sound_pack_file", { id, file });
}
