// The one place the visual look is chosen. Everything that decides how the
// page looks (every colour, lighting rule and drawing primitive) lives under
// src/look/<LOOK>/; nothing else in the page names a colour, a font or a glow.
//
// The three directions considered (2026-10-18):
//   A  Lantern (chosen) - a dark moody shed, jars glowing from within, soft
//      gradients, bloom, light spilling onto the table, monospace labels.
//   B  Toybox - bright isometric three-quarter view, flat-shaded faceted
//      low-poly shapes with three-tone shading, saturated pastels, chunky
//      grotesk labels.
//   C  Pixel - a cosy pixel-art diorama, a limited palette, nearest-neighbour
//      upscaled chunky pixels, sprite-like animation.
//
// A look must export: PALETTE, CSS_VARS, tint(sample), skyGradient, glow,
// bloom, spill, vignette, plank, glassBody, glassHighlights, lid, label, text,
// forecastCard, weatherIcon, droplet
// (test/look.test.js checks the list). To switch looks, add src/look/<name>/
// and change the constant and the export line below - nothing else.
export const LOOK = 'lantern';
export * from './lantern/index.js';
