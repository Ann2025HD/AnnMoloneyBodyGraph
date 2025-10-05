#!/usr/bin/env node
// Ephemeris → Gate.Line → channels/centers → SVG

import { DateTime } from "luxon";
import swe from "swisseph";           // default import for CJS interop
import fs from "node:fs";
import path from "node:path";



// ---------- args ----------
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
const tz    = args.tz    || ""; // temp default (we can auto-detect later)



function expandHome(p) {
  if (p.startsWith("~/")) 
    return path.join(process.env.HOME || process.env.USERPROFILE || "", p.slice(2));
  return p;
}


// ---------- time → Julian Day ----------
function toJulianDay(dateISO, timeHHMM, zone) {
  const dt = DateTime.fromISO(`${dateISO}T${timeHHMM}`, { zone });
  if (!dt.isValid) throw new Error("Invalid date/time");
  const u = dt.toUTC();
  const ut = u.hour + u.minute/60 + u.second/3600;
  return swe.swe_julday(u.year, u.month, u.day, ut, swe.SE_GREG_CAL);
}

// ---------- Swiss Ephemeris (Moshier, no eph files) ----------
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

// Find the JD where the Sun is `arcDeg` behind its birth longitude (prenatal solution)
async function findDesignJDBySolarArc(jdBirth, arcDeg = 88.0) {
  const sunLonBirth = await calcLon(jdBirth, swe.SE_SUN);
  const target = normDeg(sunLonBirth - arcDeg);

  const meanDegPerDay = 0.9856;
  let jd = jdBirth - (arcDeg / meanDegPerDay); // good initial guess (~89 days earlier)

  for (let i = 0; i < 12; i++) {
    const lon   = await calcLon(jd, swe.SE_SUN);
    const delta = angDiff(lon, target);              // degrees (signed)

    if (Math.abs(delta) < 0.01) break;               // close enough

    // <<< KEY CHANGE: ALWAYS MOVE EARLIER >>>
    const stepDays = Math.abs(delta) / meanDegPerDay; // positive magnitude
    jd -= stepDays;                                   // move backward only

    // optional guard if something weird happens
    if (stepDays < 1e-6) break;
    if (jd <= jdBirth - 365) break; // safety: don't wander too far
  }
  return jd;
}

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



// 36 canonical channels (unique keys, normalized "lowGate-highGate")
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
  { key:"23-43", gates:[23,43], centers:["Throat","Ajna"] },   // same as 20-43 family, but this is the “structuring” channel
  { key:"24-61", gates:[24,61], centers:["Ajna","Head"] },
  { key:"25-51", gates:[25,51], centers:["G","Ego"] },
  { key:"26-44", gates:[26,44], centers:["Ego","Spleen"] },
  { key:"27-50", gates:[27,50], centers:["Sacral","Spleen"] },
  { key:"28-38", gates:[28,38], centers:["Spleen","Root"] },
  { key:"29-46", gates:[29,46], centers:["Sacral","G"] },
  { key:"30-41", gates:[30,41], centers:["SolarPlexus","Root"] },
  { key:"32-54", gates:[32,54], centers:["Spleen","Root"] },
  { key:"34-57", gates:[34,57], centers:["Sacral","Spleen"] }, // NOTE: not a classic channel; classic set has 34 only to 10 & 20
  { key:"35-36", gates:[35,36], centers:["Throat","SolarPlexus"] },
  { key:"37-40", gates:[37,40], centers:["SolarPlexus","Ego"] },
  { key:"39-55", gates:[39,55], centers:["Root","SolarPlexus"] },
  { key:"42-53", gates:[42,53], centers:["Sacral","Root"] },
  { key:"47-64", gates:[47,64], centers:["Ajna","Head"] }
];

// ---------- constants ----------
const DEG_PER_GATE = 360 / 64;
// Align Gate 41 ~ 302° (≈ 2° Aquarius)
const START_DEG = 302.0;
const GATE_ORDER = [
  41,19,13,49,30,55,37,63,22,36,25,17,21,51,42,3,
  27,24,2,23,8,20,16,35,45,12,15,52,39,53,62,56,
  31,33,7,4,29,59,40,64,47,6,46,18,48,57,32,50,
  28,44,1,43,14,34,9,5,26,11,10,58,38,54,61,60
];

// ---------- longitude → Gate.Line ----------
function gateLineFromLongitude(lon) {
  const delta = ((lon - START_DEG) % 360 + 360) % 360;
  const gateIdx = Math.floor(delta / DEG_PER_GATE);
  const withinGate = delta - gateIdx * DEG_PER_GATE;
  const line = 1 + Math.floor((withinGate / DEG_PER_GATE) * 6);
  const gate = GATE_ORDER[gateIdx];
  return [gate, line];
}

// ---------- derive channels & centers ----------
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

// ---------- SVG theme + drawing ----------
const THEME = {
  centerDefined:  "#ffd966",
  centerOpen:     "#ffffff",
  centerStroke:   "#555555",
  channelActive:  "#a05000",
  channelInactive:"#cccccc",
  text:           "#111111",
};
// Centered, cleaner proportions + soft palette.
// Uses definedCenters + definedChannels if provided by the CLI.


//Incarnation Cross
// --- helpers for cross ---
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




// ---------- SVG theme + drawing ----------


// Centered SVG with true squares + better spacing & proportions



function svgBodygraph({
  definedCenters = [],
  definedChannels = [],
  designGates = new Set(),
  personalityGates = new Set(),
  backgroundImage = null,
  backgroundOpacity = 0.8
} = {}) {
  const W = 420, H = 600;
  const CX = 210;                     // center x
  const SIZE = {
    square: 58,                       // width/height for Throat, Sacral, Root
    gapV:  48,                        // vertical spacing
    head:  60,                        // triangle base width (Head)
    ajna:  56,                        // triangle base width (Ajna)
    sideTriBase: 58,                  // base width for Spleen / Solar Plexus
    sideTriH:   46                    // side triangle heigh
  };

  const COLORS = {
    bg:               "#ffffff",
    stroke:           "#555555",
    grid:             "#d9d9d9",
    centerDefined:    "#fff0b3",
    centerUndefined:  "#ffffff",
    channelDefined:   "#a97100",
    channelUndefined: "#FFFFFF",
    text:             "#111111"
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


  // gaps
  const GAP_THROAT_TO_G = 64  
  const GAP_AJNA_TO_THROAT  = 36;  
  const GAP_G_TO_SACRAL     = 90; // you already have this
  const GAP_SACRAL_TO_ROOT  = 36;  // more space than before (was ~18)
  
  // basic geometry (top → bottom)
  // Head (triangle pointing DOWN)
  const HEAD_Y = 36;
  const HEAD = [
    [CX,               HEAD_Y],                 // apex top
    [CX - SIZE.head/2, HEAD_Y + SIZE.head],    // base left
    [CX + SIZE.head/2, HEAD_Y + SIZE.head]     // base right
  ];


  // Ajna (triangle pointing DOWN)
  const AJNA_Y = HEAD[1][1] + 28;              // start below head base
  const AJNA = [
    [CX - SIZE.ajna/2, AJNA_Y],                // base left
    [CX + SIZE.ajna/2, AJNA_Y],                // base right
    [CX,               AJNA_Y + SIZE.ajna]     // apex down
  ];

  // Throat (square)
  const THROAT_Y = AJNA[2][1] + GAP_AJNA_TO_THROAT;
  const THROAT = { x: CX - SIZE.square/2, y: THROAT_Y, w: SIZE.square, h: SIZE.square };

  // G (diamond) – square rotated 45°
  const G_CY = THROAT.y + THROAT.h + GAP_THROAT_TO_G;
  const G_HALF = Math.round(SIZE.square * 0.65); // ~32 when square=58 (was 22)
  const G = [
    [CX,         G_CY - G_HALF],
    [CX + G_HALF, G_CY],
    [CX,         G_CY + G_HALF],
    [CX - G_HALF, G_CY]
  ];

  // Sacral (square) – this is our cross-bar reference level
  const SACRAL_Y = G_CY + GAP_G_TO_SACRAL;
  const SACRAL = { x: CX - SIZE.square/2, y: SACRAL_Y, w: SIZE.square, h: SIZE.square };

  // Spleen (left triangle pointing RIGHT), aligned to Sacral midline  
  const SIDE_GAP   = 120;  // distance from Sacral (was ~8)
  const SIDE_BASE  = 70;  // triangle base width (bigger)
  const SIDE_HEIGHT= 70;  // triangle height (bigger)
  const SPL_MID_Y    = SACRAL.y + SACRAL.h/2;
  const SPL_INNER_X = SACRAL.x - SIDE_GAP;              // LEFT side (Spleen)
  const SPLEEN = [
   [SPL_INNER_X,                 SPL_MID_Y - SIDE_HEIGHT/2], // inner top
   [SPL_INNER_X,                 SPL_MID_Y + SIDE_HEIGHT/2], // inner bottom
   [SPL_INNER_X + SIDE_BASE,     SPL_MID_Y]                  // tip to the RIGHT   (inward)
  ];


  // Solar Plexus (right triangle pointing LEFT), aligned to Sacral midline
  const SOL_INNER_X = SACRAL.x + SACRAL.w + SIDE_GAP;
  const SOLAR = [
   [SOL_INNER_X,                 SPL_MID_Y - SIDE_HEIGHT/2], // inner top
   [SOL_INNER_X,                 SPL_MID_Y + SIDE_HEIGHT/2], // inner bottom
   [SOL_INNER_X - SIDE_BASE,     SPL_MID_Y]                  // tip to the LEFT (inward)
  ];

  // Ego / Will (right of G, pointing UP)

  const EGO_CY   = (G_CY + SPL_MID_Y) / 2 -30;  // halfway between G and Solar Plexus
  const EGO_CX   = CX + G_HALF + 20;  
  const EGO_H   = 30;                       // triangle height (bigger)
   const EGO_BASE   = 60;   // horizontal base length (flat bottom)  
  const EGO_TIP    = 34;  
  const EGO_INNER_X = CX + (Math.round(SIZE.square * 0.65)) + 12;  
  const EGO_LEFT_X = CX + G_HALF + 12;

  const EGO = [
   [EGO_CX,                 EGO_CY - EGO_H/2],        // apex (UP)
   [EGO_CX - EGO_BASE/2,    EGO_CY + EGO_H/2],        // base left
   [EGO_CX + EGO_BASE/2,    EGO_CY + EGO_H/2]         // base right
  ];

  // Root (square)
  const ROOT_Y = SACRAL.y + SACRAL.h + GAP_SACRAL_TO_ROOT;
  const ROOT = { x: CX - SIZE.square/2, y: ROOT_Y, w: SIZE.square, h: SIZE.square };


  // Start SVG
  push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  rect(0, 0, W, H, COLORS.bg);
if (backgroundImage) {
  // Keep the image inside the SVG’s bounds
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
 // push(`<text x="${CX}" y="22" font-family="Helvetica" font-size="18" text-anchor="middle" fill="${COLORS.text}">Bodygraph</text>`);

  // --- centroids for each center (used to nudge labels inward) ---
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

// nudge a point 'p' a distance 'd' toward a center point 'c'
function insetTowards(p, c, d=10) {
  const [x,y] = p, [cx,cy] = c;
  const vx = cx - x, vy = cy - y;
  const L = Math.hypot(vx, vy) || 1;
  return [x + (vx/L)*d, y + (vy/L)*d];
}

// label color (you can swap to defined/undefined colors if you like)
function gateLabelColor(g) {
  // neutral dark; or comment these 2 lines and just return "#333"
  if (personalityGates.has(g)) return "#222";
  if (designGates.has(g))      return "#B13A2F";
  return "#555";
}

// draw one gate number at its inset anchor
function drawGateNumber(gate, inset=10) {
  const spec = GATE_ANCHORS[gate];
  if (!spec) return;
  const p = anchorForGate(gate);
  const c = CENTROID[spec.center] || [CX, H/2];
  const [tx, ty] = insetTowards(p, c, inset);
  push(`<text x="${tx}" y="${ty}" font-family="Helvetica, Arial, sans-serif"
        font-size="10" fill="${gateLabelColor(gate)}"
        text-anchor="middle" dominant-baseline="middle">${gate}</text>`);
}


  // paint centers (top → bottom so overlaps look natural)
  poly(HEAD,  fill("Head"));
  poly(AJNA,  fill("Ajna"));
  rect(THROAT.x, THROAT.y, THROAT.w, THROAT.h, fill("Throat"));
  poly(G,     fill("G"));
  poly(EGO,   fill("Ego"));          
  poly(SPLEEN, fill("Spleen"));
  poly(SOLAR,  fill("SolarPlexus"));
  rect(SACRAL.x, SACRAL.y, SACRAL.w, SACRAL.h, fill("Sacral"));
  rect(ROOT.x, ROOT.y, ROOT.w, ROOT.h, fill("Root"));


// FROM HERE ON I'M SETIN UP THE GATES AND CHANNELS
// THERE SHOULD BE NO CODE RELATED TO CHANNELS BEFORE THIS POINT

// ============================
// CHANNEL NETWORK (complete)
// ============================

// 1) Anchor points where channels attach (center midpoints when needed)
const anchor = {
  Head:        [CX, HEAD_Y + SIZE.head],              // head base center
  AjnaTop:     [CX, AJNA_Y],                           // ajna top center
  AjnaApex:    [CX, AJNA[2][1]],                       // ajna apex (down)
  Throat:      [THROAT.x + THROAT.w/2, THROAT.y + THROAT.h/2],
  G:           [CX, G_CY],
  Ego:         [CX + G_HALF, G_CY],                    // inner edge of Ego toward G
  Spleen:      [SPL_INNER_X, SPL_MID_Y],               // inner edge toward body
  SolarPlexus: [SOL_INNER_X, SPL_MID_Y],               // inner edge toward body
  Sacral:      [SACRAL.x + SACRAL.w/2, SACRAL.y],      // top center of Sacral
  Root:        [ROOT.x + ROOT.w/2, ROOT.y]             // top center of Root
};

// Each gate belongs to exactly one center
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
  62:{center:"Throat", side:"top",    t:0.20},
  23:{center:"Throat", side:"top",    t:0.50},
  56:{center:"Throat", side:"top",    t:0.80},
  16:{center:"Throat", side:"left",   t:0.10},
  20:{center:"Throat", side:"left",   t:0.50}, // ⬅ integration anchor kept
  12:{center:"Throat", side:"right",  t:0.50},
  31:{center:"Throat", side:"bottom", t:0.20},
   8:{center:"Throat", side:"bottom", t:0.50},
  33:{center:"Throat", side:"bottom", t:0.80},
  45:{center:"Throat", side:"bottom", t:0.99},
  35:{center:"Throat", side:"right",  t:0.10},

  // Head
  64:{center:"Head",   side:"bottom", t:0.20},
  61:{center:"Head",   side:"bottom", t:0.50},
  63:{center:"Head",   side:"bottom", t:0.80},

  // Ajna
  47:{center:"Ajna",   side:"top",    t:0.20},
  24:{center:"Ajna",   side:"top",    t:0.50},
   4:{center:"Ajna",   side:"top",    t:0.80},
  17:{center:"Ajna",   side:"left",   t:0.30},  // left slanted edge (mid-lower)
  11:{center:"Ajna",   side:"right",  t:0.50},
  43:{center:"Ajna",   side:"bottom", t:0.70},

  // G
  13:{center:"G",      side:"top",    t:0.50},
   1:{center:"G",      side:"top",    t:0.01},
   7:{center:"G",      side:"left",   t:0.60},
  46:{center:"G",      side:"right",  t:0.55},
   2:{center:"G",      side:"bottom", t:0.01},
  15:{center:"G",      side:"bottom",   t:0.55},
  10:{center:"G",      side:"left",   t:0.01},  // integration
  25:{center:"G",      side:"right",  t:0.25},

  // Ego
  21:{center:"Ego",    side:"top",    t:0.50},
  51:{center:"Ego",    side:"left",   t:0.40},
  26:{center:"Ego",    side:"left",   t:0.01},
  40:{center:"Ego",    side:"bottom", t:0.55},

  // Solar Plexus
  22:{center:"SolarPlexus", side:"top",    t:0.65},
  36:{center:"SolarPlexus", side:"top",    t:0.90},
   6:{center:"SolarPlexus", side:"bottom", t:0.99},
  37:{center:"SolarPlexus", side:"top",    t:0.30},
  49:{center:"SolarPlexus", side:"bottom", t:0.50},
  30:{center:"SolarPlexus", side:"bottom", t:0.10},
  55:{center:"SolarPlexus", side:"bottom", t:0.30},

  // Spleen
  48:{center:"Spleen", side:"top",    t:0.90},
  57:{center:"Spleen", side:"top",    t:0.70},  // integration
  50:{center:"Spleen", side:"top",    t:0.01},
  44:{center:"Spleen", side:"top",    t:0.50},
  32:{center:"Spleen", side:"bottom", t:0.70},
  28:{center:"Spleen", side:"bottom", t:0.50},
  18:{center:"Spleen", side:"bottom", t:0.30},

  // Sacral
  14:{center:"Sacral", side:"top",    t:0.50},
   5:{center:"Sacral", side:"top",    t:0.20},
  34:{center:"Sacral", side:"left",   t:0.20},  // integration
  27:{center:"Sacral", side:"left",   t:0.50},
  29:{center:"Sacral", side:"top",    t:0.80},
  59:{center:"Sacral", side:"right",  t:0.50},
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

// ---------- geometry helpers (define ONCE) ----------
const lerp = (a, b, t) => a + (b - a) * t;
const lerp2 = ([x1,y1], [x2,y2], t) => [ lerp(x1,x2,t), lerp(y1,y2,t) ];

function strokeForGate(g) {
  if (personalityGates.has(g)) return "#222222";  // black
  if (designGates.has(g))      return "#D75442";  // red
  return null; // undefined -> draw nothing in overlay pass
}

// A safe line drawer (segments)
function drawSeg(a, b, stroke, w) {
  if (!a || !b || !stroke) return;
  line(a[0], a[1], b[0], b[1], stroke, w);
}

// Rect sides
function rectSidePoint(R, side, t) {
  side = (side||"").toLowerCase();
  if (side === "top")    return [lerp(R.x, R.x+R.w, t), R.y];
  if (side === "bottom") return [lerp(R.x, R.x+R.w, t), R.y + R.h];
  if (side === "left")   return [R.x, lerp(R.y, R.y+R.h, t)];
  if (side === "right")  return [R.x + R.w, lerp(R.y, R.y+R.h, t)];
  return [R.x + R.w/2, R.y + R.h/2];
}

// Diamond (G) points
const G_TOP = G[0], G_RIGHT = G[1], G_BOTTOM = G[2], G_LEFT = G[3];
function diamondSidePoint(side, t) {
  side = (side||"").toLowerCase();
  if (side === "top")    return lerp2(G_TOP,    G_RIGHT, t);
  if (side === "right")  return lerp2(G_RIGHT,  G_BOTTOM, t);
  if (side === "bottom") return lerp2(G_BOTTOM, G_LEFT, t);
  if (side === "left")   return lerp2(G_LEFT,   G_TOP, t);
  return [CX, G_CY];
}

// Head ▲
const HEAD_BASE_L = HEAD[1], HEAD_BASE_R = HEAD[2], HEAD_APEX = HEAD[0];
function headPoint(side, t) {
  side = (side||"").toLowerCase();
  if (side === "bottom") return lerp2(HEAD_BASE_L, HEAD_BASE_R, t);
  if (side === "top")    return HEAD_APEX;
  return lerp2(HEAD_BASE_L, HEAD_BASE_R, t);
}

// Ajna ▼ — support left/right slanted edges
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

// Spleen ◄
function spleenPoint(side, t) {
  side = (side||"").toLowerCase();
  if (side === "right")  return lerp2(SPLEEN[0], SPLEEN[1], t);
  if (side === "top")    return lerp2(SPLEEN[2], SPLEEN[0], t);
  if (side === "bottom") return lerp2(SPLEEN[1], SPLEEN[2], t);
  return SPLEEN[0];
}

// Solar ►
function solarPoint(side, t) {
  side = (side||"").toLowerCase();
  if (side === "left")   return lerp2(SOLAR[0], SOLAR[1], t);
  if (side === "top")    return lerp2(SOLAR[2], SOLAR[0], t);
  if (side === "bottom") return lerp2(SOLAR[1], SOLAR[2], t);
  return SOLAR[0];
}

// Ego ▲
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

// Channel endpoints by *gates*
function endpointsForChannel(ch) {
  const [gA, gB] = ch.gates;
  return [ anchorForGate(gA), anchorForGate(gB) ];
}

// ---- exceptions used for pass 1


// color helper for overlays
function strokeForGate(g) {
  if (personalityGates.has(g)) return "#222222"; // black
  if (designGates.has(g))      return "#D75442"; // red
  return null; // undefined: no overlay
}

// safe segment draw
function drawSeg(a, b, stroke, w) {
  if (!a || !b || !stroke) return;
  line(a[0], a[1], b[0], b[1], stroke, w);
}

// ----- PASS 1: draw all NON-exception channels (grid + split overlay)
CHANNELS_FULL.forEach(ch => {
  const [gA, gB] = ch.gates;
  if (EXCEPTION_GATES.has(gA) || EXCEPTION_GATES.has(gB)) return; // skip integration parts

  const pA = anchorForGate(gA);
  const pB = anchorForGate(gB);

  // grid
  line(pA[0], pA[1], pB[0], pB[1], COLORS.channelUndefined, 4);

  // split overlay at geometric midpoint
  const mid = [ (pA[0]+pB[0])/2, (pA[1]+pB[1])/2 ];
  drawSeg(pA, mid, strokeForGate(gA), 7);
  drawSeg(mid, pB, strokeForGate(gB), 7);
});

// ----- PASS 2: Integration network (classic shape)
// gates → points
const P10 = anchorForGate(10);
const P20 = anchorForGate(20);
const P34 = anchorForGate(34);
const P57 = anchorForGate(57);



// two junctions along the 57→20 spine
// t is measured from 57 toward 20 (0 = at 57, 1 = at 20)
const J34 = [
  P57[0] + (P20[0] - P57[0]) * 0.20,   // meets spine earlier (closer to 57)
  P57[1] + (P20[1] - P57[1]) * 0.20
];

const J10 = [
  P57[0] + (P20[0] - P57[0]) * 0.50,   // later (your previous junction)
  P57[1] + (P20[1] - P57[1]) * 0.50
];
// GRID
// 20–57 spine
line(P20[0], P20[1], P57[0], P57[1], COLORS.channelUndefined, 4);
// 34–20 goes via J34
line(P34[0], P34[1], J34[0],   J34[1],   COLORS.channelUndefined, 4);
line(J34[0],   J34[1],   P20[0], P20[1], COLORS.channelUndefined, 4);
// 10–57 goes via J10
line(P10[0], P10[1], J10[0],   J10[1],   COLORS.channelUndefined, 4);
line(J10[0],   J10[1],   P57[0], P57[1], COLORS.channelUndefined, 4);

// OVERLAYS (split by owning gate)
// 34–20 halves
drawSeg(P34, J34,   strokeForGate(34), 7);
drawSeg(J34,   P20, strokeForGate(20), 7);
// 10–57 halves
drawSeg(P10, J10,   strokeForGate(10), 7);
drawSeg(J10,   P57, strokeForGate(57), 7);
// 20–57 split at true midpoint (not J)
const M2057 = [ (P20[0]+P57[0])/2, (P20[1]+P57[1])/2 ];
drawSeg(P20,  M2057, strokeForGate(20), 7);
drawSeg(M2057, P57,  strokeForGate(57), 7);

// OPTIONAL: gold emphasis when a complete integration channel is present
const hasGate = g => personalityGates.has(g) || designGates.has(g);
if (hasGate(34) && hasGate(20)) { line(P34[0],P34[1],J[0],J[1],"#a97100",6); line(J[0],J[1],P20[0],P20[1],"#a97100",6); }
if (hasGate(10) && hasGate(57)) { line(P10[0],P10[1],J[0],J[1],"#a97100",6); line(J[0],J[1],P57[0],P57[1],"#a97100",6); }
if (hasGate(20) && hasGate(57)) { line(P20[0],P20[1],P57[0],P57[1],"#a97100",6); }



Object.keys(GATE_ANCHORS).forEach(k => drawGateNumber(+k, 9)); // inset ~9–10px
  push(`</svg>`);
  return svg.join("\n");
}


// ---------- main ----------
async function compute() {

const defaultBg = "~/hdkit/sample-apps/hdkit_sample_app/lib/hdkit/images/types-5.png";
// allow CLI override: --bg=/path/to/image.png
const bgPathArg = args.bg || defaultBg;

let backgroundImage = null;
try {
  const filePath = expandHome(bgPathArg);
  const buf = fs.readFileSync(filePath);
  backgroundImage = `data:image/png;base64,${buf.toString("base64")}`;
} catch (e) {
  // If file missing, just skip background (no crash)
  backgroundImage = null;
}
  // Personality (birth) & Design (~88 days earlier for now)
  const jdP = toJulianDay(date, time, tz);
  const jdD = await findDesignJDBySolarArc(jdP, 88.0);

  // Longitudes for Sun..Pluto
  const longP = await Promise.all(PLANETS.map(([_, id]) => calcLon(jdP, id)));
  const longD = await Promise.all(PLANETS.map(([_, id]) => calcLon(jdD, id)));

  // Force Earth = Sun + 180° (geocentric), then wrap to [0,360)
  const idxSun   = PLANETS.findIndex(([nm]) => nm === "Sun");
  const idxEarth = PLANETS.findIndex(([nm]) => nm === "Earth");
  longP[idxEarth] = ((longP[idxSun] + 180) % 360 + 360) % 360;
  longD[idxEarth] = ((longD[idxSun] + 180) % 360 + 360) % 360;

  // --- LUNAR NODES ---
  // North Node (Mean) from Swiss Ephemeris; South Node = North + 180°
  const northLonP = await calcLon(jdP, swe.SE_MEAN_NODE);
  const northLonD = await calcLon(jdD, swe.SE_MEAN_NODE);

  const southLonP = ((northLonP + 180) % 360 + 360) % 360;
  const southLonD = ((northLonD + 180) % 360 + 360) % 360;
  

// Map longitudes -> Gate.Line  (build ONCE)
  const personalityPlanets = PLANETS.map(([nm], i) => {
    const [g, l] = gateLineFromLongitude(longP[i]);
    return [nm, `${g}.${l}`];
  });

  const designPlanets = PLANETS.map(([nm], i) => {
    const [g, l] = gateLineFromLongitude(longD[i]);
    return [nm, `${g}.${l}`];
  });

  // --- keep Earth’s gate but force its line to equal Sun’s line
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


  // Map the node longitudes → Gate.Line and append to the planet lists

  const [gNP, lNP] = gateLineFromLongitude(northLonP);
  const [gSP, lSP] = gateLineFromLongitude(southLonP);
  personalityPlanets.push(["North Node", `${gNP}.${lNP}`]);
  personalityPlanets.push(["South Node", `${gSP}.${lSP}`]);

  const [gND, lND] = gateLineFromLongitude(northLonD);
  const [gSD, lSD] = gateLineFromLongitude(southLonD);
  designPlanets.push(["North Node", `${gND}.${lND}`]);
  designPlanets.push(["South Node", `${gSD}.${lSD}`]);

  // Derive channels/centers
  const allGates = personalityPlanets.concat(designPlanets)
                    .map(([,gl]) => parseInt(String(gl).split(".")[0],10));
  const { definedChannels, definedCenters } = deriveDefinition(allGates);

const persSunLine = getLine(personalityPlanets, "Sun") ?? getLine(personalityPlanets, "Earth");
  const desSunLine  = getLine(designPlanets,       "Sun") ?? getLine(designPlanets,       "Earth");
  const derivedProfile = (persSunLine && desSunLine) ? `${persSunLine}/${desSunLine}` : "TBD";


  // Graph helpers (scoped here)
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
  function getLine(pairs, planet) {
    const h = Object.fromEntries(pairs);
    const v = h[planet]; if (!v) return null;
    const parts = String(v).split(".");
    return parts.length === 2 ? parseInt(parts[1],10) : null;
  }
 
  
  const graph = centerGraphFromChannels(definedChannels);
  const definitionLabel = computeDefinitionLabel(definedCenters, graph);
  const { type, authority, strategy } = computeTypeAuthority(definedCenters, graph);

  const toGate = (gl) => parseInt(String(gl).split(".")[0], 10);
  const designGates = new Set(designPlanets.map(([, gl]) => toGate(gl)));
  const personalityGates = new Set(personalityPlanets.map(([, gl]) => toGate(gl)));
  // --- Incarnation Cross (basic) ---
  // Pull the four key gates from Personality/Design Sun & Earth
  const pSun   = parseGateLine(personalityPlanets, "Sun");
  const pEarth = parseGateLine(personalityPlanets, "Earth");
  const dSun   = parseGateLine(designPlanets,       "Sun");
  const dEarth = parseGateLine(designPlanets,       "Earth");
 
  // Angle from the profile
  const angle = angleFromProfile(derivedProfile);

  // Compose a clear label (numbers for now; easy to swap to names later)
  const crossLabel = `${angle} Cross (${pSun.g}/${pEarth.g}|${dSun.g}/${dEarth.g})`;



  const result = {
    name, date, time, place,
    type,
    profile:    derivedProfile,
    definition: definitionLabel,
    authority,
    strategy,
    notSelf:    ({"Generator":"Frustration","Manifesting Generator":"Frustration/. Anger","Manifestor":"Anger", "Projector": "Bitterness" , "Reflector" :"Disappointment"})[type],
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

if (args.debug === "true" || args.debug === true) {
  const tzSafe      = (tz && String(tz).trim()) ? String(tz).trim() : "UTC";
  const jdBirthDbg  = toJulianDay(date, time, tzSafe);         // sync
  const jdDesignDbg = await findDesignJDBySolarArc(jdBirthDbg); // async
  const sunBirth    = await calcLon(jdBirthDbg,  swe.SE_SUN);
  const sunDesign   = await calcLon(jdDesignDbg, swe.SE_SUN);

  result.debug = {
    date,
    time,
    tz: tzSafe,
    jdBirth:  jdBirthDbg,
    jdDesign: jdDesignDbg,
    sunBirth,
    sunDesign
  };
}    


if (args.debug === "true" || args.debug === true) {
  const pSun = (personalityPlanets.find(([b]) => b === "Sun") || [])[1] || "";
  const dSun = (designPlanets.find(([b]) => b === "Sun") || [])[1] || "";
  const pEarth = (personalityPlanets.find(([b]) => b === "Earth") || [])[1] || "";
  const dEarth = (designPlanets.find(([b]) => b === "Earth") || [])[1] || "";

  result.debug = {
    ...(result.debug || {}),
    pSun, dSun, pEarth, dEarth,
    personalityPlanets,
    designPlanets
  };
}

if (args.debug === "true" || args.debug === true) {
  const idxSun = PLANETS.findIndex(([nm]) => nm === "Sun");
  (result.debug ||= {}).used = {
    jdP, jdD,                         // the JDs actually used for longP/longD
    sunLonP: longP[idxSun],           // the longitudes actually mapped
    sunLonD: longD[idxSun],
    pSunGL: (personalityPlanets.find(([b]) => b === "Sun") || [])[1] || "",
    dSunGL: (designPlanets.find(([b]) => b === "Sun") || [])[1] || ""
  };
}
  console.log(JSON.stringify(result));
}

compute().catch(e => { console.error(e); process.exit(1); });
