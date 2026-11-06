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
};

/** Mirrors SoundPackImport in src-tauri/src/agent_status/sound_packs.rs. */
export type SoundPackImport = {
  name: string;
  author: string;
  license: string;
  files: { event: AgentSoundEvent; name: string; bytes: number[] }[];
};

export function listSoundPacks() {
  return invoke<SoundPack[]>("list_sound_packs");
}

export function importSoundPack(pack: SoundPackImport) {
  return invoke<SoundPack>("import_sound_pack", { pack });
}

export function removeSoundPack(id: string) {
  return invoke<void>("remove_sound_pack", { id });
}

/** The raw bytes of one file in an imported pack. */
export function readSoundPackFile(id: string, file: string) {
  return invoke<ArrayBuffer>("read_sound_pack_file", { id, file });
}
