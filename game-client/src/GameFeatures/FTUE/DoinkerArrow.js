/**
 * DoinkerArrow - Shared SVG arrow component for FTUE doinkers
 *
 * Used by both FTUEDoinker and PixiRendererDoinker to ensure consistent styling.
 */
const DoinkerArrow = ({ width, height }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 48 62"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="ftue-doinker-arrow"
  >
    {/* White outer stroke for visibility */}
    <path
      d="M13 1 L13 36 L1 36 L24 61 L47 36 L35 36 L35 1 Z"
      fill="none"
      stroke="white"
      strokeWidth="6"
    />
    {/* Arrow body */}
    <path
      d="M13 1 L13 36 L1 36 L24 61 L47 36 L35 36 L35 1 Z"
      fill="#ff1744"
      stroke="#d50000"
      strokeWidth="2"
    />
    {/* Highlight */}
    <path
      d="M15 3 L15 34 L20 34 L20 3 Z"
      fill="#ff6f60"
      opacity="0.6"
    />
  </svg>
);

export default DoinkerArrow;
