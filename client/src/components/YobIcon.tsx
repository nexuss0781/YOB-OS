import { Globe2 } from "lucide-react";
import { useState } from "react";

const DEFAULT_APP_ICON = "browser";

export function YobIcon({
  value,
  size = "md",
}: {
  value: string;
  size?: "sm" | "md" | "lg";
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const sizeClass =
    size === "sm"
      ? "size-10 text-lg"
      : size === "lg"
        ? "size-20 text-4xl"
        : "size-14 text-2xl";
  const imageSource = isImageIcon(value) && !imageFailed ? value : null;

  return (
    <span
      className={`yob-icon ${sizeClass} overflow-hidden`}
      aria-hidden="true"
    >
      {imageSource ? (
        <img
          src={imageSource}
          alt=""
          className="size-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : value === DEFAULT_APP_ICON || imageFailed ? (
        <Globe2 className="size-1/2 text-cyan-100" strokeWidth={1.8} />
      ) : (
        value
      )}
    </span>
  );
}

function isImageIcon(value: string) {
  return /^https?:\/\//i.test(value) || /^data:image\//i.test(value);
}
