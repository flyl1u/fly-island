import { useRef, useState, type ChangeEvent } from "react";
import { FolderOpen } from "lucide-react";
import { SettingsGroup } from "../../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../../components/settings/SettingsRow";
import { useTranslation } from "../../../i18n";
import { importSoundPack, removeSoundPack, type SoundPack, type SoundPackImport } from "./api";
import { AGENT_SOUND_EVENTS } from "./events";
import { planSoundPack } from "./packManifest";
import "./SoundPacksGroup.css";

/** JSON files larger than this are not manifests; they are not read. */
const MAX_MANIFEST_BYTES = 256 * 1024;

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "done"; text: string } | { kind: "error"; text: string };

/** Settings → Sounds → Sound packs: the imported packs, removing one, importing a folder. */
export function SoundPacksGroup({
  packs,
  onChanged,
}: {
  packs: SoundPack[];
  /** After an import (with the new pack) or a removal. */
  onChanged: (imported?: SoundPack) => void;
}) {
  const t = useTranslation();
  const text = t.settings.sounds;
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const importFolder = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.currentTarget.files ?? [])];
    event.currentTarget.value = "";
    if (files.length === 0) return;
    setStatus({ kind: "busy" });
    try {
      const pathOf = (file: File) => file.webkitRelativePath || file.name;
      const folderName = pathOf(files[0]).split("/")[0] ?? "";
      const jsonFiles = await Promise.all(
        files
          .filter((file) => file.name.toLowerCase().endsWith(".json") && file.size <= MAX_MANIFEST_BYTES)
          .map(async (file) => ({ path: pathOf(file), text: await file.text() })),
      );
      const plan = planSoundPack(folderName, files.map(pathOf), jsonFiles);
      if (plan === "noSounds") {
        setStatus({ kind: "error", text: text.noSounds });
        return;
      }
      const byPath = new Map(files.map((file) => [pathOf(file), file]));
      const chosen: SoundPackImport["files"] = [];
      for (const soundEvent of AGENT_SOUND_EVENTS) {
        const file = plan.sounds[soundEvent] ? byPath.get(plan.sounds[soundEvent]) : undefined;
        if (file) chosen.push({ event: soundEvent, name: file.name, bytes: [...new Uint8Array(await file.arrayBuffer())] });
      }
      const pack = await importSoundPack({ name: plan.name, author: plan.author, license: plan.license, files: chosen });
      setStatus({ kind: "done", text: text.imported(pack.name) });
      onChanged(pack);
    } catch (error) {
      setStatus({ kind: "error", text: String(error) });
    }
  };

  const remove = (pack: SoundPack) => {
    if (!window.confirm(text.confirmRemove(pack.name))) return;
    void removeSoundPack(pack.id)
      .then(() => onChanged())
      .catch((error: unknown) => setStatus({ kind: "error", text: String(error) }));
  };

  const footer = (
    <>
      <p>{text.packsFooter}</p>
      {status.kind === "done" && <p role="status">{status.text}</p>}
      {status.kind === "error" && <p className="sound-packs__error" role="alert">{status.text}</p>}
    </>
  );

  return (
    <SettingsGroup title={text.packsTitle} footer={footer}>
      {packs.length === 0 && <SettingsRow title={<span className="sound-packs__empty">{text.packsEmpty}</span>} />}
      {packs.map((pack) => (
        <SettingsRow
          key={pack.id}
          title={pack.name}
          description={text.packMeta(pack.author, pack.license, Object.keys(pack.sounds).length)}
          control={<SettingsLinkButton tone="danger" onClick={() => remove(pack)}>{text.removePack}</SettingsLinkButton>}
        />
      ))}
      <SettingsRow
        title={text.importPack}
        control={
          <>
            <SettingsLinkButton disabled={status.kind === "busy"} onClick={() => input.current?.click()}>
              <FolderOpen size={13} strokeWidth={2.2} aria-hidden="true" />
              {status.kind === "busy" ? text.importing : text.importAction}
            </SettingsLinkButton>
            <input
              ref={input}
              className="sound-packs__input"
              type="file"
              multiple
              aria-label={text.importPack}
              {...{ webkitdirectory: "" }}
              onChange={(event) => void importFolder(event)}
            />
          </>
        }
      />
    </SettingsGroup>
  );
}
