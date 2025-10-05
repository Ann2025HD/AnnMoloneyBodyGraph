#!/usr/bin/env node
// Ephemeris → Gate.Line → channels/centers → SVG

/**************************
IMPORTS
**************************/
import { DateTime } from "luxon";
import swe from "swisseph";           // default import for CJS interop
import fs from "node:fs";
import path from "node:path";


function debugLog(...args) {
  const msg = args
    .map(a => (typeof a === "string" ? a : JSON.stringify(a, null, 2)))
    .join(" ");
  fs.appendFileSync("debug.txt", msg + "\n");
}


/**************************
ARG PARSING
**************************/
const args = Object.fromEntries(
  process.argv.slice(2).map(tok => {
    const m = tok.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [tok.replace(/^-+/, ""), true];
  })
);
const name  = args.name  || "Test";
const date  = args.date  || "";       // YYYY-MM-DD
const time  = args.time  || "12:00";  // HH:MM
const place = args.place || "";
const tz    = args.tz    || "";       // IANA tz like "Europe/Dublin"


/**************************
PATH HELPERS
**************************/
function expandHome(p) {
  if (p.startsWith("~/"))
    return path.join(process.env.HOME || process.env.USERPROFILE || "", p.slice(2));
  return p;
}

/**************************
TIME → JULIAN DAY
**************************/
function toJulianDay(dateISO, timeHHMM, zone) {
  const dt = DateTime.fromISO(`${dateISO}T${timeHHMM}`, { zone });
  if (!dt.isValid) throw new Error("Invalid date/time");
  const u = dt.toUTC();
  const ut = u.hour + u.minute/60 + u.second/3600;
  return swe.swe_julday(u.year, u.month, u.day, ut, swe.SE_GREG_CAL);
}



/**************************
SWISS EPHEMERIS HELPERS
**************************/
function calcLon(jd, planet) {
  return new Promise((resolve, reject) => {
    swe.swe_calc_ut(jd, planet, swe.SEFLG_MOSEPH, (res) => {
      if (res.error) return reject(new Error(res.error));
      resolve((res.longitude % 360 + 360) % 360);
    });
  });
}


function normDeg(d) { d %= 360; return d < 0 ? d + 360 : d; }
function angDiff(a, b) { // signed smallest difference a->b in degrees
  let d = normDeg(b) - normDeg(a);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**************************
PRENATAL/DESIGN JD FINDER (SOLAR ARC)
**************************/
async function findDesignJDBySolarArc(jdBirth, arcDeg = 88.0) {
  const sunLonBirth = await calcLon(jdBirth, swe.SE_SUN);
  const target = normDeg(sunLonBirth - arcDeg);

  const meanDegPerDay = 0.9856;
  let jd = jdBirth - (arcDeg / meanDegPerDay); // initial guess (~89 days earlier)

  for (let i = 0; i < 12; i++) {
    const lon   = await calcLon(jd, swe.SE_SUN);
    const delta = angDiff(lon, target);

    if (Math.abs(delta) < 0.01) break;               // close enough

    // always move earlier
    const stepDays = Math.abs(delta) / meanDegPerDay; // positive magnitude
    jd -= stepDays;

    if (stepDays < 1e-6) break;
    if (jd <= jdBirth - 365) break; // safety guard

  }
  return jd;
}
/**************************
PLANET LIST
**************************/
const PLANETS = [
  ["Sun",      swe.SE_SUN],
  ["Earth",    swe.SE_EARTH],
  ["Moon",     swe.SE_MOON],
  ["Mercury",  swe.SE_MERCURY],
  ["Venus",    swe.SE_VENUS],
  ["Mars",     swe.SE_MARS],
  ["Jupiter",  swe.SE_JUPITER],
  ["Saturn",   swe.SE_SATURN],
  ["Uranus",   swe.SE_URANUS],
  ["Neptune",  swe.SE_NEPTUNE],
  ["Pluto",    swe.SE_PLUTO],
];

/**************************
CHANNEL DEFINITIONS (CANONICAL 36)
**************************/
const CHANNELS_FULL = [
  { key:"1-8",   gates:[1,8],   centers:["G","Throat"] },
  { key:"2-14",  gates:[2,14],  centers:["G","Sacral"] },
  { key:"3-60",  gates:[3,60],  centers:["Sacral","Root"] },
  { key:"4-63",  gates:[4,63],  centers:["Ajna","Head"] },
  { key:"5-15",  gates:[5,15],  centers:["Sacral","G"] },
  { key:"6-59",  gates:[6,59],  centers:["SolarPlexus","Sacral"] },
  { key:"7-31",  gates:[7,31],  centers:["G","Throat"] },
  { key:"9-52",  gates:[9,52],  centers:["Sacral","Root"] },
  { key:"10-20", gates:[10,20], centers:["G","Throat"] },
  { key:"10-34", gates:[10,34], centers:["G","Sacral"] },
  { key:"10-57", gates:[10,57], centers:["G","Spleen"] },
  { key:"11-56", gates:[11,56], centers:["Ajna","Throat"] },
  { key:"12-22", gates:[12,22], centers:["SolarPlexus","Throat"] },
  { key:"13-33", gates:[13,33], centers:["G","Throat"] },
  { key:"16-48", gates:[16,48], centers:["Throat","Spleen"] },
  { key:"17-62", gates:[17,62], centers:["Ajna","Throat"] },
  { key:"18-58", gates:[18,58], centers:["Spleen","Root"] },
  { key:"19-49", gates:[19,49], centers:["Root","SolarPlexus"] },
  { key:"20-34", gates:[20,34], centers:["Throat","Sacral"] },
  { key:"20-57", gates:[20,57], centers:["Throat","Spleen"] },
  { key:"21-45", gates:[21,45], centers:["Ego","Throat"] },
  { key:"23-43", gates:[23,43], centers:["Throat","Ajna"] },
  { key:"24-61", gates:[24,61], centers:["Ajna","Head"] },
  { key:"25-51", gates:[25,51], centers:["G","Ego"] },
  { key:"26-44", gates:[26,44], centers:["Ego","Spleen"] },
  { key:"27-50", gates:[27,50], centers:["Sacral","Spleen"] },
  { key:"28-38", gates:[28,38], centers:["Spleen","Root"] },
  { key:"29-46", gates:[29,46], centers:["Sacral","G"] },
  { key:"30-41", gates:[30,41], centers:["SolarPlexus","Root"] },
  { key:"32-54", gates:[32,54], centers:["Spleen","Root"] },
  { key:"34-57", gates:[34,57], centers:["Sacral","Spleen"] }, // not classic; kept if you use it
  { key:"35-36", gates:[35,36], centers:["Throat","SolarPlexus"] },
  { key:"37-40", gates:[37,40], centers:["SolarPlexus","Ego"] },
  { key:"39-55", gates:[39,55], centers:["Root","SolarPlexus"] },
  { key:"42-53", gates:[42,53], centers:["Sacral","Root"] },
  { key:"47-64", gates:[47,64], centers:["Ajna","Head"] }
];

/**************************
ZODIAC → GATE CONSTANTS
**************************/
const DEG_PER_GATE = 360 / 64;
// Align Gate 41 ~ 302° (≈ 2° Aquarius)
const GATE_ORDER = [
  41,19,13,49,30,55,37,63,22,36,25,17,21,51,42,3,
  27,24,2,23,8,20,16,35,45,12,15,52,39,53,62,56,
  31,33,7,4,29,59,40,64,47,6,46,18,48,57,32,50,
  28,44,1,43,14,34,9,5,26,11,10,58,38,54,61,60
];

/**************************
LONGITUDE → GATE.LINE
**************************/
// ---- Mandala anchor: Gate 41 starts at 0° Aquarius (300° ecliptic lon)
const ANCHOR_LON = 302;     // degrees
const ANCHOR_GATE = 41;     // first gate at anchor

// Ensure the first gate in order is 41 by rotating your existing GATE_ORDER.
// (If GATE_ORDER already starts at 41, this is a no-op.)
function rotateOrderToAnchor(order, gate) {
  const i = order.indexOf(gate);
  return i === -1 ? order.slice() : order.slice(i).concat(order.slice(0, i));
}

// If your list is reversed relative to zodiac direction, flip this to true once and test.
const REVERSED = false;

// Build an aligned order we’ll use everywhere
const ORDER_ALIGNED = (() => {
  const base = REVERSED ? GATE_ORDER.slice().reverse() : GATE_ORDER.slice();
  return rotateOrderToAnchor(base, ANCHOR_GATE);
})(); 



function gateLineFromLongitude(lon) {
  const eps = 1e-9; // tame float edges

  // measure from the anchor (Gate 41 @ 300°)
  let delta = lon - ANCHOR_LON;
  delta = ((delta % 360) + 360) % 360; // 0..360

  // Gate index in ORDER_ALIGNED
  let fracGate = delta / DEG_PER_GATE;       // 0..64
  let gateIdx  = Math.floor(fracGate + eps); // avoid 63.999999→64
  if (gateIdx >= ORDER_ALIGNED.length) gateIdx = ORDER_ALIGNED.length - 1;

  const withinGate = delta - gateIdx * DEG_PER_GATE;

  // Line 1..6 with rollover at exact boundary
  let fracLine = (withinGate / DEG_PER_GATE) * 6; // 0..6
  let line     = Math.floor(fracLine + eps) + 1;   // 1..7
  if (line > 6) { // exactly at end of gate → next gate, line 1
    line = 1;
    gateIdx = (gateIdx + 1) % ORDER_ALIGNED.length;
  }

  const gate = ORDER_ALIGNED[gateIdx];
  return [gate ?? null, (line >= 1 && line <= 6) ? line : null];
}



/**************************
DERIVE CHANNELS & CENTERS
**************************/
function deriveDefinition(allGates) {
  const has = g => allGates.includes(g);
  const definedChannels = CHANNELS_FULL
    .filter(ch => has(ch.gates[0]) && has(ch.gates[1]))
    .map(ch => ch.key);
  const definedCenters = Array.from(new Set(
    CHANNELS_FULL.filter(ch => definedChannels.includes(ch.key)).flatMap(ch => ch.centers)
  ));
  return { definedChannels, definedCenters };
}

/**************************
INCARNATION CROSS HELPERS
**************************/
function parseGateLine(pairs, planet) {
  // pairs is like: [["Sun","46.5"], ...]
  const raw = (pairs.find(([nm]) => nm === planet) || [null, ""])[1] || "";
  const [gStr, lStr] = String(raw).split(".");
  const g = parseInt(gStr, 10);
  const l = parseInt(lStr, 10);
  return { g, l };
}

// Angle category from profile (Right/Left/Juxtaposition)
function angleFromProfile(profile) {
  if (!profile) return "Incarnation";
  const [a, b] = profile.split("/").map(n => parseInt(n, 10));
  if (a === 4 && b === 1) return "Juxtaposition";
  if (a >= 5) return "Left Angle";
  return "Right Angle";
}

/**************************
SVG BODYGRAPH (DRAW)
**************************/
function svgBodygraph({
  definedCenters = [],
  definedChannels = [],
  designGates = new Set(),
  personalityGates = new Set(),
  backgroundImage = null,
  backgroundOpacity = 0.8
} = {}) {
  /**************************
  SVG GEOMETRY & COLORS
  **************************/
  const W = 420, H = 600;
  const CX = 210; // center x
  const SIZE = {
    square: 58,  gapV: 48,
    head: 60,    ajna: 56
  };
  const COLORS = {
    bg:"#ffffff", stroke:"#555555", grid:"#d9d9d9",
    centerDefined:"#fff0b3", centerUndefined:"#ffffff",
    channelDefined:"#a97100", channelUndefined:"#FFFFFF",
    text:"#111111"
  };


  const isDefined = (name) => definedCenters.includes(name);

  // helpers
  const svg = [];
  const push = (s) => svg.push(s);
  const rect = (x, y, w, h, fill) =>
    push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${COLORS.stroke}" />`);
  const poly = (pts, fill) =>
    push(`<polygon points="${pts.map(p=>p.join(",")).join(" ")}" fill="${fill}" stroke="${COLORS.stroke}" />`);
  const line = (x1,y1,x2,y2,stroke,width=4) =>
    push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="butt" />`);
  const fill = (center) => isDefined(center) ? COLORS.centerDefined : COLORS.centerUndefined;

  /**************************
  LAYOUT CONSTANTS
  **************************/
  const GAP_THROAT_TO_G   = 64;
  const GAP_AJNA_TO_THROAT= 36;
  const GAP_G_TO_SACRAL   = 90;
  const GAP_SACRAL_TO_ROOT= 36;

  /**************************
  CENTER SHAPES
  **************************/
  // Head (triangle pointing DOWN)
  const HEAD_Y = 36;
  const HEAD = [
    [CX,               HEAD_Y],
    [CX - SIZE.head/2, HEAD_Y + SIZE.head],
    [CX + SIZE.head/2, HEAD_Y + SIZE.head]
  ];
  // Ajna (triangle pointing DOWN)
  const AJNA_Y = HEAD[1][1] + 28;
  const AJNA = [
    [CX - SIZE.ajna/2, AJNA_Y],
    [CX + SIZE.ajna/2, AJNA_Y],
    [CX,               AJNA_Y + SIZE.ajna]
  ];
  // Throat (square)
  const THROAT_Y = AJNA[2][1] + GAP_AJNA_TO_THROAT;
  const THROAT = { x: CX - SIZE.square/2, y: THROAT_Y, w: SIZE.square, h: SIZE.square };
  // G (diamond)
  const G_CY = THROAT.y + THROAT.h + GAP_THROAT_TO_G;
  const G_HALF = Math.round(SIZE.square * 0.65);
  const G = [
    [CX,         G_CY - G_HALF],
    [CX + G_HALF, G_CY],
    [CX,         G_CY + G_HALF],
    [CX - G_HALF, G_CY]
  ];
  // Sacral (square)
  const SACRAL_Y = G_CY + GAP_G_TO_SACRAL;
  const SACRAL = { x: CX - SIZE.square/2, y: SACRAL_Y, w: SIZE.square, h: SIZE.square };
  // Spleen (left triangle pointing RIGHT)
  const SIDE_GAP   = 120;
  const SIDE_BASE  = 70;
  const SIDE_HEIGHT= 70;
  const SPL_MID_Y    = SACRAL.y + SACRAL.h/2;
  const SPL_INNER_X = SACRAL.x - SIDE_GAP;
  const SPLEEN = [
   [SPL_INNER_X,                 SPL_MID_Y - SIDE_HEIGHT/2],
   [SPL_INNER_X,                 SPL_MID_Y + SIDE_HEIGHT/2],
   [SPL_INNER_X + SIDE_BASE,     SPL_MID_Y]
  ];
  // Solar Plexus (right triangle pointing LEFT)
  const SOL_INNER_X = SACRAL.x + SACRAL.w + SIDE_GAP;
  const SOLAR = [
   [SOL_INNER_X,                 SPL_MID_Y - SIDE_HEIGHT/2],
   [SOL_INNER_X,                 SPL_MID_Y + SIDE_HEIGHT/2],
   [SOL_INNER_X - SIDE_BASE,     SPL_MID_Y]
  ];
  // Ego / Will (triangle pointing UP)
  const EGO_CY   = (G_CY + SPL_MID_Y) / 2 - 30;
  const EGO_CX   = CX + G_HALF + 20;
  const EGO_H    = 35;
  const EGO_BASE = 65;
  const EGO = [
   [EGO_CX,                 EGO_CY - EGO_H/2],
   [EGO_CX - EGO_BASE/2,    EGO_CY + EGO_H/2],
   [EGO_CX + EGO_BASE/2,    EGO_CY + EGO_H/2]
  ];
  // Root (square)
  const ROOT_Y = SACRAL.y + SACRAL.h + GAP_SACRAL_TO_ROOT;
  const ROOT = { x: CX - SIZE.square/2, y: ROOT_Y, w: SIZE.square, h: SIZE.square };

  /**************************
  SVG START + OPTIONAL BACKGROUND
  **************************/
  push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  rect(0, 0, W, H, COLORS.bg);
  if (backgroundImage) {
    push(`<defs>
      <clipPath id="frameClip">
        <rect x="0" y="0" width="${W}" height="${H}" />
      </clipPath>
    </defs>`);
    const bgOpacity = typeof backgroundOpacity === "number" ? backgroundOpacity : 0.85;
    push(
      `<image href="${backgroundImage}" x="0" y="0" width="${W}" height="${H}" ` +
      `preserveAspectRatio="xMidYMid slice" opacity="${bgOpacity}" ` +
      `clip-path="url(#frameClip)" />`
    );
  }

  /**************************
  GATE ANCHORS & LABEL HELPERS
  **************************/
  // Each gate belongs to exactly one center (name)
  const GATE_TO_CENTER = {
    61:"Head", 63:"Head", 64:"Head",
    24:"Ajna", 4:"Ajna", 47:"Ajna", 17:"Ajna", 11:"Ajna", 43:"Ajna",
    62:"Throat", 23:"Throat", 56:"Throat", 16:"Throat", 20:"Throat",
    12:"Throat", 31:"Throat", 8:"Throat", 33:"Throat", 45:"Throat", 35:"Throat",
    1:"G", 2:"G", 7:"G", 10:"G", 13:"G", 15:"G", 25:"G", 46:"G",
    21:"Ego", 26:"Ego", 40:"Ego", 51:"Ego",
    6:"SolarPlexus", 12:"SolarPlexus", 22:"SolarPlexus", 30:"SolarPlexus",
    37:"SolarPlexus", 49:"SolarPlexus", 55:"SolarPlexus", 36:"SolarPlexus",
    18:"Spleen", 28:"Spleen", 32:"Spleen", 44:"Spleen", 50:"Spleen", 57:"Spleen", 48:"Spleen",
    3:"Sacral", 5:"Sacral", 9:"Sacral", 14:"Sacral", 27:"Sacral",
    29:"Sacral", 34:"Sacral", 42:"Sacral", 59:"Sacral",
    19:"Root", 39:"Root", 41:"Root", 52:"Root", 53:"Root",
    54:"Root", 58:"Root", 38:"Root", 60:"Root"
  };

  const EXCEPTION_GATES = new Set([10, 20, 34, 57]);

  const GATE_ANCHORS = {
    // Throat
    62:{center:"Throat", side:"top",    t:0.25},
    23:{center:"Throat", side:"top",    t:0.50},
    56:{center:"Throat", side:"top",    t:0.75},
    16:{center:"Throat", side:"left",   t:0.10},
    20:{center:"Throat", side:"left",   t:0.50}, // integration
    12:{center:"Throat", side:"right",  t:0.50},
    31:{center:"Throat", side:"bottom", t:0.24},
     8:{center:"Throat", side:"bottom", t:0.50},
    33:{center:"Throat", side:"bottom", t:0.76},
    45:{center:"Throat", side:"bottom", t:0.99},
    35:{center:"Throat", side:"right",  t:0.10},

    // Head
    64:{center:"Head",   side:"bottom", t:0.26},
    61:{center:"Head",   side:"bottom", t:0.50},
    63:{center:"Head",   side:"bottom", t:0.74},

    // Ajna
    47:{center:"Ajna",   side:"top",    t:0.25},
    24:{center:"Ajna",   side:"top",    t:0.50},
     4:{center:"Ajna",   side:"top",    t:0.75},
    17:{center:"Ajna",   side:"left",   t:0.50}, // slanted
    11:{center:"Ajna",   side:"right",  t:0.50},
    43:{center:"Ajna",   side:"bottom", t:0.70},

    // G
    13:{center:"G",      side:"top",    t:0.40},
     1:{center:"G",      side:"top",    t:0.01},
     7:{center:"G",      side:"left",   t:0.60},
    46:{center:"G",      side:"right",  t:0.60},
     2:{center:"G",      side:"bottom", t:0.01},
    15:{center:"G",      side:"bottom", t:0.40},
    10:{center:"G",      side:"left",   t:0.01},  // integration
    25:{center:"G",      side:"right",  t:0.25},

    // Ego
    21:{center:"Ego",    side:"top",    t:0.50},
    51:{center:"Ego",    side:"left",   t:0.60},
    26:{center:"Ego",    side:"left",   t:0.01},
    40:{center:"Ego",    side:"bottom", t:0.85},

    // Solar Plexus
    22:{center:"SolarPlexus", side:"top",    t:0.70},
    36:{center:"SolarPlexus", side:"top",    t:0.90},
     6:{center:"SolarPlexus", side:"bottom", t:0.99},
    37:{center:"SolarPlexus", side:"top",    t:0.40},
    49:{center:"SolarPlexus", side:"bottom", t:0.50},
    30:{center:"SolarPlexus", side:"bottom", t:0.10},
    55:{center:"SolarPlexus", side:"bottom", t:0.30},

    // Spleen
    48:{center:"Spleen", side:"top",    t:0.90},
    57:{center:"Spleen", side:"top",    t:0.70},  // integration
    50:{center:"Spleen", side:"top",    t:0.01},
    44:{center:"Spleen", side:"top",    t:0.35},
    32:{center:"Spleen", side:"bottom", t:0.60},
    28:{center:"Spleen", side:"bottom", t:0.40},
    18:{center:"Spleen", side:"bottom", t:0.20},

    // Sacral
    14:{center:"Sacral", side:"top",    t:0.50},
     5:{center:"Sacral", side:"top",    t:0.25},
    34:{center:"Sacral", side:"left",   t:0.30},  // integration
    27:{center:"Sacral", side:"left",   t:0.65},
    29:{center:"Sacral", side:"top",    t:0.75},
    59:{center:"Sacral", side:"right",  t:0.53},
     9:{center:"Sacral", side:"bottom", t:0.80},
     3:{center:"Sacral", side:"bottom", t:0.50},
    42:{center:"Sacral", side:"bottom", t:0.20},

    // Root
    52:{center:"Root",   side:"top",    t:0.80},
    60:{center:"Root",   side:"top",    t:0.50},
    53:{center:"Root",   side:"top",    t:0.20},
    54:{center:"Root",   side:"left",   t:0.20},
    38:{center:"Root",   side:"left",   t:0.50},
    58:{center:"Root",   side:"left",   t:0.80},
    39:{center:"Root",   side:"right",  t:0.50},
    41:{center:"Root",   side:"right",  t:0.80},
    19:{center:"Root",   side:"right",  t:0.20}
  };

  // lerp helpers scoped to this function
  const lerp  = (a, b, t) => a + (b - a) * t;
  const lerp2 = ([x1,y1], [x2,y2], t) => [ lerp(x1,x2,t), lerp(y1,y2,t) ];

  // sides/points helpers
  function rectSidePoint(R, side, t) {
    side = (side||"").toLowerCase();
    if (side === "top")    return [lerp(R.x, R.x+R.w, t), R.y];
    if (side === "bottom") return [lerp(R.x, R.x+R.w, t), R.y + R.h];
    if (side === "left")   return [R.x, lerp(R.y, R.y+R.h, t)];
    if (side === "right")  return [R.x + R.w, lerp(R.y, R.y+R.h, t)];
    return [R.x + R.w/2, R.y + R.h/2];
  }

  const G_TOP = G[0], G_RIGHT = G[1], G_BOTTOM = G[2], G_LEFT = G[3];
  function diamondSidePoint(side, t) {
    side = (side||"").toLowerCase();
    if (side === "top")    return lerp2(G_TOP,    G_RIGHT, t);
    if (side === "right")  return lerp2(G_RIGHT,  G_BOTTOM, t);
    if (side === "bottom") return lerp2(G_BOTTOM, G_LEFT, t);
    if (side === "left")   return lerp2(G_LEFT,   G_TOP, t);
    return [CX, G_CY];
  }

  const HEAD_BASE_L = HEAD[1], HEAD_BASE_R = HEAD[2], HEAD_APEX = HEAD[0];
  function headPoint(side, t) {
    side = (side||"").toLowerCase();
    if (side === "bottom") return lerp2(HEAD_BASE_L, HEAD_BASE_R, t);
    if (side === "top")    return HEAD_APEX;
    return lerp2(HEAD_BASE_L, HEAD_BASE_R, t);
  }

  const AJNA_BASE_L = AJNA[0], AJNA_BASE_R = AJNA[1], AJNA_APEX = AJNA[2];
  function ajnaPoint(side, t) {
    switch ((side||"").toLowerCase()) {
      case "top":    return lerp2(AJNA_BASE_L, AJNA_BASE_R, t);
      case "bottom": return AJNA_APEX;
      case "left":   return lerp2(AJNA_BASE_L, AJNA_APEX, t);
      case "right":  return lerp2(AJNA_BASE_R, AJNA_APEX, t);
      default:       return lerp2(AJNA_BASE_L, AJNA_BASE_R, t);
    }
  }

  function spleenPoint(side, t) {
    side = (side||"").toLowerCase();
    if (side === "right")  return lerp2(SPLEEN[0], SPLEEN[1], t);
    if (side === "top")    return lerp2(SPLEEN[2], SPLEEN[0], t);
    if (side === "bottom") return lerp2(SPLEEN[1], SPLEEN[2], t);
    return SPLEEN[0];
  }

  function solarPoint(side, t) {
    side = (side||"").toLowerCase();
    if (side === "left")   return lerp2(SOLAR[0], SOLAR[1], t);
    if (side === "top")    return lerp2(SOLAR[2], SOLAR[0], t);
    if (side === "bottom") return lerp2(SOLAR[1], SOLAR[2], t);
    return SOLAR[0];
  }

  function egoPoint(side, t) {
    side = (side||"").toLowerCase();
    const A = EGO[0], BL = EGO[1], BR = EGO[2];
    if (side === "top")    return A;
    if (side === "bottom") return lerp2(BL, BR, t);
    if (side === "left")   return lerp2(BL, A, t);
    if (side === "right")  return lerp2(BR, A, t);
    return lerp2(BL, BR, 0.5);
  }

  // Gate → [x,y]
  function anchorForGate(gate) {
    const spec = GATE_ANCHORS[gate];
    if (!spec) return [CX, G_CY];
    const { center, side, t } = spec;
    if (center === "Throat")      return rectSidePoint(THROAT, side, t);
    if (center === "Sacral")      return rectSidePoint(SACRAL, side, t);
    if (center === "Root")        return rectSidePoint(ROOT,   side, t);
    if (center === "G")           return diamondSidePoint(side, t);
    if (center === "Head")        return headPoint(side, t);
    if (center === "Ajna")        return ajnaPoint(side, t);
    if (center === "Spleen")      return spleenPoint(side, t);
    if (center === "SolarPlexus") return solarPoint(side, t);
    if (center === "Ego")         return egoPoint(side, t);
    return [CX, G_CY];
  }

  // color helper + safe segment
  function strokeForGateLocal(g) {
    if (personalityGates.has(g)) return "#222222";  // black
    if (designGates.has(g))      return "#D75442";  // red
    return null; // undefined -> draw nothing in overlay pass
  }
// keep drawSeg as-is
function drawSeg(a, b, stroke, w) {
  if (!a || !b || !stroke) return;
  line(a[0], a[1], b[0], b[1], stroke, w);
}

// allow custom caps + extra attrs (no hard-coded cap here)
function lineCustom(x1, y1, x2, y2, stroke, width = 5, cap = "round", extra = "") {
  push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
        stroke="${stroke}" stroke-width="${width}" stroke-linecap="${cap}" ${extra} />`);
}

// allow custom caps + extra attrs
function lineCustom(x1, y1, x2, y2, stroke, width = 5, cap = "butt", extra = "") {
  push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
        stroke="${stroke}" stroke-width="${width}" stroke-linecap="${cap}" ${extra} />`);
}

// one and only drawSegBoth (no duplicates!)
function drawSegBoth(a, b, w = 4) {
  const dash = 8, gap = 8;

  // 1) solid red underlay — fills entire segment (no gaps → no white)
  lineCustom(a[0], a[1], b[0], b[1], "#D75442", w, "butt");

  // 2) black dashed overlay, offset so dashes sit on top of red
  lineCustom(
    a[0], a[1], b[0], b[1],
    "#222222", Math.max(1, w - 1), "butt",
    `stroke-dasharray="${dash},${gap}" stroke-dashoffset="${dash}"`
  );
}


  /**************************
  CHANNEL NETWORK — PASS 1 (NON-EXCEPTION)
  **************************/
  // ----- PASS 1: draw all NON-exception channels (grid + split overlay)
CHANNELS_FULL.forEach(ch => {
  const [gA, gB] = ch.gates;
  if (EXCEPTION_GATES.has(gA) || EXCEPTION_GATES.has(gB)) return; // skip integration parts

  const pA = anchorForGate(gA);
  const pB = anchorForGate(gB);

  // grid (underlay)
  line(pA[0], pA[1], pB[0], pB[1], COLORS.channelUndefined, 5);

  // split overlay at geometric midpoint
  const mid = [ (pA[0] + pB[0]) / 2, (pA[1] + pB[1]) / 2 ];

  const bothA = personalityGates.has(gA) && designGates.has(gA);
  const bothB = personalityGates.has(gB) && designGates.has(gB);

  if (bothA) drawSegBoth(pA, mid, 5);
  else       drawSeg(pA,  mid, strokeForGateLocal(gA), 5);

  if (bothB) drawSegBoth(mid, pB, 5);
  else       drawSeg(mid,  pB,  strokeForGateLocal(gB), 5);
});

  /**************************
  CHANNEL NETWORK — PASS 2 (INTEGRATION 10–57–20–34)
  **************************/
  // ----- PASS 2: Integration network (10–57–20–34) with dual-color overlay when gate is in BOTH sets
const P10 = anchorForGate(10);
const P20 = anchorForGate(20);
const P34 = anchorForGate(34);
const P57 = anchorForGate(57);

// junctions along the 57→20 spine
const J34 = [
  P57[0] + (P20[0] - P57[0]) * 0.20,
  P57[1] + (P20[1] - P57[1]) * 0.20
];
const J10 = [
  P57[0] + (P20[0] - P57[0]) * 0.50,
  P57[1] + (P20[1] - P57[1]) * 0.50
];

// GRID (underlay)
line(P20[0], P20[1], P57[0], P57[1], COLORS.channelUndefined, 5);
line(P34[0], P34[1], J34[0], J34[1], COLORS.channelUndefined, 5);
line(J34[0], J34[1], P20[0], P20[1], COLORS.channelUndefined, 5);
line(P10[0], P10[1], J10[0], J10[1], COLORS.channelUndefined, 5);
line(J10[0], J10[1], P57[0], P57[1], COLORS.channelUndefined, 5);

// OVERLAYS (split by owning gate) — handle BOTH personality+design with interleaved dashes
const both34 = personalityGates.has(34) && designGates.has(34);
const both20 = personalityGates.has(20) && designGates.has(20);
const both10 = personalityGates.has(10) && designGates.has(10);
const both57 = personalityGates.has(57) && designGates.has(57);

// 34–20 halves
both34 ? drawSegBoth(P34, J34, 4) : drawSeg(P34, J34, strokeForGateLocal(34), 5);
both20 ? drawSegBoth(J34, P20, 4) : drawSeg(J34, P20, strokeForGateLocal(20), 5);

// 10–57 halves
both10 ? drawSegBoth(P10, J10, 4) : drawSeg(P10, J10, strokeForGateLocal(10), 5);
both57 ? drawSegBoth(J10, P57, 4) : drawSeg(J10, P57, strokeForGateLocal(57), 5);

// 20–57 split at midpoint
const M2057 = [ (P20[0] + P57[0]) / 2, (P20[1] + P57[1]) / 2 ];
both20 ? drawSegBoth(P20,  M2057, 4) : drawSeg(P20,  M2057, strokeForGateLocal(20), 5);
both57 ? drawSegBoth(M2057, P57,  4) : drawSeg(M2057, P57,  strokeForGateLocal(57), 5);




/**************************
  PAINT CENTERS
**************************/
const CENTER_THEME_ANN = {
  open:        "#FFFFFF", // open
  personality: "#506A81", // dark slate
  design:      "#AADBD5", // light aqua
  both:        "#506A81"  // treat "both" as personality color
};

// Determine per-center status: "open" | "personality" | "design" | "both"
function computeCenterSources(definedChannels, personalityGates, designGates) {
  const idx = Object.fromEntries(CHANNELS_FULL.map(c => [c.key, c]));
  const acc = {};
  const add = (c, s) => (acc[c] ||= new Set()).add(s);

  definedChannels.forEach(key => {
    const ch = idx[key]; if (!ch) return;
    const [g1, g2] = ch.gates;
    let src = "both";
    if (personalityGates.has(g1) && personalityGates.has(g2)) src = "personality";
    else if (designGates.has(g1) && designGates.has(g2))      src = "design";
    ch.centers.forEach(cn => add(cn, src));
  });

  const allCenters = Array.from(new Set(CHANNELS_FULL.flatMap(c => c.centers)));
  const status = {};
  allCenters.forEach(cn => {
    const set = acc[cn];
    if (!set || set.size === 0) status[cn] = "open";
    else if (set.size > 1)      status[cn] = "both";
    else                        status[cn] = [...set][0];
  });
  return status;
}

const centerStatus = computeCenterSources(definedChannels, personalityGates, designGates);
const fillFor = (name) => CENTER_THEME_ANN[centerStatus[name] || "open"] || "#FFFFFF";

// temporarily hide borders while painting centers
const __prevStroke = COLORS.stroke;
COLORS.stroke = "none";

// draw centers
poly(HEAD,  fillFor("Head"));
poly(AJNA,  fillFor("Ajna"));
rect(THROAT.x, THROAT.y, THROAT.w, THROAT.h, fillFor("Throat"));
poly(G,     fillFor("G"));
poly(EGO,   fillFor("Ego"));
poly(SPLEEN, fillFor("Spleen"));
poly(SOLAR,  fillFor("SolarPlexus"));
rect(SACRAL.x, SACRAL.y, SACRAL.w, SACRAL.h, fillFor("Sacral"));
rect(ROOT.x, ROOT.y, ROOT.w, ROOT.h, fillFor("Root"));

// restore stroke for anything drawn later
COLORS.stroke = __prevStroke;

/**************************
  GATE NUMBER LABELS
**************************/
const CENTROID = {
  Throat:      [THROAT.x + THROAT.w/2, THROAT.y + THROAT.h/2],
  Sacral:      [SACRAL.x + SACRAL.w/2, SACRAL.y + SACRAL.h/2],
  Root:        [ROOT.x   + ROOT.w/2,   ROOT.y   + ROOT.h/2],
  G:           [CX, G_CY],
  Head:        [(HEAD[0][0]+HEAD[1][0]+HEAD[2][0])/3, (HEAD[0][1]+HEAD[1][1]+HEAD[2][1])/3],
  Ajna:        [(AJNA[0][0]+AJNA[1][0]+AJNA[2][0])/3, (AJNA[0][1]+AJNA[1][1]+AJNA[2][1])/3],
  Spleen:      [(SPLEEN[0][0]+SPLEEN[1][0]+SPLEEN[2][0])/3, (SPLEEN[0][1]+SPLEEN[1][1]+SPLEEN[2][1])/3],
  SolarPlexus: [(SOLAR[0][0]+SOLAR[1][0]+SOLAR[2][0])/3,  (SOLAR[0][1]+SOLAR[1][1]+SOLAR[2][1])/3],
  Ego:         [(EGO[0][0]+EGO[1][0]+EGO[2][0])/3,        (EGO[0][1]+EGO[1][1]+EGO[2][1])/3],
};

function insetTowards(p, c, d = 10) {
  const [x, y] = p, [cx, cy] = c;
  const vx = cx - x, vy = cy - y;
  const L = Math.hypot(vx, vy) || 1;
  return [x + (vx / L) * d, y + (vy / L) * d];
}

// keep label style simple; stroke used only for white bubbles
const LABEL_STYLE = { r: 6, strokeWidth: 1 };

function drawGateNumber(gate, inset = 8) {
  const spec = GATE_ANCHORS[gate];
  if (!spec) return;

  const p = anchorForGate(gate);
  const c = CENTROID[spec.center] || [CX, H/2];
  let [tx, ty] = insetTowards(p, c, inset);

  // manual nudges (adjust as needed)
    if (gate === 47) { tx += 0;  ty += 0; }
    if (gate === 64) { tx += -6;  ty += -1; }
    if (gate === 63) { tx += +6;  ty += -1; }
 
    if (gate === 47) { tx += -6;  ty += 0; }
    if (gate === 4) { tx += +7;  ty += 0; }
    if (gate === 24) { tx += 0;  ty += -2; }
    if (gate === 43) { tx += 0;  ty += -6; }

    if (gate === 20) { tx += 0;  ty += +7; }
    if (gate === 16) { tx += +1;  ty += +9; }
    if (gate === 62) { tx += -6;  ty += 0; }
    if (gate === 56) { tx += +6;  ty += 0; }
    if (gate === 23) { tx += +1;  ty += -1; }
    if (gate === 31) { tx += -8;  ty += 0; }
    if (gate === 8)  { tx += -7;  ty += +1; }
    if (gate === 33) { tx += -5;  ty += 0; }
    if (gate === 35) { tx += -1;  ty += +9; }
    if (gate === 12) { tx += 0;   ty += +6; }
    if (gate === 45) { tx += -1;  ty += -2; }

    if (gate === 25) { tx += +2;  ty += -2; }

    if (gate === 26) { tx += +6;  ty += -3; }
    if (gate === 51) { tx += -2;  ty += -1; }
    if (gate === 21) { tx += +1;  ty +=  +1; }
    if (gate === 40) { tx += +2;  ty +=  -3; }
 
    if (gate === 34) { tx += 0;  ty += +2; }
    if (gate === 27) { tx += 0;  ty += +3; }
    if (gate === 42) { tx += -4;  ty += 0; }
    if (gate === 3)  { tx += 0;  ty += +1; }
    if (gate === 9)  { tx += +4;  ty += 0; }
    if (gate === 59) { tx += 0;  ty += 0; }
    if (gate === 52) { tx += 4;  ty += 0; }
    if (gate === 29) { tx += +5;  ty += 0; }
    if (gate === 1)  { tx += 0;  ty += 0; }
    if (gate === 5)  { tx += -5;  ty += 0; }

    if (gate === 53) { tx +=-6;  ty += 0; }
    if (gate === 60) { tx += 0;  ty += -1; }
    if (gate === 52) { tx += +2; ty += 0; }
    if (gate === 54) { tx += +1; ty += +6; }
    if (gate === 58) { tx += +1; ty += +6; }
    if (gate === 38) { tx += 0;  ty += +6; }
    if (gate === 19) { tx += -1; ty += +6; }
    if (gate === 39) { tx += 0;  ty += +6; }
    if (gate === 41) { tx += -1; ty += +6; }
 
    if (gate === 48) { tx += -2; ty += +3; }
    if (gate === 57) { tx += 0;  ty += 0; }
    if (gate === 44) { tx += 0;  ty += 0; }
    if (gate === 50) { tx += -6; ty += 0; }
    if (gate === 32) { tx += +2; ty += 0; }
    if (gate === 28) { tx += -2; ty += +2; }
    if (gate === 18) { tx += -7; ty += +3; }
   
    if (gate === 6)  { tx += +4; ty += -1; }
    if (gate === 37) { tx += -2;  ty += 0; }
    if (gate === 22) { tx += 0;  ty += 0; }
    if (gate === 36) { tx += +3;  ty += +1; }
    if (gate === 49) { tx += -4;  ty += -1; }
    if (gate === 55) { tx += 0;  ty += 0; }
    if (gate === 30) { tx += +2;  ty += +1; }


  // bubble + text colors from the *center* status
  const st = centerStatus[spec.center] || "open";
  const bubbleFill =
    st === "open"        ? "#FFFFFF" :
    st === "design"      ? "#AADBD5" :
                           "#506A81";  // personality or both

  const textFill =
    (st === "personality" || st === "both") ? "#FFFFFF" : "#000000";

  const bubbleStroke = (st === "open") ? "#DDDDDD" : "none";

  push(
    `<g class="gate-label">` +
      `<circle cx="${tx}" cy="${ty}" r="${LABEL_STYLE.r}" fill="${bubbleFill}" ` +
      `stroke="${bubbleStroke}" stroke-width="${LABEL_STYLE.strokeWidth}" />` +
      `<text x="${tx}" y="${ty}" font-family="Helvetica, Arial, sans-serif" font-size="10" ` +
      `fill="${textFill}" text-anchor="middle" dominant-baseline="middle">${gate}</text>` +
    `</g>`
  );
}

// draw all gate labels
Object.keys(GATE_ANCHORS).forEach(k => drawGateNumber(+k, 9)); // inset ~9–10px



  /**************************
  SVG END
  **************************/
  push(`</svg>`);
  return svg.join("\n");
}

/**************************
MAIN COMPUTE
**************************/
async function compute() {
  /**************************
  BACKGROUND IMAGE (OPTIONAL)
  **************************/
  const defaultBg = new URL('./images/Bodygraph-Background.png', import.meta.url).pathname;
  const bgPathArg = args.bg || defaultBg;
  let backgroundImage = null;
  try {
    const filePath = expandHome(bgPathArg);
    const buf = fs.readFileSync(filePath);
    backgroundImage = `data:image/png;base64,${buf.toString("base64")}`;
  } catch (e) {
    backgroundImage = null; // missing? skip background
  }

  /**************************
  JULIAN DAYS (PERSONALITY & DESIGN)
  **************************/
  const jdP = toJulianDay(date, time, tz);
  const jdD = await findDesignJDBySolarArc(jdP, 88.0);

  /**************************
  LONGITUDES (SUN..PLUTO)
  **************************/
  const longP = await Promise.all(PLANETS.map(([_, id]) => calcLon(jdP, id)));
  const longD = await Promise.all(PLANETS.map(([_, id]) => calcLon(jdD, id)));

  // Force Earth = Sun + 180° (geocentric)
  const idxSun   = PLANETS.findIndex(([nm]) => nm === "Sun");
  const idxEarth = PLANETS.findIndex(([nm]) => nm === "Earth");
  longP[idxEarth] = ((longP[idxSun] + 180) % 360 + 360) % 360;
  longD[idxEarth] = ((longD[idxSun] + 180) % 360 + 360) % 360;

  /**************************
  LUNAR NODES (MEAN)
  **************************/

  /**************************
  LUNAR NODES — test both mean & true
**************************/
function nodePair(jd, useTrue = false) {
  return new Promise((resolve, reject) => {
    const which = useTrue ? swe.SE_TRUE_NODE : swe.SE_MEAN_NODE;
    swe.swe_calc_ut(jd, which, swe.SEFLG_MOSEPH, (res) => {
      if (res.error) return reject(new Error(res.error));
      const north = ((res.longitude % 360) + 360) % 360;
      const south = (north + 180) % 360;
      resolve({ north, south });
    });
  });
}

const nodesMeanP  = await nodePair(jdP,  false);
const nodesMeanD  = await nodePair(jdD,  false);
const nodesTrueP  = await nodePair(jdP,  true);
const nodesTrueD  = await nodePair(jdD,  true);

// Debug: see both options mapped to gate.line
const GL = (lon) => {
  const [g,l] = gateLineFromLongitude(lon);
  return `${g}.${l}`;
};
debugLog("NODES P  mean:", {
  north: nodesMeanP.north, south: nodesMeanP.south,
  north_gl: GL(nodesMeanP.north), south_gl: GL(nodesMeanP.south)
});
debugLog("NODES P  true:", {
  north: nodesTrueP.north, south: nodesTrueP.south,
  north_gl: GL(nodesTrueP.north), south_gl: GL(nodesTrueP.south)
});
debugLog("NODES D  mean:", {
  north: nodesMeanD.north, south: nodesMeanD.south,
  north_gl: GL(nodesMeanD.north), south_gl: GL(nodesMeanD.south)
});
debugLog("NODES D  true:", {
  north: nodesTrueD.north, south: nodesTrueD.south,
  north_gl: GL(nodesTrueD.north), south_gl: GL(nodesTrueD.south)
});

// Choose which set to use (try TRUE first to match Jovian near boundaries)
const USE_TRUE_NODE = true;
const useP = USE_TRUE_NODE ? nodesTrueP : nodesMeanP;
const useD = USE_TRUE_NODE ? nodesTrueD : nodesMeanD;

const northLonP = useP.north;
const southLonP = useP.south;
const northLonD = useD.north;
const southLonD = useD.south;



  /**************************
  MAP LONGITUDES → GATE.LINE (PLANETS + NODES)
  **************************/
  const gl = (g, l) => (g && l) ? `${g}.${l}` : "—";  
  const personalityPlanets = PLANETS.map(([nm], i) => {
    const [g, l] = gateLineFromLongitude(longP[i]);
    return [nm, gl(g, l)];         // <- use gl
  });
  const designPlanets = PLANETS.map(([nm], i) => {
    const [g, l] = gateLineFromLongitude(longD[i]);
    return [nm, gl(g, l)];         // <- use gl
  });
  // keep Earth’s gate but force its line to equal Sun’s line
  function harmonizeSunEarthLines(pairs) {
    const h = Object.fromEntries(pairs);
    const sun = (h["Sun"] || "");
    const earth = (h["Earth"] || "");
    if (!sun || !earth) return;

    const sunLine = sun.split(".")[1];
    const earthGate = earth.split(".")[0];
    if (!sunLine || !earthGate) return;

    const fixedEarth = `${parseInt(earthGate, 10)}.${sunLine}`;
    for (let i = 0; i < pairs.length; i++) {
      if (pairs[i][0] === "Earth") {
        pairs[i][1] = fixedEarth;
        break;
      }
    }
  }
  harmonizeSunEarthLines(personalityPlanets);
  harmonizeSunEarthLines(designPlanets);

  // append nodes to planet lists

  const [gNP, lNP] = gateLineFromLongitude(northLonP);
debugLog("MANDALA CHECK from 300°:");
for (let k = 0; k < 6; k++) {
  const lon = ANCHOR_LON + k * DEG_PER_GATE + 1e-6;
  const [g,l] = gateLineFromLongitude(lon);
  debugLog(`lon ${lon.toFixed(3)} → ${g}.${l}`);
}
  const [gSP, lSP] = gateLineFromLongitude(southLonP);
  personalityPlanets.push(["North Node", gl(gNP, lNP)]);
  personalityPlanets.push(["South Node", gl(gSP, lSP)]);


  const [gND, lND] = gateLineFromLongitude(northLonD);
  const [gSD, lSD] = gateLineFromLongitude(southLonD);
  designPlanets.push(["North Node", gl(gND, lND)]);
  designPlanets.push(["South Node", gl(gSD, lSD)]);

  /**************************
  DEFINITION (CHANNELS/CENTERS) + PROFILE
  **************************/
  const allGates = personalityPlanets.concat(designPlanets)
                    .map(([,gl]) => parseInt(String(gl).split(".")[0],10));
  const { definedChannels, definedCenters } = deriveDefinition(allGates);

  function getLine(pairs, planet) {
    const h = Object.fromEntries(pairs);
    const v = h[planet]; if (!v) return null;
    const parts = String(v).split(".");
    return parts.length === 2 ? parseInt(parts[1],10) : null;
  }
  const persSunLine = getLine(personalityPlanets, "Sun") ?? getLine(personalityPlanets, "Earth");
  const desSunLine  = getLine(designPlanets,       "Sun") ?? getLine(designPlanets,       "Earth");
  const derivedProfile = (persSunLine && desSunLine) ? `${persSunLine}/${desSunLine}` : "TBD";

  // center graph helpers
  const MOTORS = new Set(["Sacral","SolarPlexus","Ego","Root"]);
  function centerGraphFromChannels(chKeys) {
    const idx = Object.fromEntries(CHANNELS_FULL.map(c => [c.key, c]));
    const g = new Map();
    const add = n => { if(!g.has(n)) g.set(n, new Set()); };
    chKeys.forEach(k => {
      const ch = idx[k]; if(!ch) return;
      const [a,b] = ch.centers;
      add(a); add(b); g.get(a).add(b); g.get(b).add(a);
    });
    return g;
  }
  function components(centers, graph) {
    const seen = new Set(), comps = [];
    for (const c of centers) {
      if (seen.has(c)) continue;
      const q = [c], comp = [];
      seen.add(c);
      while (q.length) {
        const x = q.shift(); comp.push(x);
        const nbrs = graph.get(x) || new Set();
        for (const n of nbrs) if (!seen.has(n) && centers.includes(n)) { seen.add(n); q.push(n); }
      }
      comps.push(comp);
    }
    return comps;
  }
  function pathExists(graph, startSet, target) {
    const seen = new Set(startSet), q = [...startSet];
    while (q.length) {
      const x = q.shift();
      if (x === target) return true;
      for (const n of (graph.get(x) || new Set())) if (!seen.has(n)) { seen.add(n); q.push(n); }
    }
    return false;
  }
  function computeDefinitionLabel(centers, graph) {
    if (centers.length === 0) return "None";
    const count = components(centers, graph).length;
    return ({1:"Single Definition",2:"Split Definition",3:"Triple Split Definition",4:"Quadruple Split Definition"}[count] || "Multiple Splits");
  }
  function computeTypeAuthority(centers, graph) {
    const has = c => centers.includes(c);
    const motors = centers.filter(c => MOTORS.has(c));
    const sacralDefined = has("Sacral");
    const motorToThroat = pathExists(graph, new Set(motors), "Throat");
    let type;
    if (centers.length === 0) type = "Reflector";
    else if (sacralDefined && motorToThroat) type = "Manifesting Generator";
    else if (sacralDefined) type = "Generator";
    else if (!sacralDefined && motorToThroat) type = "Manifestor";
    else type = "Projector";
    let authority;
    if (has("SolarPlexus"))            authority = "Emotional - Solar Plexus";
    else if (sacralDefined)            authority = "Sacral";
    else if (has("Spleen"))            authority = "Splenic";
    else if (has("Ego"))               authority = "Ego/Heart";
    else if (has("G") && has("Throat"))authority = "Self-Projected";
    else if (centers.length === 0)     authority = "Lunar";
    else                               authority = "Environment (Mental)";
    const strategy = ({
      "Generator": "To Respond",
      "Manifesting Generator": "To Respond",
      "Manifestor": "To Inform",
      "Projector": "Wait for the Invitation",
      "Reflector": "Wait a Lunar Cycle"
    })[type];
    return { type, authority, strategy };
  }

  const graph = centerGraphFromChannels(definedChannels);
  const definitionLabel = computeDefinitionLabel(definedCenters, graph);
  const { type, authority, strategy } = computeTypeAuthority(definedCenters, graph);

  const toGate = (gl) => parseInt(String(gl).split(".")[0], 10);
  const designGates = new Set(designPlanets.map(([, gl]) => toGate(gl)));
  const personalityGates = new Set(personalityPlanets.map(([, gl]) => toGate(gl)));

  /**************************
  INCARNATION CROSS LABEL
  **************************/
  const pSun   = parseGateLine(personalityPlanets, "Sun");
  const pEarth = parseGateLine(personalityPlanets, "Earth");
  const dSun   = parseGateLine(designPlanets,       "Sun");
  const dEarth = parseGateLine(designPlanets,       "Earth");
  const angle  = angleFromProfile(derivedProfile);
  const crossLabel = `${angle} Cross (${pSun.g}/${pEarth.g}|${dSun.g}/${dEarth.g})`;

  /**************************
  RESULT OBJECT
  **************************/
  const result = {
    name, date, time, place,
    type,
    profile:    derivedProfile,
    definition: definitionLabel,
    authority,
    strategy,
    notSelf: ({
      "Generator": "Frustration",
      "Manifesting Generator": "Frustration/Anger",
      "Manifestor": "Anger",
      "Projector": "Bitterness",
      "Reflector": "Disappointment"
    })[type],
    cross:      crossLabel,
    designPlanets,
    personalityPlanets,
    definedChannels,
    definedCenters,
    svg: svgBodygraph({
      definedCenters,
      definedChannels,
      designGates,
      backgroundImage,
      personalityGates
    })
  };

  /**************************
  DEBUG BLOCKS (OPTIONAL)
  **************************/
  if (args.debug === "true" || args.debug === true) {
    const tzSafe      = (tz && String(tz).trim()) ? String(tz).trim() : "UTC";
    const jdBirthDbg  = toJulianDay(date, time, tzSafe);          // sync
    const jdDesignDbg = await findDesignJDBySolarArc(jdBirthDbg); // async
    const sunBirth    = await calcLon(jdBirthDbg,  swe.SE_SUN);
    const sunDesign   = await calcLon(jdDesignDbg, swe.SE_SUN);
    result.debug = {
      date, time, tz: tzSafe,
      jdBirth:  jdBirthDbg,
      jdDesign: jdDesignDbg,
      sunBirth,
      sunDesign

    };
  }

  if (args.debug === "true" || args.debug === true) {
    const pSunStr   = (personalityPlanets.find(([b]) => b === "Sun") || [])[1] || "";
    const dSunStr   = (designPlanets.find(([b]) => b === "Sun") || [])[1] || "";
    const pEarthStr = (personalityPlanets.find(([b]) => b === "Earth") || [])[1] || "";
    const dEarthStr = (designPlanets.find(([b]) => b === "Earth") || [])[1] || "";
    result.debug = {
      ...(result.debug || {}),
      pSun: pSunStr, dSun: dSunStr, pEarth: pEarthStr, dEarth: dEarthStr,
      personalityPlanets,
      designPlanets
    };
  }

  if (args.debug === "true" || args.debug === true) {
    const idxSun2 = PLANETS.findIndex(([nm]) => nm === "Sun");
    (result.debug ||= {}).used = {
      jdP, jdD,
      sunLonP: longP[idxSun2],
      sunLonD: longD[idxSun2],
      pSunGL: (personalityPlanets.find(([b]) => b === "Sun") || [])[1] || "",
      dSunGL: (designPlanets.find(([b]) => b === "Sun") || [])[1] || ""
    };
  }

  /**************************
  OUTPUT JSON
  **************************/
  console.log(JSON.stringify(result));
}

/**************************
ENTRYPOINT
**************************/
compute().catch(e => { console.error(e); process.exit(1); });
