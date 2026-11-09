import { useEffect, useState } from "react";
import {
  AppWindow, File, FileArchive, FileAudio, FileCode, FileImage, FileSpreadsheet, FileText, FileVideo, Folder, Presentation,
  type LucideIcon,
} from "lucide-react";
import { getFileShelfIcon, getFileShelfThumbnail } from "./api";
import { getFileKind, type FileKind } from "./fileShelf";

const KIND_ICONS: Record<FileKind, LucideIcon> = {
  folder: Folder,
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  archive: FileArchive,
  document: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  code: FileCode,
  app: AppWindow,
  file: File,
};

type Picture = { kind: "thumbnail" | "system"; url: string };

/**
 * The entry's icon: a preview for an image, else the icon Explorer shows for it, else (outside
 * Windows, or while either loads) a type icon on a tile in the type's colour.
 */
export function FileShelfItemIcon({
  id,
  name,
  isDir,
  available,
}: {
  id: string;
  name: string;
  isDir: boolean;
  /** False for missing or unreachable entries: no preview, and only their type's icon. */
  available: boolean;
}) {
  const kind = getFileKind(name, isDir);
  const [picture, setPicture] = useState<Picture | null>(null);
  const Icon = KIND_ICONS[kind];

  useEffect(() => {
    let didCancel = false;
    const show = (next: Picture | null) => {
      if (!didCancel && next) setPicture(next);
    };
    const systemIcon = (): Promise<Picture | null> =>
      getFileShelfIcon(id, available).then((url) => (url ? { kind: "system", url } : null));
    const load: Promise<Picture | null> = kind === "image" && available
      ? getFileShelfThumbnail(id).then((url) => (url ? { kind: "thumbnail", url } : systemIcon()))
      : systemIcon();
    // Either is optional; the type icon stays.
    load.then(show, () => undefined);
    return () => {
      didCancel = true;
    };
  }, [available, id, kind]);

  const className = [
    "shelf-item__icon",
    `shelf-item__icon--${kind}`,
    picture?.kind === "thumbnail" ? "shelf-item__icon--thumbnail" : "",
    picture?.kind === "system" ? "shelf-item__icon--system" : "",
  ].filter(Boolean).join(" ");

  return (
    <span className={className} aria-hidden="true">
      {picture ? <img src={picture.url} alt="" draggable={false} /> : <Icon size={19} strokeWidth={1.9} />}
    </span>
  );
}
