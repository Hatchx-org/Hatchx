export const defaultClubAppearance = { background: "#f0ebe5", accent: "#97b4de" } as const;

export function isHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function rgb(value: string) {
  if (!isHexColor(value)) return null;
  return [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
}

export function foregroundForGradient(start: string, end: string) {
  const first = rgb(start) ?? rgb(defaultClubAppearance.background)!;
  const second = rgb(end) ?? first;
  const [red, green, blue] = first.map((channel, index) => (channel + second[index]) / 2);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.56 ? "#2a2829" : "#ffffff";
}
