import { ChipList, Section } from "./primitives.tsx";

export function ChipListEditor({
  title,
  hint,
  placeholder,
  items,
  onChange,
}: {
  title: string;
  hint: string;
  placeholder: string;
  items: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <Section title={title} hint={hint}>
      <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
        <ChipList
          items={items}
          placeholder={placeholder}
          onChange={onChange}
          tone="rose"
        />
      </div>
    </Section>
  );
}
