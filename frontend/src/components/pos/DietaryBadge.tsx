// Tag config: known tags get colours, unknown tags get a neutral style
const TAG_CONFIG: Record<string, { color: string; bg: string; dot: string }> = {
  // Food / dietary
  veg:           { color: 'text-green-700',   bg: 'bg-green-100',   dot: 'bg-green-600' },
  vegan:         { color: 'text-emerald-700', bg: 'bg-emerald-100', dot: 'bg-emerald-600' },
  egg:           { color: 'text-yellow-700',  bg: 'bg-yellow-100',  dot: 'bg-yellow-500' },
  non_veg:       { color: 'text-red-700',     bg: 'bg-red-100',     dot: 'bg-red-600' },
  spicy:         { color: 'text-orange-700',  bg: 'bg-orange-100',  dot: 'bg-orange-500' },
  contains_nuts: { color: 'text-amber-700',   bg: 'bg-amber-100',   dot: 'bg-amber-500' },
  gluten_free:   { color: 'text-blue-700',    bg: 'bg-blue-100',    dot: 'bg-blue-500' },
  dairy_free:    { color: 'text-sky-700',     bg: 'bg-sky-100',     dot: 'bg-sky-500' },
  // Retail / salon
  new_arrival:    { color: 'text-violet-700', bg: 'bg-violet-100',  dot: 'bg-violet-500' },
  bestseller:     { color: 'text-pink-700',   bg: 'bg-pink-100',    dot: 'bg-pink-500' },
  organic:        { color: 'text-lime-700',   bg: 'bg-lime-100',    dot: 'bg-lime-600' },
  fragrance_free: { color: 'text-teal-700',   bg: 'bg-teal-100',    dot: 'bg-teal-500' },
  limited:        { color: 'text-rose-700',   bg: 'bg-rose-100',    dot: 'bg-rose-500' },
};

export function tagLabel(tag: string): string {
  const map: Record<string, string> = {
    veg: 'Veg', vegan: 'Vegan', egg: 'Egg', non_veg: 'Non-Veg',
    spicy: 'Spicy', contains_nuts: 'Contains Nuts', gluten_free: 'Gluten-Free',
    dairy_free: 'Dairy-Free', new_arrival: 'New Arrival', bestseller: 'Bestseller',
    organic: 'Organic', fragrance_free: 'Fragrance-Free', limited: 'Limited',
  };
  return map[tag] ?? tag.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// First tag's bg colour for card background tinting
export function firstTagBg(tags: string[] | null | undefined): string {
  if (!tags?.length) return 'bg-gray-100';
  return TAG_CONFIG[tags[0]]?.bg ?? 'bg-gray-100';
}

export default function TagBadge({ tag }: { tag: string }) {
  const cfg = TAG_CONFIG[tag] ?? { color: 'text-gray-600', bg: 'bg-gray-100', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${cfg.color} ${cfg.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {tagLabel(tag)}
    </span>
  );
}
