const nodeKey = (x, y) => `${Math.round(x)},${Math.round(y)}`;

export function createStreetGraph() {
  const segments = [];
  const connections = {};
  const addPath = (points) => {
    for (let index = 1; index < points.length; index += 1) {
      const [x1, y1] = points[index - 1];
      const [x2, y2] = points[index];
      const middle = [(x1 + x2) / 2, (y1 + y2) / 2];
      [[x1, y1, middle[0], middle[1]], [middle[0], middle[1], x2, y2]].forEach((segment) => {
        const start = nodeKey(segment[0], segment[1]);
        const end = nodeKey(segment[2], segment[3]);
        const index = segments.push(segment) - 1;
        (connections[start] ||= []).push([end, index]);
        (connections[end] ||= []).push([start, index]);
      });
    }
  };

  [110, 260, 410].forEach((y) => addPath([[30, y], [170, y], [400, y], [630, y], [770, y]]));
  [170, 400, 630].forEach((x) => addPath([[x, 30], [x, 110], [x, 260], [x, 410], [x, 490]]));
  addPath([[170, 260], [400, 110]]);
  return { segments, connections };
}

export function nearestStreetNode(point, connections) {
  return Object.keys(connections).reduce((nearest, key) => {
    const [x, y] = key.split(',').map(Number);
    const distance = Math.hypot(x - point.x, y - point.y);
    return distance < nearest.distance ? { distance, key } : nearest;
  }, { distance: Infinity, key: null }).key;
}

export function segmentLengthMeters(segments, index) {
  const [x1, y1, x2, y2] = segments[index];
  return Math.hypot(x2 - x1, y2 - y1) * 2.5;
}
