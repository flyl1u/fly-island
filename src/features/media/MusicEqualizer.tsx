import "./MusicEqualizer.css";

/**
 * Four small bars that bounce while music plays and settle low when it stops, in the song's
 * accent: the "now playing" mark at the top right of the music page. Pure CSS, so it costs no
 * renders while a song plays.
 */
export function MusicEqualizer({ playing }: { playing: boolean }) {
  return (
    <span className={`music-equalizer${playing ? " music-equalizer--playing" : ""}`} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}
