import { useState } from "react";
import type { TasteProfile } from "@resonance/shared";
import { ThemesEditor } from "./editor/ThemesEditor.tsx";
import { ArchetypesEditor } from "./editor/ArchetypesEditor.tsx";
import { NarrativePrefsEditor } from "./editor/NarrativePrefsEditor.tsx";
import { MediaAffinitiesEditor } from "./editor/MediaAffinitiesEditor.tsx";
import { ChipListEditor } from "./editor/ChipListEditor.tsx";

interface Props {
  initial: TasteProfile;
  onSave: (profile: TasteProfile) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
  error: string | null;
}

/**
 * Form for direct editing of every field on the TasteProfile. The user's
 * escape hatch when the AI gets something wrong — bad theme labels, weight
 * miscalibrations, missed dislikedTitles, etc.
 *
 * Local-only state until Save: the form mutates a working copy of the
 * profile, only PUTting on submit. Cancel discards. Validation happens on
 * the server (via TasteProfileSchema), which mirrors what the extraction
 * path uses, so anything that's valid for AI output is valid here too.
 */
export function ProfileEditor({
  initial,
  onSave,
  onCancel,
  isSaving,
  error,
}: Props) {
  const [profile, setProfile] = useState<TasteProfile>(() => clone(initial));

  function setField<K extends keyof TasteProfile>(
    key: K,
    value: TasteProfile[K],
  ) {
    setProfile((p) => ({ ...p, [key]: value }));
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3">
        <div>
          <h1 className="text-2xl font-semibold">Edit your taste DNA</h1>
          <p className="text-sm text-neutral-500">
            Anything the AI got wrong, fix it here. Saving creates a new
            profile version.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void onSave(profile)}
            disabled={isSaving}
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </header>

      {error && (
        <pre className="whitespace-pre-wrap rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
          {error}
        </pre>
      )}

      <ThemesEditor
        themes={profile.themes}
        onChange={(themes) => setField("themes", themes)}
      />
      <ArchetypesEditor
        archetypes={profile.archetypes}
        onChange={(archetypes) => setField("archetypes", archetypes)}
      />
      <NarrativePrefsEditor
        prefs={profile.narrativePrefs}
        onChange={(narrativePrefs) =>
          setField("narrativePrefs", narrativePrefs)
        }
      />
      <MediaAffinitiesEditor
        affinities={profile.mediaAffinities}
        onChange={(mediaAffinities) =>
          setField("mediaAffinities", mediaAffinities)
        }
      />
      <ChipListEditor
        title="Avoidances"
        hint="Patterns you bounce off. Describe by pattern, not specific titles."
        placeholder="e.g. generic chosen-one plots"
        items={profile.avoidances}
        onChange={(avoidances) => setField("avoidances", avoidances)}
      />
      <ChipListEditor
        title="Disliked titles"
        hint="Specific works to keep out of recommendations entirely"
        placeholder="e.g. The Name of the Wind"
        items={profile.dislikedTitles ?? []}
        onChange={(dislikedTitles) =>
          setField("dislikedTitles", dislikedTitles)
        }
      />
    </div>
  );
}

/** Deep clone the profile so the editor's local mutations don't bleed into
 * the parent's state until Save fires. structuredClone avoids manually
 * spreading every nested array. */
function clone(p: TasteProfile): TasteProfile {
  return structuredClone(p);
}
