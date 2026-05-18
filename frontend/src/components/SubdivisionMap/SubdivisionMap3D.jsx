import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Building2,
  CheckCircle2,
  Home,
  Image as ImageIcon,
  Landmark,
  LocateFixed,
  Map as MapIcon,
  RotateCcw,
  RotateCw,
  Shield,
  SlidersHorizontal,
  Trash2,
  Upload
} from 'lucide-react';
import { apiUrl } from '../../utils/api';
import './SubdivisionMap3D.css';

const ZONE_META = {
  overview: { label: 'Overview', icon: MapIcon, color: '#0f766e' },
  security: { label: 'Security', icon: Shield, color: '#0ea5e9' },
  facilities: { label: 'Facilities', icon: Building2, color: '#22c55e' },
  residential: { label: 'Residential', icon: Home, color: '#f97316' }
};

const MODULE_COPY = Object.freeze({
  title: '3D Mapped Subdivision Module',
  description: 'This module provides a visual 3D map of the subdivision for easier navigation and monitoring.',
  access: 'Accessible by Admin, Guard, and Resident',
  mappedContent: 'Displays mapped facilities, roads, and key locations.',
  value: 'Enhances situational awareness and monitoring.'
});

const MAP_SIZE = Object.freeze({ width: 1000, height: 1220 });
const WORLD_SIZE = Object.freeze({ width: 10, depth: 12.2 });
const CUSTOM_TERRAIN_SEGMENTS = 88;
const MIN_CUSTOM_RENDER_TIME_MS = 2200;
const MAX_CUSTOM_MAP_BYTES = 10 * 1024 * 1024;
const DEFAULT_TERRAIN_SETTINGS = Object.freeze({
  elevation: 0.9,
  scale: 100,
  rotation: 0,
  textureOpacity: 100,
  showMarkers: true,
  showMesh: true
});
const LEGACY_MAP_BOUNDS = Object.freeze({ xMin: -5.35, xMax: 5.35, zMin: -3.6, zMax: 3.6 });
const MAP_BOUNDS = Object.freeze({
  xMin: -WORLD_SIZE.width / 2,
  xMax: WORLD_SIZE.width / 2,
  zMin: -WORLD_SIZE.depth / 2,
  zMax: WORLD_SIZE.depth / 2
});

const toWorldPoint = ([x, y], elevation = 0.58) => [
  (x / MAP_SIZE.width - 0.5) * WORLD_SIZE.width,
  elevation,
  (y / MAP_SIZE.height - 0.5) * WORLD_SIZE.depth
];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const wait = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs));

const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatRenderSeconds = (seconds) => `${Math.max(0, seconds).toFixed(1)}s`;

const loadUploadedImage = (source) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The selected image could not be read.'));
    image.src = source;
  });

const buildUploadedMapHeightMap = (image) => {
  const sampleSize = CUSTOM_TERRAIN_SEGMENTS + 1;
  const canvas = document.createElement('canvas');
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    throw new Error('Image processing is unavailable in this browser.');
  }

  context.drawImage(image, 0, 0, sampleSize, sampleSize);
  const pixels = context.getImageData(0, 0, sampleSize, sampleSize).data;
  const heightMap = new Float32Array(sampleSize * sampleSize);

  for (let index = 0; index < heightMap.length; index += 1) {
    const pixelIndex = index * 4;
    const red = pixels[pixelIndex];
    const green = pixels[pixelIndex + 1];
    const blue = pixels[pixelIndex + 2];
    const alpha = pixels[pixelIndex + 3] / 255;
    const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
    const colorRange = (Math.max(red, green, blue) - Math.min(red, green, blue)) / 255;
    const inkDensity = 1 - luminance;
    heightMap[index] = clamp((inkDensity * 0.68 + colorRange * 0.42) * alpha, 0, 1);
  }

  return heightMap;
};

const getUploadedTerrainDimensions = (mapData, scale = 100) => {
  const aspectRatio = mapData?.width && mapData?.height
    ? mapData.width / mapData.height
    : WORLD_SIZE.width / WORLD_SIZE.depth;
  const scaledWidth = WORLD_SIZE.width * (scale / 100);
  const scaledDepth = WORLD_SIZE.depth * (scale / 100);
  const scaledAspectRatio = scaledWidth / scaledDepth;

  if (aspectRatio >= scaledAspectRatio) {
    return {
      width: scaledWidth,
      depth: scaledWidth / aspectRatio
    };
  }

  return {
    width: scaledDepth * aspectRatio,
    depth: scaledDepth
  };
};

const svgPoints = (points) => points.map(([x, y]) => `${x},${y}`).join(' ');

const svgPath = (points) =>
  points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');

const getMapPointStyle = ([x, , z]) => ({
  left: `${((x - MAP_BOUNDS.xMin) / (MAP_BOUNDS.xMax - MAP_BOUNDS.xMin)) * 100}%`,
  top: `${((z - MAP_BOUNDS.zMin) / (MAP_BOUNDS.zMax - MAP_BOUNDS.zMin)) * 100}%`
});

const groupVisibleForLayer = (type, activeLayer) => activeLayer === 'overview' || type === activeLayer;

const VICINITY_ZONES = Object.freeze([
  {
    id: 'north-sector',
    name: 'North Sector',
    type: 'residential',
    color: '#d7cf22',
    points: [[120, 95], [425, 12], [488, 322], [365, 360], [335, 322], [230, 348], [140, 238]],
    grid: { bounds: [88, 0, 500, 370], spacing: 36, rotation: -13, center: [300, 190] }
  },
  {
    id: 'east-sector',
    name: 'Blue Residential Sector',
    type: 'residential',
    color: '#bfe9fb',
    points: [[360, 320], [690, 230], [840, 612], [558, 718], [446, 640], [300, 704], [270, 430]],
    grid: { bounds: [280, 235, 855, 720], spacing: 38, rotation: -13, center: [565, 470] }
  },
  {
    id: 'central-sector',
    name: 'Central Residential Sector',
    type: 'residential',
    color: '#c9f5ac',
    points: [[270, 640], [505, 600], [650, 865], [455, 1038], [145, 952], [75, 820]],
    grid: { bounds: [60, 600, 670, 1045], spacing: 39, rotation: -18, center: [355, 825] }
  },
  {
    id: 'south-sector',
    name: 'South Extension',
    type: 'residential',
    color: '#f4cad5',
    points: [[620, 870], [790, 970], [940, 935], [1000, 1085], [830, 1185], [640, 1010]],
    grid: { bounds: [610, 860, 1010, 1195], spacing: 37, rotation: -33, center: [815, 1035] }
  }
]);

const VICINITY_ROADS = Object.freeze([
  { id: 'babylon', name: 'BABYLON ST.', color: '#c9c31d', width: 28, points: [[164, 142], [330, 94]] },
  { id: 'bartyon', name: 'BARTYON ST.', color: '#c9c31d', width: 24, points: [[320, 80], [394, 58]] },
  { id: 'bethel', name: 'BETHEL ST.', color: '#c9c31d', width: 27, points: [[170, 205], [329, 168]] },
  { id: 'syal', name: 'SYAL ST.', color: '#c9c31d', width: 27, points: [[325, 95], [345, 318]] },
  { id: 'nazareth', name: 'NAZARETH ST.', color: '#c9c31d', width: 28, points: [[403, 66], [450, 294]] },
  { id: 'canaan', name: 'CANAAN ST.', color: '#c9c31d', width: 28, points: [[230, 326], [450, 294]] },
  { id: 'egypt', name: 'EGYPT ST.', color: '#c9c31d', width: 28, points: [[155, 146], [146, 232], [230, 326]] },
  { id: 'jordan', name: 'JORDAN ST.', color: '#9dd8f5', width: 30, points: [[352, 340], [360, 620]] },
  { id: 'zion', name: 'ZION ST.', color: '#9dd8f5', width: 30, points: [[370, 390], [692, 310]] },
  { id: 'judea', name: 'JUDEA ST.', color: '#9dd8f5', width: 30, points: [[410, 480], [755, 400]] },
  { id: 'galilee', name: 'GALILEE ST.', color: '#9dd8f5', width: 30, points: [[445, 565], [785, 480]] },
  { id: 'caza', name: 'CAZA ST.', color: '#9dd8f5', width: 30, points: [[480, 650], [795, 570]] },
  { id: 'hebron', name: 'HEBRON ST.', color: '#9dd8f5', width: 28, points: [[615, 677], [840, 625]] },
  { id: 'jericho', name: 'JERICHO ST.', color: '#9dd8f5', width: 30, points: [[720, 305], [795, 620]] },
  { id: 'gaza', name: 'GAZA ST.', color: '#aee987', width: 30, points: [[178, 735], [425, 640]] },
  { id: 'bethlehem', name: 'BETHLEHEM ST.', color: '#aee987', width: 30, points: [[468, 645], [620, 850]] },
  { id: 'eden', name: 'EDEN ST.', color: '#aee987', width: 28, points: [[302, 742], [455, 920]] },
  { id: 'sinai', name: 'SINAI ST.', color: '#aee987', width: 28, points: [[210, 785], [260, 925]] },
  { id: 'israel', name: 'ISRAEL ST.', color: '#aee987', width: 27, points: [[132, 820], [160, 965]] },
  { id: 'golgotha', name: 'GOLGOTHA ST.', color: '#aee987', width: 30, points: [[342, 900], [535, 820]] },
  { id: 'jerusalem', name: 'JERUSALEM ST.', color: '#aee987', width: 30, points: [[210, 1030], [570, 910]] },
  { id: 'bethany', name: 'BETHANY ST.', color: '#edb3c0', width: 30, points: [[625, 872], [790, 1080]] },
  { id: 'persia', name: 'PERSIA ST.', color: '#edb3c0', width: 28, points: [[755, 1022], [930, 965]] },
  { id: 'samaria', name: 'SAMARIA ST.', color: '#edb3c0', width: 28, points: [[778, 1102], [965, 1045]] },
  { id: 'olana', name: 'OLANA ST.', color: '#edb3c0', width: 26, points: [[932, 966], [992, 1050]] }
]);

const FACILITY_FALLBACK_POSITIONS = [
  toWorldPoint([735, 430], 0.72),
  toWorldPoint([372, 865], 0.72),
  toWorldPoint([520, 575], 0.68),
  toWorldPoint([610, 690], 0.68),
  toWorldPoint([245, 735], 0.68),
  toWorldPoint([790, 1040], 0.68)
];

const BASE_LOCATIONS = [
  {
    id: 'main-gate',
    name: 'Ecotrend Entrance / Exit',
    type: 'security',
    position: toWorldPoint([112, 1042], 0.68),
    color: '#0ea5e9',
    icon: Shield,
    description: 'Primary subdivision entrance and exit connected to San Nicolas Road.',
    layer: 'Security Node',
    useCase: 'Orient guards, residents, and visitors before logging entry or checking road access.',
    tags: ['Entrance', 'Exit', 'Guard visibility']
  },
  {
    id: 'north-sector',
    name: 'Babylon-Canaan Sector',
    type: 'residential',
    position: toWorldPoint([292, 205], 0.58),
    color: '#b8a900',
    icon: Home,
    description: 'Upper residential section covering Babylon, Bethel, Canaan, Syal, Nazareth, and Egypt streets.',
    layer: 'Residential Sector',
    useCase: 'Use as a block-level reference without exposing exact household records.',
    tags: ['Babylon St.', 'Canaan St.', 'Nazareth St.']
  },
  {
    id: 'blue-sector',
    name: 'Zion-Galilee Sector',
    type: 'residential',
    position: toWorldPoint([595, 485], 0.58),
    color: '#0284c7',
    icon: Home,
    description: 'Middle residential section around Zion, Judea, Galilee, Caza, Hebron, Jericho, and Jordan streets.',
    layer: 'Residential Sector',
    useCase: 'Locate streets and landmarks quickly during resident assistance or monitoring.',
    tags: ['Zion St.', 'Galilee St.', 'Jericho St.']
  },
  {
    id: 'green-sector',
    name: 'Gaza-Jerusalem Sector',
    type: 'residential',
    position: toWorldPoint([372, 838], 0.58),
    color: '#16a34a',
    icon: Home,
    description: 'Central residential section around Gaza, Eden, Sinai, Israel, Golgotha, Bethlehem, and Jerusalem streets.',
    layer: 'Residential Sector',
    useCase: 'Find general block direction while preserving resident privacy.',
    tags: ['Gaza St.', 'Golgotha St.', 'Jerusalem St.']
  },
  {
    id: 'south-extension',
    name: 'Bethany Extension',
    type: 'residential',
    position: toWorldPoint([812, 1046], 0.58),
    color: '#db2777',
    icon: Home,
    description: 'Lower extension around Bethany, Persia, Samaria, and Olana streets.',
    layer: 'Residential Sector',
    useCase: 'Support directional assistance for the subdivision extension area.',
    tags: ['Bethany St.', 'Persia St.', 'Samaria St.']
  },
  {
    id: 'chapel-landmark',
    name: 'Chapel',
    type: 'facilities',
    position: toWorldPoint([735, 430], 0.78),
    color: '#0f766e',
    icon: Landmark,
    facilityNameKey: 'chapel',
    description: 'Chapel landmark in the blue residential sector near Jericho Street.',
    layer: 'Facility Landmark',
    useCase: 'Orient prayer meetings, services, and nearby patrol references.',
    tags: ['Chapel', 'Jericho St.', 'Key location']
  },
  {
    id: 'court-landmark',
    name: 'Multi-Purpose Court',
    type: 'facilities',
    position: toWorldPoint([372, 865], 0.78),
    color: '#f97316',
    icon: Building2,
    facilityNameKey: 'multi-purpose court',
    description: 'Community court landmark in the central green sector near Golgotha Street.',
    layer: 'Facility Landmark',
    useCase: 'Locate reservation events, gatherings, and higher-traffic activity zones.',
    tags: ['Court', 'Reservations', 'Golgotha St.']
  }
];

const normalizeMapNumber = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const getFacilityKey = (facility) => String(facility?.name || '').trim().toLowerCase();

const getNamedFacilityPosition = (facility) => {
  const key = getFacilityKey(facility);
  if (key.includes('chapel')) {
    return toWorldPoint([735, 430], 0.78);
  }
  if (key.includes('court') || key.includes('multi-purpose')) {
    return toWorldPoint([372, 865], 0.78);
  }
  return null;
};

const getNamedFacilityIcon = (facility) =>
  getFacilityKey(facility).includes('chapel') ? Landmark : Building2;

const getLegacyFacilityPosition = (facility) => {
  const rawPosition = facility?.mapPosition || facility?.Position || facility?.position;
  if (!rawPosition) return null;

  const legacyX = Number(rawPosition.x);
  const legacyZ = Number(rawPosition.z);
  if (!Number.isFinite(legacyX) || !Number.isFinite(legacyZ)) {
    return null;
  }

  const x = clamp(legacyX, LEGACY_MAP_BOUNDS.xMin, LEGACY_MAP_BOUNDS.xMax);
  const z = clamp(legacyZ, LEGACY_MAP_BOUNDS.zMin, LEGACY_MAP_BOUNDS.zMax);
  const svgX = ((x - LEGACY_MAP_BOUNDS.xMin) / (LEGACY_MAP_BOUNDS.xMax - LEGACY_MAP_BOUNDS.xMin)) * MAP_SIZE.width;
  const svgY = ((z - LEGACY_MAP_BOUNDS.zMin) / (LEGACY_MAP_BOUNDS.zMax - LEGACY_MAP_BOUNDS.zMin)) * MAP_SIZE.height;
  return toWorldPoint([svgX, svgY], normalizeMapNumber(rawPosition.y, 0.68));
};

const getFacilityPosition = (facility, index) =>
  getNamedFacilityPosition(facility) ||
  getLegacyFacilityPosition(facility) ||
  FACILITY_FALLBACK_POSITIONS[index % FACILITY_FALLBACK_POSITIONS.length];

const buildGridLines = ({ bounds, spacing }) => {
  const [xMin, yMin, xMax, yMax] = bounds;
  const lines = [];

  for (let x = xMin; x <= xMax; x += spacing) {
    lines.push({ x1: x, y1: yMin, x2: x, y2: yMax });
  }

  for (let y = yMin; y <= yMax; y += spacing) {
    lines.push({ x1: xMin, y1: y, x2: xMax, y2: y });
  }

  return lines;
};

const createMaterial = (color, options = {}) => new THREE.MeshStandardMaterial({
  color,
  roughness: options.roughness ?? 0.72,
  metalness: options.metalness ?? 0.02,
  transparent: options.transparent ?? false,
  opacity: options.opacity ?? 1,
  side: options.side ?? THREE.FrontSide
});

const createZoneGeometry = (points) => {
  const shape = new THREE.Shape();

  points.forEach((point, index) => {
    const [x, , z] = toWorldPoint(point, 0);
    if (index === 0) {
      shape.moveTo(x, -z);
    } else {
      shape.lineTo(x, -z);
    }
  });

  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
};

const createZoneOutlineGeometry = (points) => {
  const vertices = points.map((point) => {
    const [x, , z] = toWorldPoint(point, 0.08);
    return new THREE.Vector3(x, 0.08, z);
  });
  return new THREE.BufferGeometry().setFromPoints(vertices);
};

const getRoadWorldWidth = (road, multiplier = 1) =>
  Math.max(0.16, ((road.width || 28) / MAP_SIZE.width) * WORLD_SIZE.width * multiplier);

const getRoadCurvePoints = (road, elevation = 0.14) => {
  const points = road.points.map((point) => {
    const [x, , z] = toWorldPoint(point, elevation);
    return new THREE.Vector3(x, elevation, z);
  });

  if (points.length < 2) {
    return points;
  }

  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.08);
  return curve.getPoints(Math.max(18, road.points.length * 16));
};

const getRoadNormalAt = (points, index) => {
  const previous = points[Math.max(0, index - 1)];
  const next = points[Math.min(points.length - 1, index + 1)];
  const tangent = next.clone().sub(previous);
  tangent.y = 0;

  if (tangent.lengthSq() === 0) {
    return new THREE.Vector3(1, 0, 0);
  }

  tangent.normalize();
  return new THREE.Vector3(-tangent.z, 0, tangent.x);
};

const createRoadRibbonGeometry = (road, options = {}) => {
  const points = getRoadCurvePoints(road, options.elevation ?? 0.14);
  const halfWidth = getRoadWorldWidth(road, options.widthMultiplier ?? 1) * 0.5;
  const vertices = [];
  const uvs = [];
  const indices = [];

  points.forEach((point, index) => {
    const normal = getRoadNormalAt(points, index);
    const left = point.clone().addScaledVector(normal, halfWidth);
    const right = point.clone().addScaledVector(normal, -halfWidth);
    vertices.push(left.x, left.y, left.z, right.x, right.y, right.z);
    uvs.push(0, index / Math.max(1, points.length - 1), 1, index / Math.max(1, points.length - 1));

    if (index < points.length - 1) {
      const baseIndex = index * 2;
      indices.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex + 1, baseIndex + 3, baseIndex + 2);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const createRoadLineGeometry = (road, options = {}) => {
  const points = getRoadCurvePoints(road, options.elevation ?? 0.18).map((point, index, roadPoints) => {
    const normal = getRoadNormalAt(roadPoints, index);
    return point.clone().addScaledVector(normal, options.offset ?? 0);
  });

  return new THREE.BufferGeometry().setFromPoints(points);
};

const createUploadedTerrainGeometry = (mapData, terrainSettings) => {
  const { width, depth } = getUploadedTerrainDimensions(mapData, terrainSettings.scale);
  const geometry = new THREE.PlaneGeometry(width, depth, CUSTOM_TERRAIN_SEGMENTS, CUSTOM_TERRAIN_SEGMENTS);
  const positions = geometry.attributes.position;
  const heightMap = mapData.heightMap || [];

  for (let index = 0; index < positions.count; index += 1) {
    const normalizedHeight = Number(heightMap[index]) || 0;
    const easedHeight = Math.pow(normalizedHeight, 1.18) * terrainSettings.elevation;
    positions.setZ(index, easedHeight);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.rotateX(-Math.PI / 2);
  return geometry;
};

const disposeThreeMaterial = (material) => {
  if (!material) return;

  Object.values(material).forEach((value) => {
    if (value?.isTexture) {
      value.dispose();
    }
  });
  material.dispose?.();
};

const SubdivisionMap3D = ({ role = 'Admin' }) => {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const mapGroupRef = useRef(null);
  const fileInputRef = useRef(null);
  const uploadedMapRef = useRef(null);
  const renderJobRef = useRef(null);
  const renderStartRef = useRef(null);
  const markerRefs = useRef([]);
  const animationRef = useRef(null);
  const [activeLayer, setActiveLayer] = useState('overview');
  const [selectedId, setSelectedId] = useState('main-gate');
  const [facilityCatalog, setFacilityCatalog] = useState([]);
  const [facilityLoadState, setFacilityLoadState] = useState('idle');
  const [labels, setLabels] = useState([]);
  const [mapMode, setMapMode] = useState('2d');
  const [zoom, setZoom] = useState(72);
  const [uploadedMap, setUploadedMap] = useState(null);
  const [terrainSettings, setTerrainSettings] = useState(DEFAULT_TERRAIN_SETTINGS);
  const [renderState, setRenderState] = useState({
    status: 'idle',
    progress: 0,
    elapsedSeconds: 0,
    message: 'Upload a 2D map image to render it as an editable 3D model.'
  });

  useEffect(() => {
    uploadedMapRef.current = uploadedMap;
  }, [uploadedMap]);

  useEffect(() => () => {
    if (uploadedMapRef.current?.url) {
      URL.revokeObjectURL(uploadedMapRef.current.url);
    }
  }, []);

  useEffect(() => {
    if (renderState.status !== 'rendering') {
      return undefined;
    }

    const timer = setInterval(() => {
      const elapsedMs = renderStartRef.current ? Date.now() - renderStartRef.current : 0;
      const progress = Math.min(94, Math.round(8 + (elapsedMs / 3200) * 86));
      const message = progress < 34
        ? 'Reading uploaded map image'
        : progress < 62
          ? 'Building 3D height mesh'
          : progress < 86
            ? 'Applying map texture'
            : 'Preparing editable controls';

      setRenderState((current) => {
        if (current.status !== 'rendering') return current;
        return {
          ...current,
          progress,
          elapsedSeconds: elapsedMs / 1000,
          message
        };
      });
    }, 180);

    return () => clearInterval(timer);
  }, [renderState.status]);

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem('token');

    if (!token) {
      return undefined;
    }

    const fetchFacilityCatalog = async () => {
      setFacilityLoadState('loading');

      try {
        const response = await fetch(apiUrl('/facilities/settings'), {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.message || 'Unable to load facility markers.');
        }

        if (!cancelled) {
          setFacilityCatalog(Array.isArray(data.facilities) ? data.facilities : []);
          setFacilityLoadState('ready');
        }
      } catch (error) {
        console.error('Error loading map facility markers:', error);
        if (!cancelled) {
          setFacilityCatalog([]);
          setFacilityLoadState('error');
        }
      }
    };

    fetchFacilityCatalog();
    const interval = setInterval(fetchFacilityCatalog, 30000);
    window.addEventListener('focus', fetchFacilityCatalog);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', fetchFacilityCatalog);
    };
  }, []);

  const dynamicFacilityLocations = useMemo(
    () =>
      facilityCatalog.map((facility, index) => {
        const hourlyRate = Number(facility.hourlyRate) || 0;
        const eventTypes = Array.isArray(facility.eventTypes) ? facility.eventTypes : [];
        const Icon = getNamedFacilityIcon(facility);

        return {
          id: `facility-${facility._id || index}`,
          name: facility.name || `Facility ${index + 1}`,
          type: 'facilities',
          position: getFacilityPosition(facility, index),
          color: hourlyRate > 0 ? '#16a34a' : '#14b8a6',
          icon: Icon,
          description: facility.description || 'Reservable facility maintained from Facility Management.',
          layer: 'Facility Catalog',
          useCase: 'This marker is synced from Facility Management and updates when admins save facility changes.',
          tags: [
            hourlyRate > 0 ? `PHP ${hourlyRate}/hr` : 'Free',
            `${eventTypes.length || 0} event type${eventTypes.length === 1 ? '' : 's'}`,
            'Admin managed'
          ]
        };
      }),
    [facilityCatalog]
  );

  const staticLocations = useMemo(() => {
    const facilityNames = new Set(facilityCatalog.map((facility) => getFacilityKey(facility)));
    return BASE_LOCATIONS.filter((location) => !location.facilityNameKey || !facilityNames.has(location.facilityNameKey));
  }, [facilityCatalog]);

  const locations = useMemo(
    () => [...staticLocations, ...dynamicFacilityLocations],
    [dynamicFacilityLocations, staticLocations]
  );

  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === selectedId) || locations[0],
    [locations, selectedId]
  );

  const selectedMeta = ZONE_META[selectedLocation.type] || ZONE_META.overview;
  const SelectedIcon = selectedLocation.icon || selectedMeta.icon;
  const hasUploadedMap = Boolean(uploadedMap?.url && uploadedMap?.heightMap);

  const updateTerrainSetting = (key, value) => {
    setTerrainSettings((current) => ({
      ...current,
      [key]: value
    }));
  };

  const resetTerrainSettings = () => {
    setTerrainSettings(DEFAULT_TERRAIN_SETTINGS);
  };

  const removeUploadedMap = () => {
    renderJobRef.current = null;
    if (uploadedMapRef.current?.url) {
      URL.revokeObjectURL(uploadedMapRef.current.url);
    }
    uploadedMapRef.current = null;
    setUploadedMap(null);
    resetTerrainSettings();
    setMapMode('2d');
    setRenderState({
      status: 'idle',
      progress: 0,
      elapsedSeconds: 0,
      message: 'Upload a 2D map image to render it as an editable 3D model.'
    });
  };

  const handleMapUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setRenderState({
        status: 'error',
        progress: 0,
        elapsedSeconds: 0,
        message: 'Please upload a PNG, JPG, WEBP, or another browser-readable image.'
      });
      return;
    }

    if (file.size > MAX_CUSTOM_MAP_BYTES) {
      setRenderState({
        status: 'error',
        progress: 0,
        elapsedSeconds: 0,
        message: `The map image must be ${formatFileSize(MAX_CUSTOM_MAP_BYTES)} or smaller.`
      });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const jobId = `${file.name}-${file.lastModified}-${Date.now()}`;
    renderJobRef.current = jobId;
    renderStartRef.current = Date.now();
    setMapMode('3d');
    setRenderState({
      status: 'rendering',
      progress: 8,
      elapsedSeconds: 0,
      message: 'Reading uploaded map image'
    });

    try {
      const image = await loadUploadedImage(objectUrl);
      const heightMap = buildUploadedMapHeightMap(image);
      const elapsedMs = Date.now() - renderStartRef.current;
      await wait(Math.max(0, MIN_CUSTOM_RENDER_TIME_MS - elapsedMs));

      if (renderJobRef.current !== jobId) {
        URL.revokeObjectURL(objectUrl);
        return;
      }

      if (uploadedMapRef.current?.url) {
        URL.revokeObjectURL(uploadedMapRef.current.url);
      }

      const nextMap = {
        id: jobId,
        name: file.name,
        url: objectUrl,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        size: file.size,
        heightMap,
        renderedAt: new Date().toISOString()
      };

      uploadedMapRef.current = nextMap;
      setUploadedMap(nextMap);
      resetTerrainSettings();
      setRenderState({
        status: 'ready',
        progress: 100,
        elapsedSeconds: (Date.now() - renderStartRef.current) / 1000,
        message: '3D map generated and ready to edit.'
      });
    } catch (error) {
      console.error('Error rendering uploaded map image:', error);
      if (renderJobRef.current === jobId) {
        URL.revokeObjectURL(objectUrl);
        setRenderState({
          status: 'error',
          progress: 0,
          elapsedSeconds: (Date.now() - renderStartRef.current) / 1000,
          message: error.message || 'Unable to render this image into a 3D map.'
        });
      }
    }
  };

  const buildScene = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#eef7fb');
    scene.fog = new THREE.Fog('#eef7fb', 12, 24);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 9.2, 8.6);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 7.4;
    controls.maxDistance = 15.5;
    controls.maxPolarAngle = Math.PI * 0.5;
    controls.minPolarAngle = Math.PI * 0.16;
    controls.target.set(0, 0.1, 0);

    const ambient = new THREE.HemisphereLight('#ffffff', '#86efac', 2.4);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight('#ffffff', 2.4);
    keyLight.position.set(-4, 8, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    scene.add(keyLight);

    const fillLight = new THREE.PointLight('#38bdf8', 3.4, 14);
    fillLight.position.set(3, 4, -3);
    scene.add(fillLight);

    const mapGroup = new THREE.Group();
    scene.add(mapGroup);

    if (hasUploadedMap) {
      const terrainDimensions = getUploadedTerrainDimensions(uploadedMap, terrainSettings.scale);
      const terrainBase = new THREE.Mesh(
        new THREE.BoxGeometry(terrainDimensions.width + 0.85, 0.18, terrainDimensions.depth + 0.85),
        createMaterial('#dbeafe', { roughness: 0.78 })
      );
      terrainBase.position.y = -0.15;
      terrainBase.receiveShadow = true;
      mapGroup.add(terrainBase);

      const texture = new THREE.TextureLoader().load(uploadedMap.url);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy?.() || 1, 8);

      const textureOpacity = clamp(terrainSettings.textureOpacity / 100, 0.35, 1);
      const terrain = new THREE.Mesh(
        createUploadedTerrainGeometry(uploadedMap, terrainSettings),
        new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.74,
          metalness: 0.03,
          transparent: textureOpacity < 1,
          opacity: textureOpacity,
          side: THREE.DoubleSide
        })
      );
      terrain.castShadow = true;
      terrain.receiveShadow = true;
      terrain.position.y = 0.02;
      mapGroup.add(terrain);

      const outlineBoxGeometry = new THREE.BoxGeometry(terrainDimensions.width, 0.04, terrainDimensions.depth);
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(outlineBoxGeometry),
        new THREE.LineBasicMaterial({ color: '#0f172a', transparent: true, opacity: 0.28 })
      );
      outlineBoxGeometry.dispose();
      outline.position.y = 0.02;
      mapGroup.add(outline);

      if (terrainSettings.showMesh) {
        const meshOverlay = new THREE.LineSegments(
          new THREE.WireframeGeometry(terrain.geometry),
          new THREE.LineBasicMaterial({ color: '#0f172a', transparent: true, opacity: 0.18 })
        );
        meshOverlay.position.y = 0.025;
        mapGroup.add(meshOverlay);
      }

      mapGroup.rotation.y = THREE.MathUtils.degToRad(terrainSettings.rotation);
    } else {
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(WORLD_SIZE.width + 1.2, 0.12, WORLD_SIZE.depth + 1.2),
        createMaterial('#f8fafc')
      );
      base.position.y = -0.08;
      base.receiveShadow = true;
      mapGroup.add(base);

      VICINITY_ZONES.forEach((zone) => {
        const isActive = groupVisibleForLayer(zone.type, activeLayer);
        const mesh = new THREE.Mesh(
          createZoneGeometry(zone.points),
          createMaterial(zone.color, {
            transparent: true,
            opacity: isActive ? 0.82 : 0.34,
            side: THREE.DoubleSide
          })
        );
        mesh.position.y = 0.02;
        mesh.receiveShadow = true;
        mapGroup.add(mesh);

        const outline = new THREE.LineLoop(
          createZoneOutlineGeometry(zone.points),
          new THREE.LineBasicMaterial({ color: '#111827', transparent: true, opacity: 0.7 })
        );
        mapGroup.add(outline);
      });

      VICINITY_ROADS.forEach((road) => {
        const shoulder = new THREE.Mesh(
          createRoadRibbonGeometry(road, { widthMultiplier: 1.38, elevation: 0.105 }),
          createMaterial('#475569', { roughness: 0.95 })
        );
        shoulder.receiveShadow = true;
        mapGroup.add(shoulder);

        const asphalt = new THREE.Mesh(
          createRoadRibbonGeometry(road, { widthMultiplier: 1, elevation: 0.14 }),
          createMaterial('#2f3437', { roughness: 0.96, metalness: 0 })
        );
        asphalt.receiveShadow = true;
        mapGroup.add(asphalt);

        const curbOffset = getRoadWorldWidth(road, 1) * 0.43;
        [-1, 1].forEach((side) => {
          const edgeLine = new THREE.Line(
            createRoadLineGeometry(road, { offset: curbOffset * side, elevation: 0.172 }),
            new THREE.LineBasicMaterial({ color: '#f8fafc', transparent: true, opacity: 0.84 })
          );
          mapGroup.add(edgeLine);
        });

        const centerLine = new THREE.Line(
          createRoadLineGeometry(road, { elevation: 0.185 }),
          new THREE.LineDashedMaterial({
            color: '#facc15',
            dashSize: 0.18,
            gapSize: 0.13,
            linewidth: 1,
            transparent: true,
            opacity: 0.95
          })
        );
        centerLine.computeLineDistances();
        mapGroup.add(centerLine);
      });
    }

    markerRefs.current = [];
    const shouldShowMapMarkers = !hasUploadedMap || terrainSettings.showMarkers;
    if (shouldShowMapMarkers) {
      locations.forEach((location) => {
        const markerGroup = new THREE.Group();
        markerGroup.position.set(...location.position);

        let landmarkGeometry;
        if (location.type === 'security') {
          landmarkGeometry = new THREE.BoxGeometry(0.46, 0.48, 0.46);
        } else if (location.type === 'residential') {
          landmarkGeometry = new THREE.BoxGeometry(0.38, 0.22, 0.38);
        } else if (getFacilityKey(location).includes('chapel')) {
          landmarkGeometry = new THREE.ConeGeometry(0.32, 0.62, 4);
        } else {
          landmarkGeometry = new THREE.BoxGeometry(0.62, 0.42, 0.52);
        }

        const landmark = new THREE.Mesh(landmarkGeometry, createMaterial(location.color));
        landmark.position.y = 0.12;
        landmark.castShadow = true;
        landmark.userData = { locationId: location.id, type: location.type };
        markerGroup.add(landmark);

        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.24, 0.045, 12, 40),
          createMaterial(location.color)
        );
        ring.position.y = 0.55;
        ring.rotation.x = Math.PI / 2;
        ring.userData = { locationId: location.id, type: location.type };
        markerGroup.add(ring);

        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(0.11, 18, 18),
          createMaterial('#ffffff')
        );
        dot.position.y = 0.56;
        dot.userData = { locationId: location.id, type: location.type };
        markerGroup.add(dot);

        markerRefs.current.push(landmark, ring, dot);
        mapGroup.add(markerGroup);
      });
    }

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    mapGroupRef.current = mapGroup;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(rect.width, 320);
      const height = Math.max(rect.height, 360);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    let lastLabelSignature = '';
    const updateLabels = () => {
      const width = renderer.domElement.clientWidth;
      const height = renderer.domElement.clientHeight;
      const nextLabels = locations.map((location) => {
        const vector = new THREE.Vector3(...location.position);
        vector.y += 0.82;
        mapGroup.localToWorld(vector);
        vector.project(camera);
        return {
          id: location.id,
          name: location.name,
          type: location.type,
          x: (vector.x * 0.5 + 0.5) * width,
          y: (-vector.y * 0.5 + 0.5) * height,
          visible: shouldShowMapMarkers && vector.z < 1 && groupVisibleForLayer(location.type, activeLayer)
        };
      });
      const signature = nextLabels
        .map((label) => `${label.id}:${Math.round(label.x)}:${Math.round(label.y)}:${label.visible ? 1 : 0}`)
        .join('|');

      if (signature !== lastLabelSignature) {
        lastLabelSignature = signature;
        setLabels(nextLabels);
      }
    };

    const animate = () => {
      markerRefs.current.forEach((marker, index) => {
        if (marker.geometry?.type === 'TorusGeometry') {
          marker.rotation.z += 0.012 + index * 0.0003;
        }
      });
      controls.update();
      renderer.render(scene, camera);
      updateLabels();
      animationRef.current = requestAnimationFrame(animate);
    };

    resize();
    animate();
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(resize)
      : null;
    resizeObserver?.observe(container);
    window.addEventListener('resize', resize);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onPointerDown = (event) => {
      const bounds = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(markerRefs.current, false);
      const hitId = hits[0]?.object?.userData?.locationId;
      if (hitId) {
        setSelectedId(hitId);
        setActiveLayer(locations.find((location) => location.id === hitId)?.type || 'overview');
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);

    return () => {
      window.removeEventListener('resize', resize);
      resizeObserver?.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      cancelAnimationFrame(animationRef.current);
      controls.dispose();
      renderer.dispose();
      scene.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => disposeThreeMaterial(material));
        } else {
          disposeThreeMaterial(object.material);
        }
      });
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      mapGroupRef.current = null;
      markerRefs.current = [];
    };
  }, [activeLayer, hasUploadedMap, locations, terrainSettings, uploadedMap]);

  useEffect(() => {
    if (mapMode !== '3d') {
      setLabels([]);
      return undefined;
    }

    return buildScene();
  }, [buildScene, mapMode]);

  useEffect(() => {
    if (mapMode !== '3d') return;

    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const distance = 15.5 - (zoom / 100) * 6.2;
    const direction = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(controls.target.clone().add(direction.multiplyScalar(distance)));
    camera.updateProjectionMatrix();
  }, [mapMode, zoom]);

  useEffect(() => {
    if (mapMode !== '3d') return;

    markerRefs.current.forEach((marker) => {
      const location = locations.find((item) => item.id === marker.userData.locationId);
      const isVisible = location && groupVisibleForLayer(location.type, activeLayer);
      marker.visible = Boolean(isVisible);
      if (marker.material) {
        marker.material.opacity = selectedId === location?.id ? 1 : 0.78;
        marker.material.transparent = selectedId !== location?.id;
      }
    });
  }, [activeLayer, locations, mapMode, selectedId]);

  const rotateMap = (direction) => {
    if (hasUploadedMap) {
      setTerrainSettings((current) => ({
        ...current,
        rotation: clamp(current.rotation + direction * 15, -180, 180)
      }));
      return;
    }

    if (!mapGroupRef.current) return;
    mapGroupRef.current.rotation.y += direction * 0.45;
  };

  const resetView = () => {
    setZoom(72);
    setActiveLayer('overview');
    setSelectedId('main-gate');
    if (hasUploadedMap) {
      resetTerrainSettings();
    }
    if (mapGroupRef.current) {
      mapGroupRef.current.rotation.y = hasUploadedMap ? THREE.MathUtils.degToRad(DEFAULT_TERRAIN_SETTINGS.rotation) : 0;
    }
    if (controlsRef.current && cameraRef.current) {
      cameraRef.current.position.set(0, 9.2, 8.6);
      controlsRef.current.target.set(0, 0.1, 0);
      controlsRef.current.update();
    }
  };

  return (
    <section className="subdivision-map-module" data-viewer-role={role}>
      <header className="smap-header">
        <div>
          <span className="smap-module-kicker">Module</span>
          <h2>{MODULE_COPY.title}</h2>
          <p>{MODULE_COPY.description}</p>
        </div>
        <div className="smap-header-side">
          <div className="smap-view-switch" role="tablist" aria-label="Map view mode">
            <button
              type="button"
              className={`smap-mode-button ${mapMode === '2d' ? 'active' : ''}`}
              onClick={() => setMapMode('2d')}
            >
              <MapIcon size={15} />
              <span>2D Map</span>
            </button>
            <button
              type="button"
              className={`smap-mode-button ${mapMode === '3d' ? 'active' : ''}`}
              onClick={() => setMapMode('3d')}
            >
              <Building2 size={15} />
              <span>3D Map</span>
            </button>
          </div>
          <span className="smap-mode-pill">
            {facilityLoadState === 'error'
              ? 'Facility sync unavailable'
              : `${facilityCatalog.length} synced facilit${facilityCatalog.length === 1 ? 'y' : 'ies'}`}
          </span>
          <button
            type="button"
            className="smap-upload-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={renderState.status === 'rendering'}
          >
            <Upload size={16} />
            <span>{hasUploadedMap ? 'Replace 2D Map' : 'Upload 2D Map'}</span>
          </button>
          <input
            ref={fileInputRef}
            className="smap-upload-input"
            type="file"
            accept="image/*"
            onChange={handleMapUpload}
          />
        </div>
      </header>

      <div className="smap-layout">
        <div className="smap-main">
          <div className="smap-module-brief" aria-label="3D mapped subdivision module details">
            <div>
              <Shield size={17} />
              <span>{MODULE_COPY.access}</span>
            </div>
            <div>
              <MapIcon size={17} />
              <span>{MODULE_COPY.mappedContent}</span>
            </div>
            <div>
              <LocateFixed size={17} />
              <span>{MODULE_COPY.value}</span>
            </div>
          </div>

          <div className="smap-toolbar" aria-label={`${mapMode === '3d' ? '3D' : '2D'} map controls`}>
            <div className="smap-tabs">
              {Object.entries(ZONE_META).map(([key, item]) => {
                const Icon = item.icon;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`smap-tab ${activeLayer === key ? 'active' : ''}`}
                    onClick={() => setActiveLayer(key)}
                  >
                    <Icon size={15} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {mapMode === '3d' && (
              <div className="smap-actions">
                <button type="button" onClick={() => rotateMap(-1)} aria-label="Rotate map left">
                  <RotateCcw size={17} />
                </button>
                <button type="button" onClick={() => rotateMap(1)} aria-label="Rotate map right">
                  <RotateCw size={17} />
                </button>
                <button type="button" onClick={resetView} aria-label="Reset map view">
                  <LocateFixed size={17} />
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  aria-label="Map zoom"
                />
              </div>
            )}
          </div>

          {hasUploadedMap && (
            <div className="smap-upload-editor" aria-label="Uploaded map 3D editor">
              <div className="smap-upload-meta">
                <ImageIcon size={18} />
                <div>
                  <strong>{uploadedMap.name}</strong>
                  <span>
                    {uploadedMap.width} x {uploadedMap.height}px | {formatFileSize(uploadedMap.size)}
                    {renderState.status === 'ready' ? ` | rendered in ${formatRenderSeconds(renderState.elapsedSeconds)}` : ''}
                  </span>
                </div>
                <CheckCircle2 size={18} className="smap-upload-ready-icon" />
              </div>

              <div className="smap-editor-controls">
                <label className="smap-editor-field">
                  <span>Elevation</span>
                  <input
                    type="range"
                    min="0.15"
                    max="1.8"
                    step="0.05"
                    value={terrainSettings.elevation}
                    onChange={(event) => updateTerrainSetting('elevation', Number(event.target.value))}
                  />
                  <strong>{terrainSettings.elevation.toFixed(2)}</strong>
                </label>

                <label className="smap-editor-field">
                  <span>Scale</span>
                  <input
                    type="range"
                    min="70"
                    max="130"
                    step="1"
                    value={terrainSettings.scale}
                    onChange={(event) => updateTerrainSetting('scale', Number(event.target.value))}
                  />
                  <strong>{terrainSettings.scale}%</strong>
                </label>

                <label className="smap-editor-field">
                  <span>Rotation</span>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    value={terrainSettings.rotation}
                    onChange={(event) => updateTerrainSetting('rotation', Number(event.target.value))}
                  />
                  <strong>{terrainSettings.rotation} deg</strong>
                </label>

                <label className="smap-editor-field">
                  <span>Texture</span>
                  <input
                    type="range"
                    min="45"
                    max="100"
                    step="1"
                    value={terrainSettings.textureOpacity}
                    onChange={(event) => updateTerrainSetting('textureOpacity', Number(event.target.value))}
                  />
                  <strong>{terrainSettings.textureOpacity}%</strong>
                </label>
              </div>

              <div className="smap-editor-actions">
                <label className="smap-editor-check">
                  <input
                    type="checkbox"
                    checked={terrainSettings.showMesh}
                    onChange={(event) => updateTerrainSetting('showMesh', event.target.checked)}
                  />
                  <span>Mesh grid</span>
                </label>
                <label className="smap-editor-check">
                  <input
                    type="checkbox"
                    checked={terrainSettings.showMarkers}
                    onChange={(event) => updateTerrainSetting('showMarkers', event.target.checked)}
                  />
                  <span>Map markers</span>
                </label>
                <button type="button" onClick={resetTerrainSettings}>
                  <SlidersHorizontal size={16} />
                  <span>Reset model</span>
                </button>
                <button type="button" className="smap-editor-danger" onClick={removeUploadedMap}>
                  <Trash2 size={16} />
                  <span>Remove upload</span>
                </button>
              </div>
            </div>
          )}

          <div className="smap-map-shell">
            {mapMode === '3d' ? (
              <div className="smap-viewport" ref={containerRef}>
                <canvas
                  ref={canvasRef}
                  className="smap-canvas"
                  aria-label={hasUploadedMap ? 'Interactive generated 3D map from uploaded image' : 'Interactive 3D subdivision map'}
                />
                <div className="smap-label-layer" aria-hidden="true">
                  {labels.map((label) => (
                    <button
                      key={label.id}
                      type="button"
                      className={`smap-label smap-label-${label.type} ${selectedId === label.id ? 'selected' : ''}`}
                      style={{
                        transform: `translate(${label.x}px, ${label.y}px)`,
                        opacity: label.visible ? 1 : 0
                      }}
                      tabIndex={-1}
                    >
                      {label.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="smap-viewport smap-viewport-2d">
                <div className="smap-2d-map" aria-label="Interactive 2D Ecotrend subdivision vicinity map">
                  {hasUploadedMap ? (
                    <>
                      <img className="smap-uploaded-map-image" src={uploadedMap.url} alt={`Uploaded 2D map ${uploadedMap.name}`} />
                      <div className="smap-uploaded-map-badge">
                        <ImageIcon size={15} />
                        <span>Source 2D map</span>
                      </div>
                      {terrainSettings.showMarkers && locations
                        .filter((location) => groupVisibleForLayer(location.type, activeLayer))
                        .map((location) => {
                          const Icon = location.icon || ZONE_META[location.type]?.icon || MapIcon;
                          return (
                            <button
                              key={location.id}
                              type="button"
                              className={`smap-2d-marker smap-2d-marker-${location.type} ${selectedId === location.id ? 'selected' : ''}`}
                              style={{
                                ...getMapPointStyle(location.position),
                                '--marker-color': location.color
                              }}
                              onClick={() => {
                                setSelectedId(location.id);
                                setActiveLayer(location.type);
                              }}
                              aria-label={`Select ${location.name}`}
                            >
                              <Icon size={15} />
                              <span>{location.name}</span>
                            </button>
                          );
                        })}
                    </>
                  ) : (
                    <>
                      <svg
                  className="smap-vicinity-svg"
                  viewBox={`0 0 ${MAP_SIZE.width} ${MAP_SIZE.height}`}
                  preserveAspectRatio="none"
                  role="img"
                  aria-label="Ecotrend subdivision vicinity map showing roads, sections, and key locations"
                >
                  <defs>
                    {VICINITY_ZONES.map((zone) => (
                      <clipPath key={zone.id} id={`clip-${zone.id}`}>
                        <polygon points={svgPoints(zone.points)} />
                      </clipPath>
                    ))}
                    {VICINITY_ROADS.map((road) => (
                      <path key={road.id} id={`${road.id}-label-path`} d={svgPath(road.points)} />
                    ))}
                  </defs>

                  <rect width={MAP_SIZE.width} height={MAP_SIZE.height} fill="#f8fafc" />
                  <text className="smap-vicinity-title smap-vicinity-title-small" x="560" y="58">
                    ECOTREND SUBDIVISION
                  </text>
                  <text className="smap-vicinity-title smap-vicinity-title-large" x="560" y="112">
                    VICINITY MAP
                  </text>

                  {VICINITY_ZONES.map((zone) => (
                    <polygon
                      key={zone.id}
                      className={`smap-vicinity-zone ${activeLayer === 'overview' || activeLayer === zone.type ? '' : 'muted'}`}
                      points={svgPoints(zone.points)}
                      style={{ fill: zone.color }}
                    />
                  ))}

                  {VICINITY_ZONES.map((zone) => (
                    <g
                      key={`grid-${zone.id}`}
                      clipPath={`url(#clip-${zone.id})`}
                      transform={`rotate(${zone.grid.rotation} ${zone.grid.center[0]} ${zone.grid.center[1]})`}
                    >
                      {buildGridLines(zone.grid).map((line, index) => (
                        <line
                          key={`${zone.id}-lot-${index}`}
                          className="smap-vicinity-lot-line"
                          x1={line.x1}
                          y1={line.y1}
                          x2={line.x2}
                          y2={line.y2}
                        />
                      ))}
                    </g>
                  ))}

                  {VICINITY_ROADS.map((road) => (
                    <path
                      key={`edge-${road.id}`}
                      className="smap-vicinity-road-edge"
                      d={svgPath(road.points)}
                      strokeWidth={road.width + 7}
                    />
                  ))}
                  {VICINITY_ROADS.map((road) => (
                    <path
                      key={road.id}
                      className="smap-vicinity-road"
                      d={svgPath(road.points)}
                      stroke={road.color}
                      strokeWidth={road.width}
                    />
                  ))}
                  {VICINITY_ROADS.map((road) => (
                    <text key={`label-${road.id}`} className="smap-vicinity-road-label">
                      <textPath href={`#${road.id}-label-path`} startOffset="50%" textAnchor="middle">
                        {road.name}
                      </textPath>
                    </text>
                  ))}

                  <g className="smap-vicinity-icon smap-vicinity-icon-chapel" transform="translate(735 430)">
                    <path d="M0 -28 L20 -8 V22 H-20 V-8 Z" />
                    <path d="M0 -40 V-18 M-10 -30 H10" />
                  </g>
                  <g className="smap-vicinity-icon smap-vicinity-icon-court" transform="translate(372 865) rotate(-18)">
                    <rect x="-28" y="-18" width="56" height="36" rx="3" />
                    <line x1="0" y1="-18" x2="0" y2="18" />
                    <circle cx="0" cy="0" r="7" />
                  </g>

                  <g className="smap-vicinity-entrance" transform="translate(80 1060)">
                    <path d="M0 0 L82 -35" />
                    <rect x="74" y="-64" width="178" height="46" rx="4" />
                    <text x="164" y="-45">ECOTREND'S</text>
                    <text x="164" y="-27">ENTRANCE / EXIT</text>
                  </g>
                  <g className="smap-vicinity-arrow" transform="translate(48 940) rotate(-16)">
                    <path d="M0 0 V-95 M0 -95 L-9 -76 M0 -95 L9 -76" />
                    <text x="14" y="-36" transform="rotate(90 14 -36)">SAN NICOLAS</text>
                  </g>
                </svg>

                {locations
                  .filter((location) => groupVisibleForLayer(location.type, activeLayer))
                  .map((location) => {
                    const Icon = location.icon || ZONE_META[location.type]?.icon || MapIcon;
                    return (
                      <button
                        key={location.id}
                        type="button"
                        className={`smap-2d-marker smap-2d-marker-${location.type} ${selectedId === location.id ? 'selected' : ''}`}
                        style={{
                          ...getMapPointStyle(location.position),
                          '--marker-color': location.color
                        }}
                        onClick={() => {
                          setSelectedId(location.id);
                          setActiveLayer(location.type);
                        }}
                        aria-label={`Select ${location.name}`}
                      >
                        <Icon size={15} />
                        <span>{location.name}</span>
                      </button>
                    );
                  })}
                    </>
                  )}
                </div>
              </div>
            )}

            {renderState.status === 'rendering' && (
              <div className="smap-render-overlay" role="status" aria-live="polite">
                <div className="smap-render-card">
                  <div className="smap-render-spinner" aria-hidden="true" />
                  <strong>Rendering 2D map to 3D</strong>
                  <span>{renderState.message}</span>
                  <div className="smap-render-progress" aria-hidden="true">
                    <i style={{ width: `${renderState.progress}%` }} />
                  </div>
                  <small>
                    {renderState.progress}% | {formatRenderSeconds(renderState.elapsedSeconds)} elapsed
                  </small>
                </div>
              </div>
            )}

            {renderState.status === 'error' && (
              <div className="smap-render-alert" role="alert">
                {renderState.message}
              </div>
            )}
          </div>
        </div>

        <aside className="smap-detail-panel">
          <div className="smap-detail-head">
            <div className="smap-detail-icon" style={{ color: selectedLocation.color, backgroundColor: `${selectedLocation.color}18` }}>
              <SelectedIcon size={25} />
            </div>
            <div>
              <h3>{selectedLocation.name}</h3>
              <span>{selectedLocation.layer}</span>
            </div>
          </div>

          <p className="smap-detail-copy">{selectedLocation.description}</p>

          <div className="smap-detail-list">
            <div>
              <MapIcon size={16} />
              <div>
                <span>Layer</span>
                <strong>{selectedMeta.label}</strong>
              </div>
            </div>
            <div>
              <LocateFixed size={16} />
              <div>
                <span>Use case</span>
                <strong>{selectedLocation.useCase}</strong>
              </div>
            </div>
          </div>

          <div className="smap-tags">
            {selectedLocation.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </aside>
      </div>

      <div className="smap-summary-grid">
        <div>
          <Shield size={22} />
          <strong>Accessible Roles</strong>
          <span>{MODULE_COPY.access}.</span>
        </div>
        <div>
          <Building2 size={22} />
          <strong>Mapped Areas</strong>
          <span>{MODULE_COPY.mappedContent}</span>
        </div>
        <div>
          <Home size={22} />
          <strong>Monitoring Value</strong>
          <span>{MODULE_COPY.value}</span>
        </div>
      </div>
    </section>
  );
};

export default SubdivisionMap3D;
