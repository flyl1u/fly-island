import { useTranslation } from "../../i18n";
import { PixelCatSprite } from "./PixelCatSprite";
import { resolveEdgePetMood } from "./petState";
import { useEdgePetSettings } from "./storage";
import "./EdgePet.css";

type EdgePetProps = {
  isTucked: boolean;
  activeAgentCount: number;
  hasMessagePreview: boolean;
  songPlaying: boolean;
  quiet: boolean;
  onReveal: () => void;
};

/**
 * Pixel-art companion crawling along the top-edge hot zone while the island is tucked.
 */
export function EdgePet({
  isTucked,
  activeAgentCount,
  hasMessagePreview,
  songPlaying,
  quiet,
  onReveal,
}: EdgePetProps) {
  const t = useTranslation();
  const [petSettings] = useEdgePetSettings();

  if (!isTucked || !petSettings.enabled) return null;

  const mood = resolveEdgePetMood({
    activeAgentCount,
    hasMessagePreview,
    songPlaying,
    quiet,
  });

  if (mood === "hidden") return null;

  return (
    <button
      type="button"
      className={`edge-pet edge-pet--${mood}`}
      aria-label={t.edgePet.revealLabel}
      title={t.edgePet.revealLabel}
      onMouseEnter={onReveal}
      onClick={onReveal}
    >
      <span className="edge-pet__track" aria-hidden="true">
        <span className="edge-pet__walker">
          <PixelCatSprite mood={mood} />
        </span>
      </span>
    </button>
  );
}
