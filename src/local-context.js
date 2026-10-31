const RADIUS_METERS = 1500;
const MAX_PLACES = 45;
const MAX_ACCESS_FEATURES = 45;

const FACILITY_LABELS = {
  hospital: 'Hospital',
  clinic: 'Clinic',
  doctors: 'Doctor',
  pharmacy: 'Pharmacy',
  bus_station: 'Bus station',
  marketplace: 'Market',
  community_centre: 'Community centre',
  library: 'Library',
  toilets: 'Public toilet',
  public_building: 'Public building',
};

function distanceMeters(a, b) {
  const dy = (a.lat - b.lat) * 111320;
  const dx = (a.lon - b.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

function localFeature(element, center) {
  const tags = element.tags || {};
  const point = element.center || element;
  const lat = Number(point.lat);
  const lon = Number(point.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const isSteps = tags.highway === 'steps';
  const hasKerb = tags.barrier === 'kerb' || Object.hasOwn(tags, 'kerb');
  const isCrossing = tags.highway === 'crossing';
  const wheelchair = ['yes', 'no', 'limited'].includes(tags.wheelchair)
    ? tags.wheelchair
    : '';
  const isAccess = isSteps || hasKerb || isCrossing || Boolean(wheelchair);
  const isTransit = tags.amenity === 'bus_station'
    || tags.highway === 'bus_stop'
    || tags.public_transport === 'platform';
  const facility = FACILITY_LABELS[tags.amenity];
  const name = tags.name || tags['name:en'] || tags.ref || '';

  if (!isAccess && !isTransit && !facility) return null;

  let label = isSteps ? 'Mapped steps' : hasKerb ? 'Mapped kerb detail' : isCrossing ? 'Mapped crossing' : '';
  if (!label && wheelchair) label = `Wheelchair access tagged: ${wheelchair}`;
  if (!label) label = isTransit ? (tags.highway === 'bus_stop' || tags.amenity === 'bus_station' ? 'Transit stop' : 'Transit platform') : facility;

  const notes = [];
  if (isSteps) notes.push('OpenStreetMap maps steps at this feature. Check the street condition in person.');
  if (hasKerb) {
    const kerbValue = tags.kerb || '';
    notes.push(kerbValue
      ? `Mapped kerb detail: ${kerbValue}. The actual crossing condition needs an on-site check.`
      : 'OpenStreetMap maps a kerb here. The actual crossing condition needs an on-site check.');
  }
  if (isCrossing) notes.push('OpenStreetMap maps a crossing here; this does not confirm a usable curb ramp or accessible signal.');
  if (wheelchair) notes.push(`Wheelchair access tag: ${wheelchair}. This is a community map tag, not an accessibility inspection.`);
  if (!notes.length) notes.push('Nearby real-world destination from OpenStreetMap.');

  return {
    id: `${element.type}-${element.id}`,
    osmType: element.type,
    osmId: element.id,
    lat,
    lon,
    name: name || label,
    label,
    kind: isAccess ? 'access' : isTransit ? 'transit' : 'place',
    notes,
    distance: distanceMeters(center, { lat, lon }),
  };
}

export function buildLocalContextQuery(center) {
  // Round to roughly 100 m before sending the search center to the public API.
  const lat = Number(Number(center.lat).toFixed(3));
  const lon = Number(Number(center.lng ?? center.lon).toFixed(3));
  const latDelta = RADIUS_METERS / 111320;
  const lonDelta = RADIUS_METERS / (111320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  const south = (lat - latDelta).toFixed(4);
  const west = (lon - lonDelta).toFixed(4);
  const north = (lat + latDelta).toFixed(4);
  const east = (lon + lonDelta).toFixed(4);
  const bounds = `(${south},${west},${north},${east})`;
  return `[out:json][timeout:10];(
 nwr${bounds}["amenity"~"^(hospital|clinic|doctors|pharmacy|bus_station|marketplace|community_centre|library|toilets|public_building)$"];
 nwr${bounds}["highway"~"^(bus_stop|crossing|steps)$"];
 nwr${bounds}["public_transport"="platform"];
 nwr${bounds}["barrier"="kerb"];
 node${bounds}["kerb"];
 nwr${bounds}["amenity"~"^(hospital|clinic|doctors|pharmacy|bus_station|marketplace|community_centre|library|toilets|public_building)$"]["wheelchair"~"^(yes|no|limited)$"];
);out center tags 500;`;
}

export function parseLocalContext(elements, center) {
  const features = (Array.isArray(elements) ? elements : [])
    .map((element) => localFeature(element, center))
    .filter((feature) => feature && feature.distance <= RADIUS_METERS)
    .sort((a, b) => a.distance - b.distance);

  const access = features.filter((feature) => feature.kind === 'access').slice(0, MAX_ACCESS_FEATURES);
  const places = features.filter((feature) => feature.kind !== 'access').slice(0, MAX_PLACES);
  return [...places, ...access].sort((a, b) => a.distance - b.distance);
}

export async function fetchLocalContext(center) {
  const query = buildLocalContextQuery(center);
  let lastError;

  for (const endpoint of [
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ]) {
    try {
      const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      });
      if (response.status === 406 || response.status === 429) {
        throw new Error('OpenStreetMap is busy. Wait a little and retry.');
      }
      if (!response.ok) throw new Error(`OpenStreetMap lookup returned ${response.status}.`);
      const payload = await response.json();
      if (payload.remark) throw new Error('OpenStreetMap could not finish this nearby-data lookup. Try again shortly.');
      return {
        features: parseLocalContext(payload.elements, center),
        timestamp: payload.osm3s?.timestamp_osm_base || '',
      };
    } catch (error) {
      lastError = error;
      if (/busy|406|429/i.test(error.message || '')) break;
    }
  }

  if (lastError?.name === 'TimeoutError' || /timed out|signal timed out/i.test(lastError?.message || '')) {
    throw new Error('Nearby OpenStreetMap servers timed out. Wait a moment and retry.');
  }
  if (/failed to fetch|network/i.test(lastError?.message || '')) {
    throw new Error('Could not reach OpenStreetMap. Check the connection and retry.');
  }
  throw lastError || new Error('Nearby OpenStreetMap data is temporarily unavailable.');
}
