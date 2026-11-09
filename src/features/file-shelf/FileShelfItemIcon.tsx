import { useEffect, useState } from "react";
import { File, FileArchive, FileAudio, FileImage, FileText, FileVideo, Folder, type LucideIcon } from "lucide-react";
import { getFileShelfThumbnail } from "./api";
import { getFileKind, type FileKind } from "./fileShelf";

const KIND_ICONS: Record<FileKind, LucideIcon> = {
  folder: Folder,
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  archive: FileArchive,
  text: FileText,
  file: File,
};

/** The entry's file-type icon, replaced by a preview once one loads for an image. */
export function FileShelfItemIcon({
  id,
  name,
  isDir,
  available,
}: {
  id: string;
  name: string;
  isDir: boolean;
  /** False for missing or unreachable entries, which are not previewed. */
  available: boolean;
}) {
  const kind = getFileKind(name, isDir);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const Icon = KIND_ICONS[kind];

  useEffect(() => {
    if (kind !== "image" || !available) {
      setThumbnail(null);
      return;
    }
    let didCancel = false;
    void getFileShelfThumbnail(id)
      .then((url) => {
        if (!didCancel) setThumbnail(url);
      })
      .catch(() => {
        // A preview is optional; the icon stays.
      });
    return () => {
      didCancel = true;
    };
  }, [available, id, kind]);

  return (
    <span className={`shelf-item__icon${thumbnail ? " shelf-item__icon--thumbnail" : ""}`} aria-hidden="true">
      {thumbnail ? <img src={thumbnail} alt="" draggable={false} /> : <Icon size={20} strokeWidth={1.9} />}
    </span>
  );
}
