import { ToggleControl } from "../../components/controls/ToggleControl";
import { useTranslation } from "../../i18n";

/** The on/off switch at the top of a module's settings page. */
export function ModuleSwitchSection({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const t = useTranslation();

  return (
    <section className="settings-section settings-section--module">
      <div className="settings-section__header">
        <span>{t.settings.modules.title}</span>
      </div>
      <ToggleControl label={label} checked={checked} onChange={onChange} />
      <p className="settings-section__hint">{t.settings.modules.hint}</p>
    </section>
  );
}
