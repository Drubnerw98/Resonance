export function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "relative -mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors " +
        (active
          ? "border-emerald-500 text-white"
          : "border-transparent text-neutral-400 hover:text-neutral-200")
      }
    >
      {label}
      <span
        className={
          "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium " +
          (active
            ? "bg-emerald-950/40 text-emerald-300"
            : "bg-neutral-800 text-neutral-400")
        }
      >
        {count}
      </span>
    </button>
  );
}
