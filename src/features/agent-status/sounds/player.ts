import ack from "../../../assets/sounds/thumb-piano/ack.wav";
import approval from "../../../assets/sounds/thumb-piano/approval.wav";
import complete from "../../../assets/sounds/thumb-piano/complete.wav";
import compact from "../../../assets/sounds/thumb-piano/compact.wav";
import error from "../../../assets/sounds/thumb-piano/error.wav";
import idle from "../../../assets/sounds/thumb-piano/idle.wav";
import question from "../../../assets/sounds/thumb-piano/question.wav";
import quotaLow from "../../../assets/sounds/thumb-piano/quotaLow.wav";
import quotaReset from "../../../assets/sounds/thumb-piano/quotaReset.wav";
import start from "../../../assets/sounds/thumb-piano/start.wav";
import { listSoundPacks, readSoundPackFile, type SoundPack } from "./api";
import type { AgentSoundEvent } from "./events";
import { isQuietTime } from "./quietHours";
import { BUILTIN_PACK, type AgentSoundSettings } from "./storage";

/** The island's own sounds ("thumb piano"), synthesized for fly-island; see assets/sounds/README.md. */
const BUILTIN_SOUNDS: Record<AgentSoundEvent, string> = {
  start, complete, error, approval, question, ack, compact, idle, quotaLow, quotaReset,
};

let packs: Promise<SoundPack[]> | null = null;
const packUrls = new Map<string, Promise<string | null>>();

/** Forget cached packs after one is imported or removed. */
export function forgetSoundPacks() {
  packs = null;
  for (const url of packUrls.values()) void url.then((value) => value && URL.revokeObjectURL(value));
  packUrls.clear();
}

function packFileUrl(pack: SoundPack, event: AgentSoundEvent): Promise<string | null> {
  const file = pack.sounds[event];
  if (!file) return Promise.resolve(null);
  const key = `${pack.id}/${file}`;
  let url = packUrls.get(key);
  if (!url) {
    url = readSoundPackFile(pack.id, file)
      .then((bytes) => URL.createObjectURL(new Blob([bytes])))
      .catch((reason: unknown) => {
        console.error(`Failed to read the sound ${key}`, reason);
        return null;
      });
    packUrls.set(key, url);
  }
  return url;
}

/** The file to play for `event` with `packId`; a pack without that event, or a missing pack, plays the built-in one. */
async function soundUrl(packId: string, event: AgentSoundEvent): Promise<string> {
  if (packId === BUILTIN_PACK) return BUILTIN_SOUNDS[event];
  packs ??= listSoundPacks().catch((reason: unknown) => {
    console.error("Failed to list the sound packs", reason);
    return [];
  });
  let pack = (await packs).find((candidate) => candidate.id === packId);
  // Chosen after this window listed the packs (imported, or a plugin installed since): look again.
  if (!pack) {
    forgetSoundPacks();
    packs = listSoundPacks().catch(() => []);
    pack = (await packs).find((candidate) => candidate.id === packId);
  }
  return (pack && (await packFileUrl(pack, event))) ?? BUILTIN_SOUNDS[event];
}

/** Plays `event` from `packId` at `volume` (0-100), ignoring the on / off and quiet settings: for previews. */
export async function previewAgentSound(event: AgentSoundEvent, packId: string, volume: number) {
  const audio = new Audio(await soundUrl(packId, event));
  audio.volume = Math.min(1, Math.max(0, volume / 100));
  await audio.play().catch((reason: unknown) => console.error(`Failed to play the ${event} sound`, reason));
}

/**
 * Plays the sound for an agent event when the settings allow it: sounds on, this event on, the
 * volume above zero and outside quiet hours. Whether the session's window is in front is the
 * caller's to check.
 */
export function playAgentSound(event: AgentSoundEvent, settings: AgentSoundSettings, now = new Date()) {
  if (!settings.enabled || !settings.events[event] || settings.volume === 0) return;
  const { quietHours } = settings;
  if (quietHours.enabled && isQuietTime(now, quietHours.start, quietHours.end)) return;
  void previewAgentSound(event, settings.pack, settings.volume);
}
