import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  Building2,
  Church,
  Eye,
  Home,
  Info,
  Layers,
  LockKeyhole,
  Map as MapIcon,
  MapPin,
  MousePointer2,
  Navigation,
  Network,
  Radar,
  RefreshCcw,
  RotateCcw,
  RotateCw,
  Search,
  Shield,
  Tags,
  Users,
  ZoomIn
} from 'lucide-react';
import './SubdivisionMap3D.css';

const LAYERS = Object.freeze({
  overview: { label: 'Overview', icon: Layers },
  security: { label: 'Security', icon: Shield },
  facilities: { label: 'Facilities', icon: Building2 },
  residential: { label: 'Residential', icon: Home }
});

const CATEGORY_META = Object.freeze({
  security: { label: 'Security Node', icon: Shield },
  facility: { label: 'Facility Landmark', icon: Building2 },
  residential: { label: 'Residential Area', icon: Home }
});

const LOCATIONS = Object.freeze([
  {
    id: 'main-gate',
    label: 'EcoTrend Entrance / Exit',
    description: 'Primary subdivision entrance and guarded exit connected to San Nicolas Road.',
    point: [0.112, 0.854],
    icon: Shield,
    iconType: 'security',
    color: '#0ea5e9',
    category: 'security',
    layerNote: 'Primary security checkpoint',
    useCase: 'Orient guards, residents, and visitors before logging entry.',
    tags: ['Entrance', 'Exit', 'Guard visibility'],
    height: 28,
    blockSize: [0.062, 0.05]
  },
  {
    id: 'north-sector',
    label: 'Babylon-Canaan Sector',
    description: 'Northern yellow residential sector containing Babylon, Bethel, Canaan, Syal, and Nazareth streets.',
    point: [0.292, 0.168],
    icon: Home,
    iconType: 'residential',
    color: '#d9b600',
    category: 'residential',
    layerNote: 'North residential zone',
    useCase: 'Use the street grid to orient deliveries and visitor directions.',
    tags: ['Babylon St.', 'Canaan St.', 'North zone'],
    height: 18,
    blockSize: [0.046, 0.04]
  },
  {
    id: 'blue-sector',
    label: 'Zion-Galilee Sector',
    description: 'Eastern blue residential sector linked by Zion, Judea, Galilee, Caza, Hebron, Jordan, and Jericho streets.',
    point: [0.595, 0.398],
    icon: Building2,
    iconType: 'residential',
    color: '#38a9dc',
    category: 'residential',
    layerNote: 'East residential zone',
    useCase: 'Reference this sector for patrol routes and address orientation.',
    tags: ['Zion St.', 'Galilee St.', 'Blue zone'],
    height: 18,
    blockSize: [0.046, 0.04]
  },
  {
    id: 'green-sector',
    label: 'Gaza-Jerusalem Sector',
    description: 'Central green residential sector covering Gaza, Eden, Sinai, Israel, Golgotha, and Jerusalem streets.',
    point: [0.372, 0.687],
    icon: Home,
    iconType: 'residential',
    color: '#52b83e',
    category: 'residential',
    layerNote: 'Central residential zone',
    useCase: 'Orient visitors between the main gate, court, and residential streets.',
    tags: ['Jerusalem St.', 'Golgotha St.', 'Green zone'],
    height: 18,
    blockSize: [0.046, 0.04]
  },
  {
    id: 'south-sector',
    label: 'Bethany Extension',
    description: 'Southern pink extension served by Bethany, Persia, Samaria, and Olana streets.',
    point: [0.812, 0.857],
    icon: Building2,
    iconType: 'residential',
    color: '#e86786',
    category: 'residential',
    layerNote: 'South residential extension',
    useCase: 'Use the extension roads for resident and service routing.',
    tags: ['Bethany St.', 'Samaria St.', 'South zone'],
    height: 18,
    blockSize: [0.046, 0.04]
  },
  {
    id: 'chapel',
    label: 'EcoTrend Chapel',
    description: 'Community chapel landmark beside the Jericho and Judea corridor.',
    point: [0.735, 0.352],
    icon: Church,
    iconType: 'chapel',
    color: '#8b5cf6',
    category: 'facility',
    layerNote: 'Community facility',
    useCase: 'Guide residents and visitors to community activities.',
    tags: ['Chapel', 'Landmark', 'Community'],
    height: 27,
    blockSize: [0.07, 0.055]
  },
  {
    id: 'multi-purpose-court',
    label: 'Multi-purpose Court',
    description: 'Open recreation court within the Gaza-Jerusalem residential sector.',
    point: [0.372, 0.709],
    icon: MapPin,
    iconType: 'court',
    color: '#f97316',
    category: 'facility',
    layerNote: 'Recreation facility',
    useCase: 'Locate approved events and community recreation activities.',
    tags: ['Court', 'Events', 'Recreation'],
    height: 8,
    blockSize: [0.09, 0.06]
  }
]);

const ROADS = Object.freeze([
  { name: 'Babylon St.', points: [[0.164, 0.116], [0.330, 0.077]], width: 7, color: '#475569' },
  { name: 'Bartyon St.', points: [[0.320, 0.066], [0.394, 0.048]], width: 6, color: '#64748b' },
  { name: 'Bethel St.', points: [[0.170, 0.168], [0.329, 0.138]], width: 7, color: '#64748b' },
  { name: 'Syal St.', points: [[0.325, 0.078], [0.345, 0.261]], width: 7, color: '#64748b' },
  { name: 'Nazareth St.', points: [[0.403, 0.054], [0.450, 0.241]], width: 7, color: '#64748b' },
  { name: 'Canaan St.', points: [[0.230, 0.267], [0.450, 0.241]], width: 7, color: '#475569' },
  { name: 'Egypt St.', points: [[0.155, 0.120], [0.146, 0.190], [0.230, 0.267]], width: 7, color: '#64748b' },
  { name: 'Jordan St.', points: [[0.352, 0.279], [0.360, 0.508]], width: 9, color: '#475569' },
  { name: 'Zion St.', points: [[0.370, 0.320], [0.692, 0.254]], width: 8, color: '#475569' },
  { name: 'Judea St.', points: [[0.410, 0.393], [0.755, 0.328]], width: 8, color: '#64748b' },
  { name: 'Galilee St.', points: [[0.445, 0.463], [0.785, 0.393]], width: 8, color: '#475569' },
  { name: 'Caza St.', points: [[0.480, 0.533], [0.795, 0.467]], width: 8, color: '#64748b' },
  { name: 'Hebron St.', points: [[0.615, 0.555], [0.840, 0.512]], width: 8, color: '#475569' },
  { name: 'Jericho St.', points: [[0.720, 0.250], [0.795, 0.508]], width: 9, color: '#475569' },
  { name: 'Gaza St.', points: [[0.178, 0.602], [0.425, 0.525]], width: 8, color: '#475569' },
  { name: 'Bethlehem St.', points: [[0.468, 0.529], [0.620, 0.697]], width: 9, color: '#64748b' },
  { name: 'Eden St.', points: [[0.302, 0.608], [0.455, 0.754]], width: 8, color: '#64748b' },
  { name: 'Sinai St.', points: [[0.210, 0.643], [0.260, 0.758]], width: 8, color: '#64748b' },
  { name: 'Israel St.', points: [[0.132, 0.672], [0.160, 0.791]], width: 8, color: '#475569' },
  { name: 'Golgotha St.', points: [[0.342, 0.738], [0.535, 0.672]], width: 8, color: '#64748b' },
  { name: 'Jerusalem St.', points: [[0.210, 0.844], [0.570, 0.746]], width: 9, color: '#475569' },
  { name: 'Bethany St.', points: [[0.625, 0.715], [0.790, 0.885]], width: 9, color: '#475569' },
  { name: 'Persia St.', points: [[0.755, 0.838], [0.930, 0.791]], width: 8, color: '#64748b' },
  { name: 'Samaria St.', points: [[0.778, 0.903], [0.965, 0.857]], width: 8, color: '#475569' },
  { name: 'Olana St.', points: [[0.932, 0.792], [0.992, 0.861]], width: 8, color: '#64748b' }
]);

const ZONES = Object.freeze([
  {
    id: 'north',
    name: 'Babylon-Canaan',
    category: 'residential',
    color: '#f4e04d',
    houseColor: '#e8a45c',
    points: [[0.120, 0.078], [0.425, 0.010], [0.488, 0.264], [0.365, 0.295], [0.335, 0.264], [0.230, 0.285], [0.140, 0.195]]
  },
  {
    id: 'blue',
    name: 'Zion-Galilee',
    category: 'residential',
    color: '#91d5f2',
    houseColor: '#79a9d1',
    points: [[0.360, 0.262], [0.690, 0.189], [0.840, 0.502], [0.558, 0.589], [0.446, 0.525], [0.300, 0.577], [0.270, 0.352]]
  },
  {
    id: 'green',
    name: 'Gaza-Jerusalem',
    category: 'residential',
    color: '#a7ed7b',
    houseColor: '#d18b5c',
    points: [[0.270, 0.525], [0.505, 0.492], [0.650, 0.709], [0.455, 0.851], [0.145, 0.780], [0.075, 0.672]]
  },
  {
    id: 'south',
    name: 'Bethany Extension',
    category: 'residential',
    color: '#f5a5b7',
    houseColor: '#c98575',
    points: [[0.620, 0.713], [0.790, 0.795], [0.940, 0.766], [1.000, 0.889], [0.830, 0.971], [0.640, 0.828]]
  }
]);

const VEHICLES = Object.freeze([
  [[0.225, 0.822], '#e53935'],
  [[0.373, 0.320], '#ffffff'],
  [[0.640, 0.405], '#2f80ed'],
  [[0.535, 0.672], '#f2c94c'],
  [[0.790, 0.885], '#202a35']
]);

const FEATURE_TREES = Object.freeze([
  [0.100, 0.830],
  [0.130, 0.825],
  [0.165, 0.815],
  [0.680, 0.330],
  [0.775, 0.355],
  [0.325, 0.690],
  [0.420, 0.730]
]);

const layerMatches = (layer, category) => layer === 'overview' || (
  (layer === 'security' && category === 'security') ||
  (layer === 'facilities' && category === 'facility') ||
  (layer === 'residential' && category === 'residential')
);

const hexToRgb = (hex) => {
  const clean = String(hex).replace('#', '');
  const normalized = clean.length === 3
    ? clean.split('').map((character) => character + character).join('')
    : clean;
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
};

const colorWithAlpha = (color, alpha = 1) => {
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const mixColor = (first, second, amount) => {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  const channel = (start, end) => Math.round(start + (end - start) * amount);
  const toHex = (value) => value.toString(16).padStart(2, '0');
  return `#${toHex(channel(a.r, b.r))}${toHex(channel(a.g, b.g))}${toHex(channel(a.b, b.b))}`;
};

const roundedRect = (context, x, y, width, height, radius) => {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
};

const polygonPath = (context, points) => {
  if (!points.length) return;
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([x, y]) => context.lineTo(x, y));
  context.closePath();
};

const noise = (seed) => {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
};

const pointInPolygon = (point, polygon) => {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects = ((currentPoint[1] > point[1]) !== (previousPoint[1] > point[1])) &&
      (point[0] < ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1])) /
        (previousPoint[1] - currentPoint[1]) + currentPoint[0]);
    if (intersects) inside = !inside;
  }
  return inside;
};

const distance = (first, second) => Math.hypot(first[0] - second[0], first[1] - second[1]);

const distanceToSegment = (point, start, end) => {
  const segment = [end[0] - start[0], end[1] - start[1]];
  const lengthSquared = segment[0] * segment[0] + segment[1] * segment[1];
  if (lengthSquared === 0) return distance(point, start);
  const projection = (
    (point[0] - start[0]) * segment[0] +
    (point[1] - start[1]) * segment[1]
  ) / lengthSquared;
  const amount = Math.max(0, Math.min(1, projection));
  return distance(point, [
    start[0] + segment[0] * amount,
    start[1] + segment[1] * amount
  ]);
};

const distanceToRoads = (point) => {
  let closest = Number.POSITIVE_INFINITY;
  ROADS.forEach((road) => {
    for (let index = 0; index < road.points.length - 1; index += 1) {
      closest = Math.min(closest, distanceToSegment(point, road.points[index], road.points[index + 1]));
    }
  });
  return closest;
};

const nearLandmark = (point) => LOCATIONS.some(
  (location) => location.category !== 'residential' && distance(point, location.point) < 0.065
);

const createProjector = (width, height, zoom, rotation) => {
  const center = [width / 2, height * 0.58];
  const cosValue = Math.cos(rotation);
  const sinValue = Math.sin(rotation);
  const scale = Math.min(width, height) * 0.98 * zoom;

  return (point) => {
    const dx = point[0] - 0.5;
    const dy = point[1] - 0.5;
    const rotatedX = dx * cosValue - dy * sinValue;
    const rotatedY = dx * sinValue + dy * cosValue;
    const isoX = (rotatedX - rotatedY) * scale * 0.92;
    const isoY = (rotatedX + rotatedY) * scale * 0.48;
    return [center[0] + isoX, center[1] + isoY];
  };
};

const drawBlock = (context, project, {
  center,
  width,
  depth,
  height,
  color,
  alpha
}) => {
  const base = [
    project([center[0] - width / 2, center[1] - depth / 2]),
    project([center[0] + width / 2, center[1] - depth / 2]),
    project([center[0] + width / 2, center[1] + depth / 2]),
    project([center[0] - width / 2, center[1] + depth / 2])
  ];
  const roof = base.map(([x, y]) => [x, y - height]);

  polygonPath(context, base.map(([x, y]) => [x + 4, y + 8]));
  context.fillStyle = `rgba(0, 0, 0, ${0.16 * alpha})`;
  context.fill();

  polygonPath(context, [base[1], base[2], roof[2], roof[1]]);
  context.fillStyle = colorWithAlpha(mixColor(color, '#000000', 0.24), alpha);
  context.fill();

  polygonPath(context, [base[2], base[3], roof[3], roof[2]]);
  context.fillStyle = colorWithAlpha(mixColor(color, '#000000', 0.12), alpha);
  context.fill();

  polygonPath(context, [base[0], base[1], roof[1], roof[0]]);
  context.fillStyle = colorWithAlpha(mixColor(color, '#ffffff', 0.05), alpha);
  context.fill();

  polygonPath(context, roof);
  context.fillStyle = colorWithAlpha(mixColor(color, '#ffffff', 0.18), alpha);
  context.fill();
  context.strokeStyle = `rgba(255, 255, 255, ${0.36 * alpha})`;
  context.lineWidth = 1;
  context.stroke();
};

const drawPinIcon = (context, center, type, size) => {
  const [x, y] = center;
  context.save();
  context.strokeStyle = '#ffffff';
  context.fillStyle = '#ffffff';
  context.lineWidth = Math.max(1.4, size * 0.12);
  context.lineCap = 'round';
  context.lineJoin = 'round';

  if (type === 'security') {
    context.beginPath();
    context.moveTo(x, y - size * 0.48);
    context.lineTo(x + size * 0.38, y - size * 0.28);
    context.lineTo(x + size * 0.29, y + size * 0.28);
    context.quadraticCurveTo(x, y + size * 0.55, x - size * 0.29, y + size * 0.28);
    context.lineTo(x - size * 0.38, y - size * 0.28);
    context.closePath();
    context.stroke();
  } else if (type === 'chapel') {
    context.strokeRect(x - size * 0.31, y - size * 0.05, size * 0.62, size * 0.48);
    context.beginPath();
    context.moveTo(x - size * 0.4, y - size * 0.05);
    context.lineTo(x, y - size * 0.36);
    context.lineTo(x + size * 0.4, y - size * 0.05);
    context.moveTo(x, y - size * 0.56);
    context.lineTo(x, y - size * 0.2);
    context.moveTo(x - size * 0.15, y - size * 0.42);
    context.lineTo(x + size * 0.15, y - size * 0.42);
    context.stroke();
  } else if (type === 'court') {
    context.beginPath();
    context.arc(x, y, size * 0.38, 0, Math.PI * 2);
    context.moveTo(x - size * 0.38, y);
    context.lineTo(x + size * 0.38, y);
    context.moveTo(x, y - size * 0.38);
    context.bezierCurveTo(x - size * 0.2, y - size * 0.18, x - size * 0.2, y + size * 0.18, x, y + size * 0.38);
    context.stroke();
  } else {
    context.beginPath();
    context.moveTo(x - size * 0.43, y - size * 0.02);
    context.lineTo(x, y - size * 0.4);
    context.lineTo(x + size * 0.43, y - size * 0.02);
    context.lineTo(x + size * 0.34, y - size * 0.02);
    context.lineTo(x + size * 0.34, y + size * 0.38);
    context.lineTo(x - size * 0.34, y + size * 0.38);
    context.lineTo(x - size * 0.34, y - size * 0.02);
    context.closePath();
    context.stroke();
  }
  context.restore();
};

const drawSubdivisionMap = (context, width, height, options) => {
  const { layer, zoom, rotation, showLabels, selectedId } = options;
  const project = createProjector(width, height, zoom, rotation);
  context.clearRect(0, 0, width, height);

  const background = context.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, '#0d1b2a');
  background.addColorStop(0.52, '#143d33');
  background.addColorStop(1, '#ecfdf5');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  const skyGlow = context.createRadialGradient(
    width * 0.5,
    height * 0.18,
    0,
    width * 0.5,
    height * 0.18,
    width * 0.48
  );
  skyGlow.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
  skyGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.save();
  context.scale(1, 0.58);
  context.fillStyle = skyGlow;
  context.beginPath();
  context.arc(width * 0.5, (height * 0.18) / 0.58, width * 0.48, 0, Math.PI * 2);
  context.fill();
  context.restore();

  const groundCorners = [
    project([0.025, -0.025]),
    project([1.035, -0.025]),
    project([1.035, 1.015]),
    project([0.025, 1.015])
  ];
  polygonPath(context, groundCorners.map(([x, y]) => [x, y + 16]));
  context.fillStyle = 'rgba(0, 0, 0, 0.22)';
  context.fill();

  polygonPath(context, groundCorners);
  const groundGradient = context.createLinearGradient(0, 0, width, height);
  groundGradient.addColorStop(0, '#b9d9ad');
  groundGradient.addColorStop(1, '#5f9a70');
  context.fillStyle = groundGradient;
  context.fill();
  context.strokeStyle = 'rgba(255, 255, 255, 0.48)';
  context.lineWidth = 2;
  context.stroke();

  context.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  context.lineWidth = 1;
  for (let index = 1; index < 11; index += 1) {
    const x = index * 0.1;
    const start = project([x, 0]);
    const end = project([x, 1]);
    context.beginPath();
    context.moveTo(...start);
    context.lineTo(...end);
    context.stroke();
  }
  for (let index = 1; index < 10; index += 1) {
    const y = index * 0.1;
    const start = project([0, y]);
    const end = project([1, y]);
    context.beginPath();
    context.moveTo(...start);
    context.lineTo(...end);
    context.stroke();
  }

  ZONES.forEach((zone) => {
    const active = layerMatches(layer, zone.category);
    polygonPath(context, zone.points.map(project));
    context.fillStyle = colorWithAlpha(zone.color, active ? 0.2 : 0.06);
    context.fill();
    context.strokeStyle = colorWithAlpha(zone.color, active ? 0.62 : 0.22);
    context.lineWidth = active ? 2 : 1;
    context.stroke();
  });

  const houses = [];
  ZONES.forEach((zone, zoneIndex) => {
    const xs = zone.points.map((point) => point[0]);
    const ys = zone.points.map((point) => point[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    let houseIndex = 0;

    for (let y = minY + 0.025; y < maxY; y += 0.035) {
      for (let x = minX + 0.025; x < maxX; x += 0.039) {
        const jitterX = (noise(zoneIndex * 1000 + houseIndex) - 0.5) * 0.01;
        const jitterY = (noise(zoneIndex * 1700 + houseIndex + 7) - 0.5) * 0.008;
        const center = [x + jitterX, y + jitterY];
        houseIndex += 1;
        if (
          !pointInPolygon(center, zone.points) ||
          distanceToRoads(center) < 0.026 ||
          nearLandmark(center)
        ) {
          continue;
        }
        houses.push({
          center,
          color: zone.houseColor,
          height: 7 + noise(houseIndex * 31 + zoneIndex) * 6,
          variant: (houseIndex + zoneIndex) % 4
        });
      }
    }
  });

  houses.sort((first, second) => project(first.center)[1] - project(second.center)[1]);
  const residentialActive = layerMatches(layer, 'residential');
  houses.forEach((house) => {
    const alpha = residentialActive ? 0.96 : 0.34;
    const houseWidth = house.variant % 2 === 0 ? 0.023 : 0.020;
    const houseDepth = house.variant === 3 ? 0.022 : 0.018;
    const wallColor = mixColor(house.color, '#fff4da', house.variant * 0.08);
    drawBlock(context, project, {
      center: house.center,
      width: houseWidth,
      depth: houseDepth,
      height: house.height,
      color: wallColor,
      alpha
    });

    const roofCenter = project(house.center);
    roofCenter[1] -= house.height;
    const roofWidth = 5.5 + houseWidth * 40;
    polygonPath(context, [
      [roofCenter[0], roofCenter[1] - 3.5],
      [roofCenter[0] + roofWidth, roofCenter[1] + 1.5],
      [roofCenter[0], roofCenter[1] + 4],
      [roofCenter[0] - roofWidth, roofCenter[1] - 1]
    ]);
    context.fillStyle = colorWithAlpha(['#b34a3c', '#46647b', '#6c513b', '#4d7654'][house.variant], alpha);
    context.fill();
    context.fillStyle = colorWithAlpha('#ffe6a5', alpha);
    context.beginPath();
    context.arc(roofCenter[0] + 1.5, roofCenter[1] + 5, 1.2, 0, Math.PI * 2);
    context.fill();
  });

  ROADS.forEach((road, roadIndex) => {
    const active = layer === 'overview' || layer === 'security';
    const points = road.points.map(project);
    context.beginPath();
    context.moveTo(...points[0]);
    points.slice(1).forEach((point) => context.lineTo(...point));
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = 'rgba(0, 0, 0, 0.22)';
    context.lineWidth = road.width + 7;
    context.stroke();
    context.strokeStyle = colorWithAlpha(road.color, active ? 0.94 : 0.34);
    context.lineWidth = road.width;
    context.stroke();
    context.strokeStyle = `rgba(255, 255, 255, ${active ? 0.46 : 0.16})`;
    context.lineWidth = 1.4;
    context.stroke();

    const shouldLabel = (width >= 520 && roadIndex % 2 === 0) || road.width >= 9;
    if (shouldLabel) {
      const anchor = project(road.points[Math.floor(road.points.length / 2)]);
      context.save();
      context.fillStyle = `rgba(255, 255, 255, ${active ? 0.92 : 0.38})`;
      context.font = `900 ${width < 600 ? 6.5 : 8}px Arial, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.shadowColor = 'rgba(0, 0, 0, 0.88)';
      context.shadowBlur = 2;
      context.fillText(road.name.toUpperCase(), anchor[0], anchor[1] - 10, 90);
      context.restore();
    }
  });

  const landscapeActive = ['overview', 'residential', 'facilities'].includes(layer);
  const treeAlpha = landscapeActive ? 0.92 : 0.32;
  const drawTree = (point, treeHeight, alpha) => {
    const base = project(point);
    const top = [base[0], base[1] - treeHeight];
    context.strokeStyle = colorWithAlpha('#5b3a29', alpha);
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(...base);
    context.lineTo(top[0], top[1] + 3);
    context.stroke();
    context.fillStyle = `rgba(0, 0, 0, ${0.12 * alpha})`;
    context.beginPath();
    context.arc(top[0] + 1.5, top[1] + 1.5, 5.5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = colorWithAlpha('#236a45', alpha);
    context.beginPath();
    context.arc(...top, 5.2, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = colorWithAlpha('#55a867', alpha);
    context.beginPath();
    context.arc(top[0] - 1.5, top[1] - 1.5, 3.4, 0, Math.PI * 2);
    context.fill();
  };

  let treeIndex = 0;
  ZONES.forEach((zone) => {
    zone.points.forEach((start, edge) => {
      const end = zone.points[(edge + 1) % zone.points.length];
      for (let step = 1; step <= 3; step += 1) {
        const amount = step / 4;
        const point = [
          start[0] + (end[0] - start[0]) * amount,
          start[1] + (end[1] - start[1]) * amount
        ];
        if (distanceToRoads(point) > 0.022 && !nearLandmark(point)) {
          drawTree(point, 7 + noise(treeIndex * 13) * 4, treeAlpha);
        }
        treeIndex += 1;
      }
    });
  });
  FEATURE_TREES.forEach((point) => drawTree(point, 9, treeAlpha));

  const vehiclesActive = layer === 'overview' || layer === 'security';
  VEHICLES.forEach(([center, color]) => {
    drawBlock(context, project, {
      center,
      width: 0.022,
      depth: 0.011,
      height: 3.5,
      color,
      alpha: vehiclesActive ? 0.95 : 0.25
    });
  });

  LOCATIONS.filter((location) => location.category === 'facility').forEach((location) => {
    const active = layerMatches(layer, location.category);
    const alpha = active ? 0.95 : 0.38;
    const [blockWidth, blockDepth] = location.blockSize;

    if (location.id === 'multi-purpose-court') {
      const corners = [
        project([location.point[0] - blockWidth / 2, location.point[1] - blockDepth / 2]),
        project([location.point[0] + blockWidth / 2, location.point[1] - blockDepth / 2]),
        project([location.point[0] + blockWidth / 2, location.point[1] + blockDepth / 2]),
        project([location.point[0] - blockWidth / 2, location.point[1] + blockDepth / 2])
      ];
      polygonPath(context, corners.map(([x, y]) => [x, y + 5]));
      context.fillStyle = `rgba(0, 0, 0, ${0.18 * alpha})`;
      context.fill();
      polygonPath(context, corners);
      context.fillStyle = colorWithAlpha('#256d58', alpha);
      context.fill();
      context.strokeStyle = `rgba(255, 255, 255, ${0.85 * alpha})`;
      context.lineWidth = 1.3;
      context.stroke();
      const topMid = [(corners[0][0] + corners[1][0]) / 2, (corners[0][1] + corners[1][1]) / 2];
      const bottomMid = [(corners[3][0] + corners[2][0]) / 2, (corners[3][1] + corners[2][1]) / 2];
      context.strokeStyle = `rgba(255, 255, 255, ${0.75 * alpha})`;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(...topMid);
      context.lineTo(...bottomMid);
      context.stroke();
      context.beginPath();
      context.arc((topMid[0] + bottomMid[0]) / 2, (topMid[1] + bottomMid[1]) / 2, 4, 0, Math.PI * 2);
      context.stroke();
    } else {
      drawBlock(context, project, {
        center: location.point,
        width: blockWidth,
        depth: blockDepth,
        height: location.height,
        color: '#f5e8d0',
        alpha
      });
      const center = project(location.point);
      center[1] -= location.height;
      polygonPath(context, [
        [center[0], center[1] - 11],
        [center[0] + 22, center[1] + 2],
        [center[0], center[1] + 7],
        [center[0] - 22, center[1] - 4]
      ]);
      context.fillStyle = colorWithAlpha('#8d3b35', alpha);
      context.fill();
      context.strokeStyle = colorWithAlpha('#ffd76a', alpha);
      context.lineWidth = 2.2;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(center[0], center[1] - 20);
      context.lineTo(center[0], center[1] - 10);
      context.moveTo(center[0] - 4, center[1] - 16);
      context.lineTo(center[0] + 4, center[1] - 16);
      context.stroke();
    }
  });

  LOCATIONS.filter((location) => location.category === 'security').forEach((location) => {
    const active = layerMatches(layer, location.category);
    const alpha = active ? 0.96 : 0.36;
    const left = [location.point[0] - 0.032, location.point[1] + 0.012];
    const right = [location.point[0] + 0.032, location.point[1] - 0.012];
    [left, right].forEach((pillar) => {
      drawBlock(context, project, {
        center: pillar,
        width: 0.018,
        depth: 0.018,
        height: 24,
        color: '#e8e0d3',
        alpha
      });
    });
    drawBlock(context, project, {
      center: [location.point[0] + 0.052, location.point[1] + 0.022],
      width: 0.042,
      depth: 0.035,
      height: 12,
      color: '#2f6e54',
      alpha
    });
    const leftTop = project(left);
    const rightTop = project(right);
    leftTop[1] -= 22;
    rightTop[1] -= 22;
    context.strokeStyle = colorWithAlpha('#173b2e', alpha);
    context.lineWidth = 8;
    context.lineCap = 'butt';
    context.beginPath();
    context.moveTo(...leftTop);
    context.lineTo(...rightTop);
    context.stroke();
    context.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    context.font = '900 6px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('ECOTREND', (leftTop[0] + rightTop[0]) / 2, (leftTop[1] + rightTop[1]) / 2);
  });

  [...LOCATIONS]
    .sort((first, second) => first.point[1] - second.point[1])
    .forEach((location) => {
      const active = layerMatches(layer, location.category);
      if (!active && layer !== 'overview') return;
      const selected = location.id === selectedId;
      const base = project(location.point);
      const pinTop = [base[0], base[1] - (location.height + 24)];
      const alpha = active ? 1 : 0.48;

      context.strokeStyle = colorWithAlpha(location.color, alpha);
      context.lineWidth = selected ? 3 : 2;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(...base);
      context.lineTo(...pinTop);
      context.stroke();

      context.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      context.beginPath();
      context.arc(...pinTop, selected ? 17 : 14, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = colorWithAlpha(location.color, alpha);
      context.beginPath();
      context.arc(...pinTop, selected ? 13 : 10, 0, Math.PI * 2);
      context.fill();
      drawPinIcon(context, pinTop, location.iconType, selected ? 15 : 12);

      if (selected || (showLabels && active)) {
        context.save();
        const fontSize = selected ? 13 : 11;
        context.font = `900 ${fontSize}px Arial, sans-serif`;
        const textWidth = Math.min(150, context.measureText(location.label).width);
        const labelWidth = textWidth + 18;
        const labelHeight = fontSize + 12;
        let left = pinTop[0] + 12;
        if (left + labelWidth > width - 8) left = pinTop[0] - labelWidth - 12;
        const top = Math.max(8, Math.min(height - labelHeight - 8, pinTop[1] - labelHeight - 8));
        roundedRect(context, left, top, labelWidth, labelHeight, 999);
        context.fillStyle = selected
          ? colorWithAlpha(location.color, alpha)
          : `rgba(255, 255, 255, ${0.88 * alpha})`;
        context.fill();
        context.strokeStyle = selected
          ? `rgba(255, 255, 255, ${0.38 * alpha})`
          : colorWithAlpha(location.color, 0.28 * alpha);
        context.lineWidth = 1;
        context.stroke();
        context.fillStyle = selected ? '#ffffff' : '#10251d';
        context.textAlign = 'left';
        context.textBaseline = 'middle';
        context.fillText(location.label, left + 9, top + labelHeight / 2, textWidth);
        context.restore();
      }
    });

  return { project };
};

const MapCanvas = ({
  layer,
  zoom,
  rotation,
  showLabels,
  selectedLocation,
  onLocationSelected,
  onRotationChanged
}) => {
  const frameRef = useRef(null);
  const canvasRef = useRef(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const dragRef = useRef(null);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame) return;
    const width = Math.max(1, Math.round(frame.clientWidth));
    const height = Math.max(360, Math.round(frame.clientHeight));
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    sizeRef.current = { width, height };
    if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    const context = canvas.getContext('2d');
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    drawSubdivisionMap(context, width, height, {
      layer,
      zoom,
      rotation,
      showLabels,
      selectedId: selectedLocation.id
    });
  }, [layer, rotation, selectedLocation.id, showLabels, zoom]);

  useEffect(() => {
    paint();
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(paint);
    if (frameRef.current) observer?.observe(frameRef.current);
    window.addEventListener('resize', paint);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', paint);
    };
  }, [paint]);

  const nearestLocation = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    const point = [clientX - bounds.left, clientY - bounds.top];
    const { width, height } = sizeRef.current;
    const project = createProjector(width, height, zoom, rotation);
    let nearest = null;
    let nearestDistance = 42;

    LOCATIONS.forEach((location) => {
      if (!layerMatches(layer, location.category)) return;
      const base = project(location.point);
      const top = [base[0], base[1] - (location.height + 24)];
      const currentDistance = Math.min(distance(point, top), distance(point, base));
      if (currentDistance < nearestDistance) {
        nearestDistance = currentDistance;
        nearest = location;
      }
    });
    return nearest;
  }, [layer, rotation, zoom]);

  const handlePointerDown = (event) => {
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      startX: event.clientX,
      startY: event.clientY
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.x;
    if (Math.abs(deltaX) > 0) {
      onRotationChanged((value) => value + deltaX * 0.006);
      drag.x = event.clientX;
    }
  };

  const handlePointerUp = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const movement = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (movement < 7) {
      const location = nearestLocation(event.clientX, event.clientY);
      if (location) onLocationSelected(location.id);
    }
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const SelectedIcon = selectedLocation.icon;
  const compassDegrees = (-rotation - 0.42) * (180 / Math.PI);

  return (
    <div
      ref={frameRef}
      className="smap-canvas-frame"
      role="img"
      aria-label={`Interactive 3D subdivision map. ${LAYERS[layer].label} layer. ${selectedLocation.label} selected.`}
      aria-description="Tap a landmark to select it. Drag horizontally to rotate. Use the zoom control to change scale."
    >
      <canvas
        ref={canvasRef}
        className="smap-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
      />

      <div className="smap-selection-badge" aria-hidden="true">
        <span style={{ color: selectedLocation.color, backgroundColor: `${selectedLocation.color}20` }}>
          <SelectedIcon size={17} />
        </span>
        <div>
          <small>SELECTED</small>
          <strong>{selectedLocation.label}</strong>
        </div>
      </div>

      <div className="smap-compass" aria-hidden="true">
        <b>N</b>
        <Navigation size={26} style={{ transform: `rotate(${compassDegrees}deg)` }} />
        <small>S</small>
      </div>

      <div className="smap-legend" aria-hidden="true">
        <span><i className="security" />Security</span>
        <span><i className="facilities" />Facilities</span>
        <span><i className="residential" /><b className="desktop-label">Residential</b><b className="mobile-label">Homes</b></span>
      </div>

      <div className="smap-gesture-hint" aria-hidden="true">
        <MousePointer2 size={15} />
        <span>Tap to select&nbsp; | &nbsp;Drag horizontally&nbsp; | &nbsp;Use zoom control</span>
      </div>
    </div>
  );
};

const Hero = () => (
  <section className="smap-hero" aria-label="3D Mapped Subdivision Module">
    <div className="smap-hero-orb smap-hero-orb-top" />
    <div className="smap-hero-orb smap-hero-orb-bottom" />
    <div className="smap-hero-intro">
      <span className="smap-hero-kicker">
        <Building2 size={16} />
        3D NAVIGATION MODULE
      </span>
      <h2>3D Mapped Subdivision<br />Module</h2>
      <p>This module provides a visual 3D map of the subdivision for easier navigation and monitoring.</p>
      <div className="smap-role-list" aria-label="Accessible roles">
        <span><Shield size={15} />Admin</span>
        <span><Shield size={15} />Guard</span>
        <span><Home size={15} />Resident</span>
      </div>
      <div className="smap-hero-stats" aria-label="Map statistics">
        <span><strong>11</strong> landmarks</span>
        <span><strong>4</strong> road routes</span>
        <span><strong>3</strong> access roles</span>
      </div>
    </div>
    <div className="smap-hero-benefits">
      <div><span><Users size={18} /></span><strong>Accessible by Admin, Guard, and Resident</strong></div>
      <div><span><Network size={18} /></span><strong>Displays mapped facilities, roads, and key locations.</strong></div>
      <div><span><Radar size={18} /></span><strong>Enhances situational awareness and monitoring</strong></div>
    </div>
  </section>
);

const DetailPanel = ({ location, visibleLocations, onSelect }) => {
  const LocationIcon = location.icon;
  const quickLocations = visibleLocations
    .filter((item) => item.id !== location.id)
    .slice(0, 4);
  const remainingCount = Math.max(0, visibleLocations.length - quickLocations.length - 1);

  return (
    <aside className="smap-detail-panel">
      <div className="smap-detail-eyebrow">
        <span>SELECTED LANDMARK</span>
        <strong style={{ color: location.color, backgroundColor: `${location.color}18` }}>Mapped</strong>
      </div>
      <div className="smap-detail-heading">
        <span style={{ color: location.color, backgroundColor: `${location.color}18` }}>
          <LocationIcon size={25} />
        </span>
        <div>
          <h3>{location.label}</h3>
          <b style={{ color: location.color }}>{CATEGORY_META[location.category].label}</b>
        </div>
      </div>
      <p className="smap-detail-description">{location.description}</p>
      <div className="smap-detail-list">
        <div>
          <Layers size={16} style={{ color: location.color }} />
          <p><span>Layer</span><strong>{location.layerNote}</strong></p>
        </div>
        <div>
          <Eye size={16} style={{ color: location.color }} />
          <p><span>Use case</span><strong>{location.useCase}</strong></p>
        </div>
      </div>
      <div className="smap-tags">
        {location.tags.map((tag) => (
          <span key={tag} style={{ color: location.color, backgroundColor: `${location.color}16` }}>{tag}</span>
        ))}
      </div>
      <div className="smap-privacy-note">
        <LockKeyhole size={18} />
        <span>Private household addresses stay abstracted; the map is intended for community orientation.</span>
      </div>
      {quickLocations.length > 0 && (
        <div className="smap-quick-jump">
          <h4>Quick jump</h4>
          <div>
            {quickLocations.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} type="button" onClick={() => onSelect(item.id)}>
                  <Icon size={16} style={{ color: item.color }} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
          {remainingCount > 0 && <small>+{remainingCount} more in the location finder</small>}
        </div>
      )}
    </aside>
  );
};

const SubdivisionMap3D = ({ role = 'Admin' }) => {
  const [layer, setLayer] = useState('overview');
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(-0.42);
  const [selectedId, setSelectedId] = useState('main-gate');
  const [showLabels, setShowLabels] = useState(true);

  const visibleLocations = useMemo(
    () => LOCATIONS.filter((location) => layerMatches(layer, location.category)),
    [layer]
  );
  const selectedLocation = useMemo(
    () => LOCATIONS.find((location) => location.id === selectedId) || LOCATIONS[0],
    [selectedId]
  );

  const changeLayer = (nextLayer) => {
    const nextVisibleLocations = LOCATIONS.filter(
      (location) => layerMatches(nextLayer, location.category)
    );
    setLayer(nextLayer);
    if (!nextVisibleLocations.some((location) => location.id === selectedId)) {
      setSelectedId(nextVisibleLocations[0]?.id || 'main-gate');
    }
  };

  const resetView = () => {
    setZoom(1);
    setRotation(-0.42);
    setLayer('overview');
    setSelectedId('main-gate');
    setShowLabels(true);
  };

  return (
    <section className="subdivision-map-module" data-viewer-role={role}>
      <Hero />

      <div className="smap-layout">
        <section className="smap-map-panel">
          <header className="smap-panel-header">
            <div className="smap-panel-title">
              <span><MapIcon size={22} /></span>
              <div>
                <h3>Subdivision orientation map</h3>
                <p>Filter a layer, find a landmark, or rotate the view to explore.</p>
              </div>
            </div>
            <strong className="smap-visible-count">{visibleLocations.length} visible</strong>
          </header>

          <div className="smap-primary-controls">
            <div className="smap-tabs" role="tablist" aria-label="Map layers">
              {Object.entries(LAYERS).map(([key, item]) => {
                const Icon = item.icon;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={layer === key}
                    className={layer === key ? 'active' : ''}
                    onClick={() => changeLayer(key)}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            <label className="smap-location-finder">
              <span>Find a mapped location</span>
              <div>
                <Search size={17} />
                <span className="smap-finder-location-icon" style={{ color: selectedLocation.color }}>
                  {React.createElement(selectedLocation.icon, { size: 16 })}
                </span>
                <select value={selectedLocation.id} onChange={(event) => setSelectedId(event.target.value)}>
                  {visibleLocations.map((location) => (
                    <option key={location.id} value={location.id}>{location.label}</option>
                  ))}
                </select>
              </div>
            </label>
          </div>

          <div className="smap-camera-controls">
            <div className="smap-zoom-control">
              <ZoomIn size={18} />
              <span>Zoom {Math.round(zoom * 100)}%</span>
              <input
                type="range"
                min="0.78"
                max="1.34"
                step="0.04"
                value={zoom}
                aria-label="Map zoom"
                onChange={(event) => setZoom(Number(event.target.value))}
              />
            </div>
            <div className="smap-camera-buttons">
              <button type="button" className="tonal" onClick={() => setRotation((value) => value - 0.16)} aria-label="Rotate left" title="Rotate left">
                <RotateCcw size={18} />
              </button>
              <button type="button" className="tonal" onClick={() => setRotation((value) => value + 0.16)} aria-label="Rotate right" title="Rotate right">
                <RotateCw size={18} />
              </button>
              <button type="button" onClick={resetView} aria-label="Reset map view" title="Reset map view">
                <RefreshCcw size={18} />
              </button>
              <button
                type="button"
                className={`smap-label-toggle ${showLabels ? 'active' : ''}`}
                aria-pressed={showLabels}
                onClick={() => setShowLabels((value) => !value)}
              >
                <Tags size={17} />
                <span>Labels</span>
              </button>
            </div>
          </div>

          <MapCanvas
            layer={layer}
            zoom={zoom}
            rotation={rotation}
            showLabels={showLabels}
            selectedLocation={selectedLocation}
            onLocationSelected={setSelectedId}
            onRotationChanged={setRotation}
          />
        </section>

        <DetailPanel
          location={selectedLocation}
          visibleLocations={visibleLocations}
          onSelect={setSelectedId}
        />
      </div>

      <section className="smap-capabilities">
        <header>
          <span>MODULE CAPABILITIES</span>
          <h3>A clearer view for the whole community</h3>
          <p>Designed as a shared visual reference for navigation, coordination, and day-to-day monitoring.</p>
        </header>
        <div className="smap-capability-grid">
          <article>
            <span className="violet"><Users size={22} /></span>
            <div><h4>Role-based access</h4><p>Accessible by Admin, Guard, and Resident for one consistent subdivision reference.</p></div>
          </article>
          <article>
            <span className="green"><MapIcon size={22} /></span>
            <div><h4>Mapped community</h4><p>Displays mapped facilities, roads, and key locations with distinct visual layers.</p></div>
          </article>
          <article>
            <span className="blue"><Radar size={22} /></span>
            <div><h4>Situational awareness</h4><p>Enhances situational awareness and monitoring while keeping private lot details abstracted.</p></div>
          </article>
        </div>
      </section>

      <p className="smap-accessibility-note">
        <Info size={14} />
        Interactive map access is available to {role || 'Admin'}, Guard, and Resident roles.
      </p>
    </section>
  );
};

export default SubdivisionMap3D;
