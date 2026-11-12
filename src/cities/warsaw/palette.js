// Warsaw's own colours: the only file in this city's folder allowed colour
// literals. [r, g, b] arrays, mixed by the scene. The skyline seen from the
// Praga bank: glass rim-lit by day around a sandstone Palace, everything
// floodlit and glowing by night, the Swietokrzyski Bridge in front.
export const WARSAW = {
  // silhouettes and their rim light: day, dusk, night
  silhouetteDay: [104, 112, 124],
  silhouetteDusk: [40, 36, 62],
  silhouetteNight: [10, 13, 24],
  rimDay: [236, 244, 255],
  rimDusk: [255, 176, 120],
  rimNight: [120, 140, 190],
  backWindow: [255, 220, 170],
  // Varso's crown and needle light
  crownTop: [150, 230, 255],
  crownBase: [60, 160, 230],
  crownGlow: [110, 210, 255],
  mastLit: [170, 205, 245], // the needle's own faint light at night
  aviation: [255, 70, 60],
  aviationGlow: [255, 60, 50],
  // the Spire's edge, Zlota's sail, the supporting towers' floors
  spireEdge: [235, 245, 255],
  sailStreak: [255, 236, 200],
  floorBand: [190, 210, 240],
  // the Palace of Culture and Science, floodlit
  floodTop: [255, 188, 96],
  floodMid: [246, 150, 86],
  floodFoot: [150, 96, 150],
  floodGlow: [255, 170, 90],
  palaceJoint: [70, 30, 20],
  clockFace: [255, 244, 214],
  clockGlow: [255, 230, 170],
  // the Palace by day: sandstone, its shade side and its ribs; the brass needle
  stoneDay: [214, 190, 152],
  stoneDusk: [150, 112, 112],
  stoneShade: [150, 122, 92],
  stoneRib: [140, 112, 84],
  needleDay: [222, 180, 84],
  needleNight: [196, 148, 78],
  needleGlint: [255, 248, 220],
  // the flag floodlight on 3 May and 11 November
  flagWhite: [255, 250, 244],
  flagRed: [226, 40, 50],
  // the low city in front of the towers: plaster, brick, sandstone and concrete
  // façades by day, each block picking one; its windows; the blocks behind
  facades: [
    [184, 168, 142], // pale plaster
    [148, 100, 82], // brick
    [136, 134, 128], // concrete
    [200, 184, 150], // sandstone
    [112, 108, 102], // dark concrete
    [172, 138, 104], // ochre
    [160, 150, 138], // grey plaster
  ],
  facadeWindow: [60, 62, 70],
  backBlockDay: [128, 124, 118],
  carpetDay: [74, 86, 108],
  carpetDusk: [46, 40, 64],
  carpetNight: [14, 16, 28],
  // the far bank's boulevard and its lamps
  boulevardDay: [188, 178, 158],
  boulevardNight: [46, 42, 52],
  quayLamp: [255, 214, 140],
  // the near (Praga) bank: forest only, its canopy following Warsaw's seasons
  // (each season a range the canopy drifts through along the bank; summer drifts around the original green)
  canopy: {
    spring: [[110, 166, 78], [150, 196, 100]],
    summer: [[52, 84, 56], [64, 98, 62]],
    autumn: [[184, 140, 64], [170, 108, 50], [142, 80, 42], [112, 74, 48]],
    winter: [[118, 106, 98], [146, 128, 118]],
  },
  twig: [76, 66, 60],
  treeDay: [52, 84, 56],
  treeDusk: [30, 40, 40],
  treeNight: [8, 12, 14],
  // the Swietokrzyski Bridge
  pylonDay: [236, 236, 230],
  pylonNight: [74, 76, 94],
  cableDay: [198, 202, 206],
  cableNight: [96, 98, 120],
  deckDay: [92, 96, 104],
  deckNight: [26, 24, 34],
  deckLamp: [255, 214, 140],
  pylonLight: [255, 50, 40],
  headlight: [255, 248, 226],
  taillight: [255, 64, 52],
  // the river and what it reflects
  riverDay: [70, 98, 132],
  riverNight: [30, 30, 60],
  riverDeep: [12, 22, 50],
  reflectPalace: [255, 180, 96],
  reflectVarso: [120, 214, 255],
  reflectSpire: [235, 245, 255],
  reflectZlota: [255, 230, 190],
  reflectDayPalace: [240, 214, 166],
  reflectDayVarso: [200, 212, 226],
  reflectDayZlota: [210, 220, 232],
  reflectDaySpire: [214, 224, 236],
  // the quay, the plinth and the Mermaid
  quayDay: [56, 66, 84],
  quayNight: [30, 26, 40],
  quayDeep: [6, 8, 14],
  plinthDay: [36, 36, 48],
  plinthNight: [16, 18, 26],
  plinthCapDay: [110, 124, 146],
  plinthCapNight: [70, 82, 102],
  mermaidDay: [50, 60, 80],
  mermaidNight: [8, 10, 18],
  mermaidRim: [255, 180, 96],
  mermaidBronze: [150, 112, 64],
  mermaidShield: [214, 176, 112],
  mermaidSunlit: [244, 214, 150],
  // weather
  snowCap: [236, 242, 250],
  dull: [120, 130, 138],
  iceFloe: [233, 239, 244],
  iceShadow: [120, 140, 160],
  iceWater: [96, 112, 128],
  // ---- the look-and-feel pass (2026-11-12) ----
  // glass by day: the sky it mirrors goes to this grey under a heavy sky; floor lines; the sun's glint
  glassDull: [150, 158, 166],
  glassLine: [44, 54, 72],
  glassShade: [58, 66, 86],
  glassGlint: [255, 252, 238],
  // golden hour: the sandstone warms, the glass catches orange on the sun's side, the low city blushes
  stoneGolden: [246, 190, 122],
  stoneGoldenShade: [150, 104, 100],
  glassGolden: [255, 168, 96],
  cityGolden: [255, 176, 120],
  // the Palace's one clock: a small warm face, never white
  clockDay: [226, 206, 168],
  clockNight: [214, 160, 92],
  // the river: the sun's glitter path, its warm twin at golden hour, the moon's track
  sunGlitter: [255, 250, 226],
  sunGolden: [255, 186, 110],
  moonTrack: [206, 218, 244],
  // the near bank: a strip of pale river beach, light on the crowns, the path lamps among the trees
  beachDay: [216, 202, 168],
  beachDusk: [120, 104, 110],
  beachNight: [34, 34, 46],
  leafLight: [236, 240, 190],
  leafGolden: [255, 196, 120],
  leafShade: [22, 24, 14], // a dark olive: it deepens a green or a rust without turning it blue
  winterGround: [104, 94, 88],
  pathLamp: [255, 196, 120],
  pathPost: [40, 40, 46],
  // the bridge by day: a grey pylon with a light and a shade side, the railing, the traffic
  pylonLit: [204, 206, 204],
  pylonShade: [136, 142, 152],
  pylonGolden: [255, 206, 160],
  deckEdge: [150, 154, 160],
  railing: [176, 180, 186],
  cars: [[150, 58, 52], [232, 232, 226], [60, 84, 130], [40, 44, 52], [150, 156, 160], [196, 176, 104]],
  bus: [206, 184, 104],
  busStripe: [140, 72, 62], // duller than a tail light, so the day's deck never reads as lit
  // life: the boat on the river, birds, steam off the roofs in a hard frost
  boatHull: [236, 232, 220],
  boatDeck: [164, 60, 52],
  boatWake: [214, 226, 240],
  bird: [44, 50, 64],
  steam: [240, 242, 246],
  steamNight: [84, 90, 116],
  // the calendar: New Year fireworks, the Christmas tree at the Palace's foot
  fireworks: [[255, 214, 120], [255, 110, 96], [140, 220, 255], [196, 255, 170], [255, 150, 230], [255, 244, 220]],
  fir: [30, 78, 54],
  firNight: [12, 34, 30],
  firLights: [[255, 210, 116], [255, 96, 84], [120, 200, 255], [255, 246, 222]],
  firStar: [255, 236, 170],
};
