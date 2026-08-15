export function YobIcon({
  value,
  size = "md",
}: {
  value: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "sm"
      ? "size-10 text-lg"
      : size === "lg"
        ? "size-20 text-4xl"
        : "size-14 text-2xl";
  return (
    <span className={`yob-icon ${sizeClass}`} aria-hidden="true">
      {value}
    </span>
  );
}
