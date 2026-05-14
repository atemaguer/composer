import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode
} from "react";
import {
  Archive,
  ArrowLeft,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  CircleGauge,
  Code2,
  FileTerminal,
  FolderGit2,
  GitBranch,
  Laptop,
  Monitor,
  Moon,
  MousePointer2,
  PanelTop,
  Settings,
  ShieldCheck,
  Sun,
  UserRound,
  Workflow
} from "lucide-react";

import { cn } from "../lib/cn";
import {
  clampCodeFontSize,
  clampUiFontSize,
  maxCodeFontSize,
  maxThemeContrast,
  maxUiFontSize,
  minCodeFontSize,
  minThemeContrast,
  minUiFontSize,
  useAppearanceStore
} from "../state/appearance-store";
import {
  builtInThemeMap,
  builtInThemes,
  resolveAppearanceTheme,
  type AppearanceSettings,
  type EditableThemeFields,
  type ThemeMode,
  type ThemePresetId,
  type ThemeScheme
} from "../theme";
import {
  appActiveSurface,
  appHoverSurface,
  cardSurface,
  focusRing,
  pillButton,
  secondaryButton,
  subtleCardSurface
} from "./style-tokens";
import { NumberField } from "./ui/number-field";
import { Select } from "./ui/select";
import { Slider } from "./ui/slider";
import { Switch as UiSwitch } from "./ui/switch";
import { TooltipButton } from "./ui/tooltip-button";

type SettingsPageProps = {
  className?: string;
  onBack: () => void;
};

type SettingsSectionKey =
  | "General"
  | "Appearance"
  | "Configuration"
  | "Personalization"
  | "MCP servers"
  | "Git"
  | "Environments"
  | "Worktrees"
  | "Browser use"
  | "Computer use"
  | "Archived chats"
  | "Usage";

type SettingsNavItem = {
  icon: ElementType;
  label: SettingsSectionKey;
};

const settingsNav: SettingsNavItem[] = [
  { icon: Settings, label: "General" },
  { icon: Sun, label: "Appearance" },
  { icon: ShieldCheck, label: "Configuration" },
  { icon: UserRound, label: "Personalization" },
  { icon: Workflow, label: "MCP servers" },
  { icon: GitBranch, label: "Git" },
  { icon: Laptop, label: "Environments" },
  { icon: FolderGit2, label: "Worktrees" },
  { icon: PanelTop, label: "Browser use" },
  { icon: MousePointer2, label: "Computer use" },
  { icon: Archive, label: "Archived chats" },
  { icon: CircleGauge, label: "Usage" }
];

const themeModeOptions: Array<{
  value: ThemeMode;
  label: string;
  icon: ElementType;
}> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor }
];

export function SettingsPage({ className, onBack }: SettingsPageProps) {
  const [activeSection, setActiveSection] =
    useState<SettingsSectionKey>("General");

  return (
    <section
      className={cn(
        "grid h-full min-h-0 w-full grid-cols-[280px_minmax(0,1fr)] overflow-hidden bg-app-shell text-app-text max-[780px]:grid-cols-1",
        className
      )}
      aria-label="Settings"
    >
      <aside className="min-h-0 border-r border-app-line bg-app-sidebar/88 max-[780px]:hidden">
        <div className="thin-scrollbar flex h-full flex-col overflow-y-auto px-2.5 pb-5 pt-[58px]">
          <TooltipButton
            className={cn(
              "mb-5 h-9 w-fit gap-2 px-2.5 text-[15px] text-app-dim hover:text-app-muted",
              pillButton
            )}
            tooltip="Back to app"
            onClick={onBack}
          >
            <ArrowLeft size={14} />
            <span>Back to app</span>
          </TooltipButton>

          <nav className="grid gap-1" aria-label="Settings sections">
            {settingsNav.map((item) => (
              <SettingsNavButton
                key={item.label}
                {...item}
                active={activeSection === item.label}
                onClick={() => setActiveSection(item.label)}
              />
            ))}
          </nav>
        </div>
      </aside>

      <div className="thin-scrollbar min-h-0 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-[760px] gap-10 px-8 pb-20 pt-[82px] max-[780px]:px-5 max-[780px]:pt-6">
          <TooltipButton
            className={cn(
              "hidden h-9 w-fit gap-2 px-2.5 text-[15px] text-app-muted max-[780px]:inline-flex",
              pillButton
            )}
            tooltip="Back to app"
            onClick={onBack}
          >
            <ArrowLeft size={14} />
            <span>Back to app</span>
          </TooltipButton>

          <h1 className="text-[24px] font-semibold leading-none text-app-text">
            {activeSection}
          </h1>

          {activeSection === "General" ? (
            <GeneralSettings />
          ) : activeSection === "Appearance" ? (
            <AppearanceSettingsPanel />
          ) : (
            <PlaceholderSettings title={activeSection} />
          )}
        </div>
      </div>
    </section>
  );
}

function SettingsNavButton({
  icon: Icon,
  label,
  active,
  onClick
}: SettingsNavItem & {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <TooltipButton
      className={cn(
        "grid min-h-9 w-full grid-cols-[22px_minmax(0,1fr)] items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[15px] text-app-muted transition-colors",
        appHoverSurface,
        active && `${appActiveSurface} text-app-text`
      )}
      tooltip={label}
      aria-pressed={active}
      onClick={onClick}
    >
      <Icon className="text-app-muted" size={14} />
      <span className="truncate">{label}</span>
    </TooltipButton>
  );
}

function GeneralSettings() {
  return (
    <>
      <section className="grid gap-4" aria-labelledby="work-mode-heading">
        <div className="grid gap-2">
          <h2
            id="work-mode-heading"
            className="text-[15px] font-semibold text-app-muted"
          >
            Work mode
          </h2>
          <p className="text-[15px] text-app-dim">
            Choose how much technical detail Composer shows
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3.5 max-[640px]:grid-cols-1">
          <WorkModeCard
            active
            icon={FileTerminal}
            title="For coding"
            description="More technical responses and control"
          />
          <WorkModeCard
            icon={BriefcaseBusiness}
            title="For everyday work"
            description="Same power, less technical detail"
          />
        </div>
      </section>

      <SettingsSection title="Permissions">
        <SettingsRow
          title="Default permissions"
          description="By default, Composer can read and edit files in its workspace. It can ask for additional access when needed"
          trailing={<ReadOnlySwitch enabled muted />}
        />
        <SettingsRow
          title="Auto-review"
          description={
            <>
              Composer can read and edit files in its workspace. Composer
              automatically reviews requests for additional access.
              Auto-review can make mistakes.{" "}
              <span className="text-app-accent">Learn more</span> about
              elevated risks.
            </>
          }
          trailing={<ReadOnlySwitch enabled />}
        />
        <SettingsRow
          title="Full access"
          description={
            <>
              When Composer runs with full access, it can edit any file on your
              computer and run commands with network, without your approval.
              This significantly increases the risk of data loss, leaks, or
              unexpected behavior.{" "}
              <span className="text-app-accent">Learn more</span> about
              elevated risks.
            </>
          }
          trailing={<ReadOnlySwitch enabled />}
        />
      </SettingsSection>

      <SettingsSection title="General">
        <SettingsRow
          title="Default open destination"
          description="Where files and folders open by default"
          trailing={
            <SelectValue
              icon={Code2}
              value="Windsurf"
              tooltip="Change default open destination"
            />
          }
        />
        <SettingsRow
          title="Language"
          description="Language for the app UI"
          trailing={
            <SelectValue value="Auto Detect" tooltip="Change language" />
          }
        />
        <SettingsRow
          title="Show in menu bar"
          description="Keep Composer in the macOS menu bar when the main window is closed"
          trailing={<ReadOnlySwitch enabled />}
        />
        <SettingsRow
          title="Popout Window hotkey"
          description="Set a global shortcut for Popout Window. Leave unset to keep it off."
          trailing={<HotkeyValue />}
        />
        <SettingsRow
          title="Prevent sleep while running"
          description="Keep your computer awake while Composer is running a chat"
          trailing={<ReadOnlySwitch />}
        />
        <SettingsRow
          title="Require Command + enter to send long prompts"
          description="When enabled, multiline prompts require Command + enter to send"
          trailing={<ReadOnlySwitch />}
        />
      </SettingsSection>
    </>
  );
}

function AppearanceSettingsPanel() {
  const appearanceState = useAppearanceStore();
  const committedSettings = useMemo<AppearanceSettings>(
    () => ({
      mode: appearanceState.mode,
      selectedThemeByScheme: appearanceState.selectedThemeByScheme,
      overridesByScheme: appearanceState.overridesByScheme,
      translucentSidebar: appearanceState.translucentSidebar,
      contrast: appearanceState.contrast,
      uiFontFamily: appearanceState.uiFontFamily,
      codeFontFamily: appearanceState.codeFontFamily,
      uiFontSize: appearanceState.uiFontSize,
      codeFontSize: appearanceState.codeFontSize,
      fontSmoothing: appearanceState.fontSmoothing
    }),
    [
      appearanceState.mode,
      appearanceState.selectedThemeByScheme,
      appearanceState.overridesByScheme,
      appearanceState.translucentSidebar,
      appearanceState.contrast,
      appearanceState.uiFontFamily,
      appearanceState.codeFontFamily,
      appearanceState.uiFontSize,
      appearanceState.codeFontSize,
      appearanceState.fontSmoothing
    ]
  );
  const setAppearanceSettings = useAppearanceStore(
    (state) => state.setAppearanceSettings
  );
  const [draftSettings, setDraftSettings] = useState<AppearanceSettings>(() =>
    cloneAppearanceSettings(committedSettings)
  );
  const committedKey = useMemo(
    () => settingsKey(committedSettings),
    [committedSettings]
  );
  const draftKey = useMemo(() => settingsKey(draftSettings), [draftSettings]);
  const dirty = committedKey !== draftKey;
  const previewStyle = useMemo(
    () =>
      resolveAppearanceTheme(draftSettings, "dark")
        .cssVariables as CSSProperties,
    [draftSettings]
  );

  useEffect(() => {
    setDraftSettings(cloneAppearanceSettings(committedSettings));
  }, [committedKey, committedSettings]);

  const updateDraft = (
    updater: (current: AppearanceSettings) => AppearanceSettings
  ) => {
    setDraftSettings((current) => cloneAppearanceSettings(updater(current)));
  };

  const saveDraft = () => {
    const normalizedDraft = normalizeAppearanceDraft(draftSettings);
    setDraftSettings(cloneAppearanceSettings(normalizedDraft));
    setAppearanceSettings(normalizedDraft);
  };

  const discardDraft = () => {
    setDraftSettings(cloneAppearanceSettings(committedSettings));
  };

  return (
    <>
      <div
        className={cn(
          "sticky top-0 z-20 -mx-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-app-line bg-app-shell/92 px-3 py-2 backdrop-blur",
          !dirty && "hidden"
        )}
      >
        <div className="text-[13px] text-app-muted">
          Appearance changes are staged locally.
        </div>
        <div className="inline-flex items-center gap-2">
          <TooltipButton
            className={cn("h-8 px-3 text-[13px]", secondaryButton)}
            tooltip="Discard appearance changes"
            onClick={discardDraft}
          >
            Discard
          </TooltipButton>
          <TooltipButton
            className="inline-flex h-8 items-center justify-center rounded-full bg-app-accent px-3 text-[13px] font-medium text-app-bg transition-colors hover:bg-app-accent/90"
            tooltip="Save appearance changes"
            onClick={saveDraft}
          >
            Save changes
          </TooltipButton>
        </div>
      </div>

      <SettingsSection title="Theme">
        <SettingsRow
          title="Theme"
          description="Use light, dark, or match your system"
          trailing={
            <div className="inline-grid grid-cols-3 rounded-full border border-app-line bg-app-text/[0.04] p-1">
              {themeModeOptions.map((option) => {
                const Icon = option.icon;
                const active = draftSettings.mode === option.value;

                return (
                  <TooltipButton
                    key={option.value}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-app-dim transition-colors",
                      appHoverSurface,
                      active && "bg-app-text/[0.1] text-app-text"
                    )}
                    aria-pressed={active}
                    tooltip={option.label}
                    onClick={() =>
                      updateDraft((current) => ({
                        ...current,
                        mode: option.value
                      }))
                    }
                  >
                    <Icon size={14} />
                    <span>{option.label}</span>
                  </TooltipButton>
                );
              })}
            </div>
          }
        />
        <div className="border-t border-app-line p-2">
          <ThemePreview style={previewStyle} />
        </div>
      </SettingsSection>

      <ThemeSchemeSection
        scheme="light"
        title="Light theme"
        selectedThemeId={draftSettings.selectedThemeByScheme.light}
        overrides={draftSettings.overridesByScheme.light}
        onThemeChange={(themeId) =>
          updateDraft((current) => ({
            ...current,
            selectedThemeByScheme: {
              ...current.selectedThemeByScheme,
              light: themeId
            }
          }))
        }
        onColorChange={(key, value) =>
          updateDraft((current) => ({
            ...current,
            overridesByScheme: {
              ...current.overridesByScheme,
              light: {
                ...current.overridesByScheme.light,
                colors: {
                  ...current.overridesByScheme.light.colors,
                  [key]: value
                }
              }
            }
          }))
        }
      />

      <ThemeSchemeSection
        scheme="dark"
        title="Dark theme"
        selectedThemeId={draftSettings.selectedThemeByScheme.dark}
        overrides={draftSettings.overridesByScheme.dark}
        onThemeChange={(themeId) =>
          updateDraft((current) => ({
            ...current,
            selectedThemeByScheme: {
              ...current.selectedThemeByScheme,
              dark: themeId
            }
          }))
        }
        onColorChange={(key, value) =>
          updateDraft((current) => ({
            ...current,
            overridesByScheme: {
              ...current.overridesByScheme,
              dark: {
                ...current.overridesByScheme.dark,
                colors: {
                  ...current.overridesByScheme.dark.colors,
                  [key]: value
                }
              }
            }
          }))
        }
      />

      <SettingsSection title="Typography">
        <SettingsRow
          title="UI font"
          description="Font family used for Composer interface text"
          trailing={
            <TextInput
              ariaLabel="UI font family"
              value={draftSettings.uiFontFamily}
              onChange={(value) =>
                updateDraft((current) => ({
                  ...current,
                  uiFontFamily: value
                }))
              }
            />
          }
        />
        <SettingsRow
          title="Code font"
          description="Font family used for code across chats and diffs"
          trailing={
            <TextInput
              ariaLabel="Code font family"
              value={draftSettings.codeFontFamily}
              onChange={(value) =>
                updateDraft((current) => ({
                  ...current,
                  codeFontFamily: value
                }))
              }
            />
          }
        />
        <SettingsRow
          title="UI font size"
          description="Adjust the base size used for the Composer UI"
          trailing={
            <NumberField
              value={draftSettings.uiFontSize}
              onValueChange={(value) =>
                updateDraft((current) => ({
                  ...current,
                  uiFontSize: clampUiFontSize(value)
                }))
              }
              min={minUiFontSize}
              max={maxUiFontSize}
              suffix="px"
              ariaLabel="UI font size"
            />
          }
        />
        <SettingsRow
          title="Code font size"
          description="Adjust the base size used for code across chats and diffs"
          trailing={
            <NumberField
              value={draftSettings.codeFontSize}
              onValueChange={(value) =>
                updateDraft((current) => ({
                  ...current,
                  codeFontSize: clampCodeFontSize(value)
                }))
              }
              min={minCodeFontSize}
              max={maxCodeFontSize}
              suffix="px"
              ariaLabel="Code font size"
            />
          }
        />
        <SettingsRow
          title="Font smoothing"
          description="Use native macOS font anti-aliasing"
          trailing={
            <UiSwitch
              checked={draftSettings.fontSmoothing}
              onCheckedChange={(value) =>
                updateDraft((current) => ({
                  ...current,
                  fontSmoothing: value
                }))
              }
              aria-label="Toggle font smoothing"
            />
          }
        />
      </SettingsSection>

      <SettingsSection title="Window">
        <SettingsRow
          title="Translucent sidebar"
          description="Let the sidebar use the translucent theme surface"
          trailing={
            <UiSwitch
              checked={draftSettings.translucentSidebar}
              onCheckedChange={(value) =>
                updateDraft((current) => ({
                  ...current,
                  translucentSidebar: value
                }))
              }
              aria-label="Toggle translucent sidebar"
            />
          }
        />
        <SettingsRow
          title="Contrast"
          description="Increase border and hover definition across surfaces"
          trailing={
            <span className="inline-flex items-center gap-3">
              <Slider
                value={draftSettings.contrast}
                onValueChange={(value) =>
                  updateDraft((current) => ({
                    ...current,
                    contrast: value
                  }))
                }
                min={minThemeContrast}
                max={maxThemeContrast}
                step={1}
                ariaLabel="Theme contrast"
              />
              <span className="w-7 text-right text-[13px] text-app-muted">
                {draftSettings.contrast}
              </span>
            </span>
          }
        />
      </SettingsSection>
    </>
  );
}

function ThemeSchemeSection({
  scheme,
  title,
  selectedThemeId,
  overrides,
  onThemeChange,
  onColorChange
}: {
  scheme: ThemeScheme;
  title: string;
  selectedThemeId: ThemePresetId;
  overrides: EditableThemeFields;
  onThemeChange: (themeId: ThemePresetId) => void;
  onColorChange: (
    key: "appBlue" | "appBg" | "appText",
    value: string
  ) => void;
}) {
  const theme = builtInThemeMap[selectedThemeId];
  const themeOptions = useMemo(
    () =>
      builtInThemes
        .filter((item) => item.scheme === scheme)
        .map((item) => ({
          value: item.id,
          label: item.name
        })),
    [scheme]
  );
  const accent = overrides.colors?.appBlue ?? theme.colors.appBlue;
  const background = overrides.colors?.appBg ?? theme.colors.appBg;
  const foreground = overrides.colors?.appText ?? theme.colors.appText;

  return (
    <SettingsSection title={title}>
      <SettingsRow
        title="Preset"
        description={`Choose the base ${scheme} palette`}
        trailing={
          <Select
            value={selectedThemeId}
            onValueChange={onThemeChange}
            options={themeOptions}
            ariaLabel={`${title} preset`}
          />
        }
      />
      <SettingsRow
        title="Accent"
        trailing={
          <ColorInput
            ariaLabel={`${title} accent`}
            value={accent}
            onChange={(value) => onColorChange("appBlue", value)}
          />
        }
      />
      <SettingsRow
        title="Background"
        trailing={
          <ColorInput
            ariaLabel={`${title} background`}
            value={background}
            onChange={(value) => onColorChange("appBg", value)}
          />
        }
      />
      <SettingsRow
        title="Foreground"
        trailing={
          <ColorInput
            ariaLabel={`${title} foreground`}
            value={foreground}
            onChange={(value) => onColorChange("appText", value)}
          />
        }
      />
    </SettingsSection>
  );
}

function ThemePreview({ style }: { style: CSSProperties }) {
  return (
    <div
      className="grid overflow-hidden rounded-xl border border-app-line bg-app-bg font-mono text-[12px] leading-6"
      style={style}
    >
      <div className="grid grid-cols-2 border-b border-app-line">
        <PreviewCode tone="remove" />
        <PreviewCode tone="add" />
      </div>
      <div className="grid grid-cols-[160px_minmax(0,1fr)] max-[620px]:grid-cols-1">
        <div className="bg-app-sidebar p-3 text-app-muted">
          <div className="mb-2 h-6 rounded-md bg-app-text/[0.08]" />
          <div className="h-6 rounded-md bg-app-text/[0.04]" />
        </div>
        <div className="grid gap-2 bg-app-shell p-3">
          <div className="h-7 rounded-md border border-app-line bg-app-panel" />
          <div className="h-16 rounded-md border border-app-line bg-app-panel-2" />
        </div>
      </div>
    </div>
  );
}

function PreviewCode({ tone }: { tone: "add" | "remove" }) {
  return (
    <div
      className={cn(
        "grid grid-cols-[34px_minmax(0,1fr)] px-3 py-2",
        tone === "add"
          ? "bg-app-success/12 text-app-success"
          : "bg-app-danger/12 text-app-danger"
      )}
    >
      <span>{tone === "add" ? "+" : "-"}</span>
      <span className="truncate text-app-text">
        const themePreview = "{tone}";
      </span>
    </div>
  );
}

function PlaceholderSettings({ title }: { title: string }) {
  return (
    <div className={cn("grid min-h-[220px] place-items-center p-6", cardSurface)}>
      <div className="text-center text-[14px] text-app-dim">
        {title} settings are not configured in this preview.
      </div>
    </div>
  );
}

function WorkModeCard({
  icon: Icon,
  title,
  description,
  active
}: {
  icon: ElementType;
  title: string;
  description: string;
  active?: boolean;
}) {
  return (
    <TooltipButton
      className={cn(
        "grid min-h-[74px] grid-cols-[24px_minmax(0,1fr)_22px] items-center gap-3 px-4 text-left transition-colors",
        focusRing,
        subtleCardSurface,
        active ? "border-app-line-bright bg-app-text/[0.08]" : appHoverSurface
      )}
      aria-pressed={active}
      tooltip={title}
    >
      <Icon size={15} className="text-app-muted" />
      <span className="grid gap-1">
        <span className="text-[14px] font-medium text-app-text">{title}</span>
        <span className="text-[13px] leading-5 text-app-dim">
          {description}
        </span>
      </span>
      <span
        className={cn(
          "flex h-[19px] w-[19px] items-center justify-center rounded-full border",
          active ? "border-app-accent bg-app-accent" : "border-app-line-strong"
        )}
      >
        {active && <Check size={11} className="text-app-bg" />}
      </span>
    </TooltipButton>
  );
}

function SettingsSection({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-5" aria-labelledby={`${title}-settings`}>
      <h2
        id={`${title}-settings`}
        className="text-[16px] font-semibold text-app-muted"
      >
        {title}
      </h2>
      <div className={cn("overflow-hidden", cardSurface)}>{children}</div>
    </section>
  );
}

function SettingsRow({
  title,
  description,
  trailing
}: {
  title: string;
  description?: ReactNode;
  trailing: ReactNode;
}) {
  return (
    <div className="grid min-h-[74px] grid-cols-[minmax(0,1fr)_auto] items-center gap-5 border-b border-app-line px-4 py-3 last:border-b-0 max-[640px]:grid-cols-1">
      <span className="grid min-w-0 gap-1.5">
        <span className="text-[14px] font-medium text-app-text">{title}</span>
        {description && (
          <span className="max-w-[560px] text-[13.5px] leading-5 text-app-dim">
            {description}
          </span>
        )}
      </span>
      <span className="justify-self-end max-[640px]:justify-self-start">
        {trailing}
      </span>
    </div>
  );
}

function SelectValue({
  icon: Icon,
  value,
  tooltip
}: {
  icon?: ElementType;
  value: string;
  tooltip: string;
}) {
  return (
    <TooltipButton
      className={cn(
        "h-8 min-w-[190px] justify-between gap-2 px-3 text-[14px]",
        pillButton
      )}
      tooltip={tooltip}
    >
      <span className="inline-flex min-w-0 items-center gap-2">
        {Icon && <Icon size={14} className="shrink-0 text-app-text" />}
        <span className="truncate">{value}</span>
      </span>
      <ChevronDown size={13} className="shrink-0 text-app-dim" />
    </TooltipButton>
  );
}

function HotkeyValue() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-[14px] text-app-dim">Off</span>
      <TooltipButton
        className={cn("h-8 px-3 text-[14px]", secondaryButton)}
        tooltip="Set popout window hotkey"
      >
        Set
      </TooltipButton>
    </span>
  );
}

function ReadOnlySwitch({
  enabled,
  muted
}: {
  enabled?: boolean;
  muted?: boolean;
}) {
  return (
    <span
      role="switch"
      aria-checked={Boolean(enabled)}
      className={cn(
        "relative inline-flex h-[22px] w-[38px] shrink-0 rounded-full transition-colors",
        enabled
          ? muted
            ? "bg-app-accent/70"
            : "bg-app-accent"
          : "bg-app-text/[0.12]"
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full bg-app-text shadow-[0_2px_8px_color-mix(in_srgb,var(--color-app-bg)_40%,transparent)] transition-transform",
          enabled ? "translate-x-[18px]" : "translate-x-[2px]"
        )}
      />
    </span>
  );
}

function ColorInput({
  ariaLabel,
  value,
  onChange
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const colorValue = normalizeHexColor(value);

  return (
    <label
      className={cn(
        "inline-flex h-8 min-w-[164px] items-center gap-2 rounded-lg border border-app-line bg-app-panel/70 px-2.5 text-[14px] text-app-muted",
        "focus-within:border-app-accent/60 focus-within:ring-2 focus-within:ring-app-accent/25"
      )}
    >
      <input
        type="color"
        aria-label={`${ariaLabel} color picker`}
        value={colorValue}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="h-4 w-4 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0"
      />
      <input
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        onBlur={(event) => onChange(normalizeHexColor(event.currentTarget.value))}
        className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-app-text outline-none"
      />
    </label>
  );
}

function TextInput({
  ariaLabel,
  value,
  onChange
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      className={cn(
        "h-8 min-w-[260px] rounded-lg border border-app-line bg-app-panel/70 px-3 text-[13px] text-app-text outline-none transition-colors max-[640px]:min-w-0",
        "focus:border-app-accent/60 focus:ring-2 focus:ring-app-accent/25"
      )}
    />
  );
}

function cloneAppearanceSettings(settings: AppearanceSettings): AppearanceSettings {
  return {
    mode: settings.mode,
    selectedThemeByScheme: {
      light: settings.selectedThemeByScheme.light,
      dark: settings.selectedThemeByScheme.dark
    },
    overridesByScheme: {
      light: {
        colors: settings.overridesByScheme.light.colors
          ? { ...settings.overridesByScheme.light.colors }
          : undefined,
        typography: settings.overridesByScheme.light.typography
          ? { ...settings.overridesByScheme.light.typography }
          : undefined
      },
      dark: {
        colors: settings.overridesByScheme.dark.colors
          ? { ...settings.overridesByScheme.dark.colors }
          : undefined,
        typography: settings.overridesByScheme.dark.typography
          ? { ...settings.overridesByScheme.dark.typography }
          : undefined
      }
    },
    translucentSidebar: settings.translucentSidebar,
    contrast: settings.contrast,
    uiFontFamily: settings.uiFontFamily,
    codeFontFamily: settings.codeFontFamily,
    uiFontSize: settings.uiFontSize,
    codeFontSize: settings.codeFontSize,
    fontSmoothing: settings.fontSmoothing
  };
}

function settingsKey(settings: AppearanceSettings) {
  return JSON.stringify(settings);
}

function normalizeAppearanceDraft(settings: AppearanceSettings): AppearanceSettings {
  const nextSettings = cloneAppearanceSettings(settings);

  for (const scheme of ["light", "dark"] as const) {
    const colors = nextSettings.overridesByScheme[scheme].colors;

    if (!colors) {
      continue;
    }

    for (const key of ["appBlue", "appBg", "appText"] as const) {
      if (colors[key] !== undefined) {
        colors[key] = normalizeHexColor(colors[key]);
      }
    }
  }

  return nextSettings;
}

function normalizeHexColor(value: string) {
  const trimmed = value.trim();

  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    return `#${trimmed
      .slice(1)
      .split("")
      .map((character) => `${character}${character}`)
      .join("")}`;
  }

  return "#006AFF";
}
