/** Decorative contour landscape, drawn locally without image assets. */
export function BrandTerrain() {
  return (
    <svg className="brand-terrain" viewBox="0 0 640 480" fill="none" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      {Array.from({ length: 30 }, (_, i) => (
        <path key={i} d={`M-60 ${330 + i * 8} C80 ${220 + i * 9}, 135 ${440 + i * 5}, 265 ${325 + i * 6} S430 ${175 + i * 10}, 710 ${340 + i * 6}`} className={i === 8 ? "terrain-ridge" : "terrain-contour"} />
      ))}
      {Array.from({ length: 14 }, (_, i) => (
        <path key={`cross-${i}`} d={`M${i * 48 - 100} 490 Q${i * 42 + 65} 270 ${i * 35 + 145} 250`} className="terrain-cross" />
      ))}
    </svg>
  );
}