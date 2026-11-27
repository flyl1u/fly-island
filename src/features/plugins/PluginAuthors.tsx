import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { PluginAuthor } from "./native/catalog";
import { cachedAuthorAvatar, githubAvatarUrl, loadAuthorAvatar } from "./authorAvatarCache";
import "./PluginAuthors.css";

/** A round avatar; offline or when it cannot load, the name's first letter on a neutral circle. */
function AuthorAvatar({ author }: { author: PluginAuthor }) {
  const source = githubAvatarUrl(author.url);
  const [loaded, setLoaded] = useState<{ source: string; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const url = source ? cachedAuthorAvatar(source) ?? (loaded?.source === source ? loaded.url : null) : null;
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    void loadAuthorAvatar(source).then((url) => {
      if (!cancelled && url) setLoaded({ source, url });
    });
    return () => { cancelled = true; };
  }, [source]);
  if (!url || failed) {
    return <span className="plugin-author__avatar plugin-author__avatar--fallback" aria-hidden="true">
      {author.name.charAt(0).toUpperCase()}
    </span>;
  }
  return <img className="plugin-author__avatar" src={url} alt="" width={20} height={20} draggable={false} onError={() => setFailed(true)} />;
}

/**
 * Keeps the authors on one line: when the names do not fit, this row shows the avatars alone.
 * It writes the class itself, measuring with the names shown, so a wider row gets them back.
 */
function useAvatarsOnlyWhenCrowded() {
  const ref = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    const row = ref.current;
    if (!row) return;
    const compact = "plugin-authors--compact";
    const fit = () => {
      row.classList.remove(compact);
      row.classList.toggle(compact, row.scrollWidth > row.clientWidth);
    };
    fit();
    // The items too: a font change widens the names without resizing the row.
    const observer = new ResizeObserver(fit);
    [row, ...row.children].forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  });
  return ref;
}

/** A plugin's authors in their listed order, each opening its page in the system browser. */
export function PluginAuthors({ authors, label }: { authors: readonly PluginAuthor[]; label: string }) {
  const row = useAvatarsOnlyWhenCrowded();
  return <ul ref={row} className="plugin-authors" aria-label={label}>
    {authors.map((author) => <li key={author.url} className="plugin-authors__item">
      <a className="plugin-author" href={author.url} title={`@${author.name}`} aria-label={`@${author.name}`}
        onClick={(event) => { event.preventDefault(); void openUrl(author.url).catch(console.error); }}>
        <AuthorAvatar author={author} />
        <span className="plugin-author__name">{author.name}</span>
      </a>
    </li>)}
  </ul>;
}
