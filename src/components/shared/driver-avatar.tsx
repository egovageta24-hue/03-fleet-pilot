import { cn } from "@/lib/utils";

// Deterministic, local avatars: initials on a hashed gradient. No external image service,
// stable per name, and a real photo URL can replace it later via `src`.
const GRADIENTS = [
  "from-indigo-500 to-violet-500",
  "from-sky-500 to-indigo-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-cyan-500 to-sky-500",
  "from-violet-500 to-fuchsia-500",
  "from-lime-500 to-emerald-500",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

const SIZES = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
  xl: "size-20 text-2xl",
} as const;

type Props = { name: string; src?: string | null; size?: keyof typeof SIZES; className?: string };

export function DriverAvatar({ name, src, size = "md", className }: Props) {
  const base = cn(
    "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold text-white ring-2 ring-white",
    SIZES[size],
    className,
  );
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- tiny avatar, remote host unknown
    return <img src={src} alt={name} className={cn(base, "object-cover")} />;
  }
  return (
    <span role="img" aria-label={name} className={cn(base, "bg-gradient-to-br", GRADIENTS[hash(name) % GRADIENTS.length])}>
      {initials(name)}
    </span>
  );
}
