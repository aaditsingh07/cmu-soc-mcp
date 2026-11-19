/**
 * Offline dataset of CMU Pittsburgh academic buildings, plus the matching and
 * distance helpers behind estimate_walk_time.
 *
 * Codes and names follow the Schedule of Classes building legend
 * (www.cmu.edu/hub/legend.html). The public SOC no longer prints rooms, so inputs
 * come from the student (who sees rooms in SIO): "GHC 4401", "DH A302", "Wean 7500".
 *
 * Coordinates: building centroids from OpenStreetMap (© OpenStreetMap contributors,
 * ODbL 1.0, https://www.openstreetmap.org/copyright), pulled once on 2026-11-18 via
 * Overpass; the Craig Street / Forbes Avenue addresses (3SC, 4SC, CA, III) via
 * Nominatim. Gesling Stadium's point is from Wikidata (CC0). Weigand Gymnasium sits
 * inside the Cohon Center and uses its point. Good for "can I make it in 10 minutes",
 * nothing more: no routing, no stairs, no elevation.
 */

export interface Building {
  code: string;
  name: string;
  aliases: string[];
  lat: number;
  lon: number;
  /** Off the main campus: walking estimates are refused. */
  off_campus?: true;
  note?: string;
}

/** Typical walking pace on campus, metres per minute (~3 mph). */
const WALK_SPEED_M_PER_MIN = 80;
/** Straight-line distance is multiplied by this to approximate path length. */
const PATH_FACTOR = 1.4;

export const BUILDINGS: Building[] = [
  // ------------------------------------------------------ the Cut / main quad
  { code: "HL", name: "Hunt Library", aliases: ["Hunt", "Hunt Library Building"], lat: 40.44111, lon: -79.94374 },
  { code: "BH", name: "Baker Hall", aliases: ["Baker"], lat: 40.44151, lon: -79.94495 },
  { code: "PH", name: "Porter Hall", aliases: ["Porter"], lat: 40.44173, lon: -79.94629 },
  { code: "DH", name: "Doherty Hall", aliases: ["Doherty"], lat: 40.44252, lon: -79.9445 },
  { code: "WEH", name: "Wean Hall", aliases: ["Wean"], lat: 40.44267, lon: -79.94581 },
  { code: "HH", name: "Hamerschlag Hall", aliases: ["Hamerschlag"], lat: 40.44241, lon: -79.94669 },
  { code: "REH", name: "Roberts Engineering Hall", aliases: ["Roberts Hall", "Roberts"], lat: 40.44245, lon: -79.94722 },
  { code: "SH", name: "Scaife Hall", aliases: ["Scaife"], lat: 40.44167, lon: -79.94734 },
  { code: "SC", name: "Scott Hall", aliases: [], lat: 40.44292, lon: -79.94676 },
  { code: "ANS", name: "Ansys Hall", aliases: ["ANSYS Hall", "Ansys"], lat: 40.44196, lon: -79.94661 },
  { code: "CFA", name: "College of Fine Arts", aliases: ["College of Fine Arts Building", "Fine Arts"], lat: 40.44157, lon: -79.94291 },
  { code: "HOA", name: "Hall of the Arts", aliases: [], lat: 40.44092, lon: -79.94255 },
  { code: "POS", name: "Posner Hall", aliases: ["Posner"], lat: 40.44127, lon: -79.94214 },
  { code: "MM", name: "Margaret Morrison Carnegie Hall", aliases: ["Margaret Morrison", "MMCH"], lat: 40.44223, lon: -79.94148 },
  { code: "WW", name: "West Wing", aliases: [], lat: 40.44273, lon: -79.94084 },

  // ----------------------------------------------- north of the Cut / Forbes Ave
  { code: "GHC", name: "Gates and Hillman Centers", aliases: ["Gates Hillman Center", "Gates Hillman Centers", "Gates Center", "Gates", "Hillman Center"], lat: 40.44385, lon: -79.94441 },
  { code: "NSH", name: "Newell-Simon Hall", aliases: ["Newell Simon Hall", "Newell-Simon", "Newell Simon"], lat: 40.44338, lon: -79.9456 },
  { code: "EDS", name: "Elliot Dunlap Smith Hall", aliases: ["Smith Hall", "EDSH"], lat: 40.44397, lon: -79.94554 },
  { code: "HBH", name: "Hamburg Hall", aliases: ["Hamburg", "Heinz College"], lat: 40.44418, lon: -79.94555 },
  { code: "CIC", name: "Collaborative Innovation Center", aliases: [], lat: 40.44397, lon: -79.94657 },
  { code: "TCS", name: "Tata Consultancy Services Hall", aliases: ["TCS Hall"], lat: 40.44493, lon: -79.94723 },
  { code: "TEP", name: "Tepper Quad", aliases: ["Tepper Building", "Tepper School of Business", "David A. Tepper Quadrangle", "Tepper"], lat: 40.44513, lon: -79.94537 },
  { code: "CUC", name: "Cohon University Center", aliases: ["Cohon Center", "University Center", "UC", "Cohon"], lat: 40.4435, lon: -79.94207 },
  { code: "GYM", name: "Weigand Gymnasium", aliases: ["Weigand Gym", "Wiegand Gymnasium"], lat: 40.4435, lon: -79.94207, note: "Inside the Cohon University Center." },
  { code: "PCA", name: "Purnell Center for the Arts", aliases: ["Purnell Center", "Purnell"], lat: 40.44353, lon: -79.94354 },
  { code: "WH", name: "Warner Hall", aliases: ["Warner"], lat: 40.44418, lon: -79.94339 },
  { code: "CYH", name: "Cyert Hall", aliases: ["Cyert"], lat: 40.44424, lon: -79.94398 },
  { code: "GES", name: "Gesling Stadium", aliases: ["Gesling"], lat: 40.44333, lon: -79.94028 },

  // ------------------------------------------------------ Craig Street / Fifth
  { code: "III", name: "4612 Forbes Avenue", aliases: ["Integrated Innovation Institute"], lat: 40.44429, lon: -79.94789 },
  { code: "INI", name: "4616 Henry Street", aliases: ["Information Networking Institute"], lat: 40.44606, lon: -79.94802 },
  { code: "4SC", name: "407 South Craig Street", aliases: ["407 S Craig", "407 S. Craig Street"], lat: 40.44499, lon: -79.94842 },
  { code: "CA", name: "311 South Craig Street", aliases: ["311 S Craig", "311 S. Craig Street"], lat: 40.44561, lon: -79.94856 },
  { code: "3SC", name: "300 South Craig Street", aliases: ["300 S Craig", "300 S. Craig Street"], lat: 40.4455, lon: -79.94918 },
  { code: "SEI", name: "Software Engineering Institute", aliases: ["4500 Fifth Avenue"], lat: 40.44628, lon: -79.95007 },
  { code: "MI", name: "Mellon Institute", aliases: ["Mellon Institute of Industrial Research"], lat: 40.44611, lon: -79.9511 },

  // ------------------------------------------------------------- off campus
  { code: "2NB", name: "201 North Braddock", aliases: ["201 North Braddock Avenue", "201 N Braddock"], lat: 40.44816, lon: -79.89455, off_campus: true, note: "Point Breeze, about 4 km east of campus." },
  { code: "PTC", name: "Pittsburgh Technology Center - 2nd Avenue", aliases: ["Pittsburgh Technology Center"], lat: 0, lon: 0, off_campus: true, note: "On Second Avenue along the Monongahela, off the main campus." },
];

/** Location strings that are not a place you can walk to. */
const VIRTUAL_LOCATION_RE =
  /^(online|remote|no location|off campus|off|to be (announced|arranged|determined)|tba|tbd|dnm|does not meet|cmu|n a|see instructor)\b/;

/** Lowercase, drop punctuation, collapse whitespace: "Wean Hall, 7500" -> "wean hall 7500". */
export function normalizeLocation(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isVirtualLocation(input: string): boolean {
  return VIRTUAL_LOCATION_RE.test(normalizeLocation(input));
}

/** All (key -> building) pairs, longest first so "Gates Hillman Center" beats "Gates". */
const BUILDING_KEYS: { key: string; building: Building }[] = BUILDINGS.flatMap((building) =>
  [building.code, building.name, ...building.aliases]
    .filter((k) => k.length > 0)
    .map((k) => ({ key: normalizeLocation(k), building }))
).sort((a, b) => b.key.length - a.key.length);

export interface LocationMatch {
  input: string;
  building: Building;
  room: string | null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pull the room off the original string so its casing survives ("A302", "McConomy"). */
function roomAfter(input: string, key: string): string | null {
  const pattern = key.split(" ").map(escapeRegExp).join("[^a-z0-9]+");
  const m = input.match(new RegExp(`^[^a-z0-9]*${pattern}[^a-z0-9]*(.*)$`, "i"));
  const room = m ? m[1].trim() : "";
  return room.length > 0 ? room : null;
}

/** Turn "GHC 4401", "Wean Hall 7500", "gates" into a building plus the leftover room. */
export function matchBuilding(input: string): LocationMatch | null {
  const norm = normalizeLocation(input);
  if (norm.length === 0) return null;

  for (const { key, building } of BUILDING_KEYS) {
    if (norm === key) return { input, building, room: null };
    if (norm.startsWith(`${key} `)) return { input, building, room: roomAfter(input, key) };
  }
  // Room first ("4401 Gates Hillman Center"): accept the building name anywhere.
  for (const { key, building } of BUILDING_KEYS) {
    if (key.length >= 4 && (norm.includes(` ${key} `) || norm.endsWith(` ${key}`))) {
      return { input, building, room: null };
    }
  }
  return null;
}

/** Words too generic to identify a building ("Hall" matches half the campus). */
const GENERIC_TOKENS = new Set(["hall", "building", "center", "centre", "street", "avenue", "the", "and", "of", "for", "cmu"]);

/** Closest building names for an unmatched input, best first (may be empty). */
export function suggestBuildings(input: string, limit = 6): string[] {
  const tokens = normalizeLocation(input)
    .split(" ")
    .filter((t) => t.length > 2 && !/^\d/.test(t) && !GENERIC_TOKENS.has(t));
  if (tokens.length === 0) return [];
  return BUILDINGS.map((building) => {
    const haystack = normalizeLocation([building.code, building.name, ...building.aliases].join(" "));
    let score = 0;
    for (const t of tokens) {
      if (haystack.includes(t)) score += t.length;
      // Cheap typo tolerance: "Ween" should still suggest Wean Hall.
      else if (t.length >= 3 && haystack.split(" ").some((w) => w.slice(0, 2) === t.slice(0, 2) && w.slice(-1) === t.slice(-1))) score += 2;
    }
    return { building, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.building.name);
}

function haversineMeters(a: Building, b: Building): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface WalkEstimate {
  straight_line_m: number;
  approx_distance_m: number;
  approx_walk_minutes: number;
}

/** Haversine distance x path factor, at a normal walking pace. */
export function estimateWalk(from: Building, to: Building): WalkEstimate {
  const straight = haversineMeters(from, to);
  const distance = straight * PATH_FACTOR;
  return {
    straight_line_m: Math.round(straight),
    approx_distance_m: Math.round(distance),
    approx_walk_minutes: Math.round((distance / WALK_SPEED_M_PER_MIN) * 10) / 10,
  };
}
