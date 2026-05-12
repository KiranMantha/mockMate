export function Icon({ name, size = 16, color = 'currentColor' }: { name: string; size?: number; color?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      style={`color: ${color};`}
      overflow="visible"
    >
      <use xlinkHref={`#${name}`} fill={color}></use>
    </svg>
  );
}
