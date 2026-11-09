import { SelectControl } from "../../components/controls/SelectControl";
import { useTranslation } from "../../i18n";
import type { UpdateChannel } from "./storage";
import { setUpdateChannel } from "./updaterController";

/** Stable or beta: only users who pick beta are ever offered a pre-release. */
export function UpdateChannelRow({ channel, disabled }: { channel: UpdateChannel; disabled: boolean }) {
  const text = useTranslation().settings.project.update;

  return (
    <div className="update-panel__channel">
      <span className="update-panel__channel-copy">
        <strong>{text.channel}</strong>
        <small>{channel === "beta" ? text.channelBetaHint : text.channelStableHint}</small>
      </span>
      <SelectControl
        value={channel}
        options={[
          { value: "stable", label: text.channelStable },
          { value: "beta", label: text.channelBeta },
        ]}
        ariaLabel={text.channel}
        disabled={disabled}
        onChange={(next) => void setUpdateChannel(next)}
      />
    </div>
  );
}
