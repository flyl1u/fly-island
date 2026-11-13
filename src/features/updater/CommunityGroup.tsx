import { useId, useState } from "react";
import { ChevronDown, UsersRound } from "lucide-react";
import { useTranslation } from "../../i18n";
import { COMMUNITY_GROUP_QR_URL } from "./projectLinks";
import { useCommunityInvite } from "./useCommunityInvite";
import "./SupportAuthor.css";

/**
 * Settings → About → the community group: opens the WeChat group's code in place, as tipping the
 * author does. The code expires every week, so it is loaded from the website (replaced there)
 * rather than bundled, and asked for afresh each time the row opens.
 */
export function CommunityGroup() {
  const text = useTranslation().settings.project;
  const { pending, markSeen } = useCommunityInvite();
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const panelId = useId();
  const open = openedAt !== null;

  const toggle = () => {
    markSeen();
    setFailed(false);
    setOpenedAt(open ? null : Date.now());
  };

  return (
    <div className={`support-author community-group${open ? " support-author--open" : ""}`}>
      <button className="support-author__toggle" type="button" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
        <UsersRound className="project-link__icon community-group__icon" size={18} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
        <span className="project-link__copy">
          <strong>
            {text.community}
            {pending && <span className="community-group__dot" role="img" aria-label={text.communityNew} />}
          </strong>
          <span>{text.communityHint}</span>
        </span>
        <ChevronDown className="project-link__arrow support-author__chevron" size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="support-author__panel" id={panelId}>
          {failed ? (
            <p className="community-group__error" role="alert">{text.communityLoadFailed}</p>
          ) : (
            <>
              <figure className="support-author__code community-group__code">
                <img src={`${COMMUNITY_GROUP_QR_URL}?t=${openedAt}`} alt={text.communityCodeAlt} width={220} draggable={false} onError={() => setFailed(true)} />
              </figure>
              <p className="support-author__thanks">{text.communityScan}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
