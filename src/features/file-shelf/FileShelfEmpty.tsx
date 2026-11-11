import { ArrowDown, File, FileImage, FileText } from "lucide-react";
import { useTranslation } from "../../i18n";
import "./FileShelfEmpty.css";

const STROKE = { strokeWidth: 1.5, absoluteStrokeWidth: true } as const;

/**
 * The empty shelf: three files fanned out, what the shelf is for and that it only remembers where
 * files are, straight on the panel. While files are dragged over the island the files make room
 * for an arrow: the whole page is the place to let go.
 */
export function FileShelfEmpty({ isDropTarget }: { isDropTarget: boolean }) {
  const t = useTranslation();

  return (
    <div className={`shelf-empty${isDropTarget ? " shelf-empty--dropping" : ""}`}>
      <span className="shelf-empty__art" aria-hidden="true">
        <span className="shelf-empty__file shelf-empty__file--left"><FileImage size={18} {...STROKE} /></span>
        <span className="shelf-empty__file shelf-empty__file--right"><FileText size={18} {...STROKE} /></span>
        <span className="shelf-empty__file shelf-empty__file--front">
          {isDropTarget ? <ArrowDown size={18} {...STROKE} /> : <File size={18} {...STROKE} />}
        </span>
      </span>
      <span className="shelf-empty__copy">
        <span className="shelf-empty__title">{isDropTarget ? t.fileShelf.dropHint : t.fileShelf.empty}</span>
        <span className="shelf-empty__note">{t.fileShelf.emptyNote}</span>
      </span>
    </div>
  );
}
