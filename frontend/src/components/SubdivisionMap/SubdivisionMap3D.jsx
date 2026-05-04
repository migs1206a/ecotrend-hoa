import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Building2,
  Home,
  LocateFixed,
  Map as MapIcon,
  RotateCcw,
  RotateCw,
  Shield,
  Trees,
  Waves
} from 'lucide-react';
import { apiUrl } from '../../utils/api';
import './SubdivisionMap3D.css';

const ZONE_META = {
  overview: { label: 'Overview', icon: MapIcon, color: '#0f766e' },
  security: { label: 'Security', icon: Shield, color: '#0ea5e9' },
  facilities: { label: 'Facilities', icon: Building2, color: '#22c55e' },
  residential: { label: 'Residential', icon: Home, color: '#f97316' }
};

const BASE_LOCATIONS = [
  {
    id: 'main-gate',
    name: 'Main Gate',
    type: 'security',
    position: [-4.6, 0.55, -1.5],
    color: '#0ea5e9',
    icon: Shield,
    description: 'Primary checkpoint for visitors, vehicles, deliveries, and guard shift visibility.',
    layer: 'Security Node',
    useCase: 'Confirm traffic flow and orient new guards before logging entry.',
    tags: ['Gate A', 'Guard post', 'Entry logs']
  },
  {
    id: 'east-gate',
    name: 'East Gate',
    type: 'security',
    position: [4.85, 0.5, 0.75],
    color: '#38bdf8',
    icon: Shield,
    description: 'Secondary access point for resident and service vehicle movement.',
    layer: 'Security Node',
    useCase: 'Cross-check vehicle movement and nearby patrol visibility.',
    tags: ['Gate B', 'Exit flow', 'Perimeter']
  },
  {
    id: 'patrol-loop',
    name: 'Patrol Loop',
    type: 'security',
    position: [0.75, 0.38, -0.15],
    color: '#0284c7',
    icon: RotateCw,
    description: 'Central circulation road used for guard rounds and subdivision orientation.',
    layer: 'Road Network',
    useCase: 'Review common route coverage before routine patrols.',
    tags: ['Loop road', 'Monitoring', 'Coverage']
  },
  {
    id: 'clubhouse',
    name: 'Clubhouse',
    type: 'facilities',
    position: [3.0, 0.8, -1.75],
    color: '#16a34a',
    icon: Building2,
    description: 'Main facility landmark for resident activities and HOA events.',
    layer: 'Facility Landmark',
    useCase: 'Orient event guests and check reservation context faster.',
    tags: ['Events', 'Reservations', 'Landmark']
  },
  {
    id: 'pool',
    name: 'Pool',
    type: 'facilities',
    position: [3.8, 0.48, -0.45],
    color: '#14b8a6',
    icon: Waves,
    description: 'Pool area marker beside the clubhouse facility cluster.',
    layer: 'Facility Landmark',
    useCase: 'Locate facility activity zones during reservation monitoring.',
    tags: ['Pool', 'Amenity', 'Guest flow']
  },
  {
    id: 'covered-court',
    name: 'Covered Court',
    type: 'facilities',
    position: [0.35, 0.6, 1.62],
    color: '#f97316',
    icon: Building2,
    description: 'Large community court marker near the center residential streets.',
    layer: 'Facility Landmark',
    useCase: 'Identify high-traffic event locations and nearby roads.',
    tags: ['Court', 'Events', 'Central']
  },
  {
    id: 'pocket-park',
    name: 'Pocket Park',
    type: 'facilities',
    position: [-2.95, 0.42, 1.65],
    color: '#22c55e',
    icon: Trees,
    description: 'Small green space mapped between residential blocks.',
    layer: 'Open Space',
    useCase: 'Locate common gathering points without using resident addresses.',
    tags: ['Park', 'Open area', 'Resident zone']
  },
  {
    id: 'recovery-area',
    name: 'Recovery Area',
    type: 'facilities',
    position: [-2.15, 0.8, -2.82],
    color: '#84cc16',
    icon: LocateFixed,
    description: 'Support area marker close to the main gate approach.',
    layer: 'Facility Landmark',
    useCase: 'Quickly identify a support location during incident review.',
    tags: ['Support', 'Gate side', 'Reference']
  },
  {
    id: 'block-a',
    name: 'Block A',
    type: 'residential',
    position: [-0.35, 0.5, -2.05],
    color: '#fb923c',
    icon: Home,
    description: 'Residential block cluster shown for orientation without exact personal addresses.',
    layer: 'Residential Blocks',
    useCase: 'Orient reports and nearby facilities while preserving resident privacy.',
    tags: ['Homes', 'Street row', 'Block A']
  },
  {
    id: 'block-b',
    name: 'Block B',
    type: 'residential',
    position: [0.85, 0.5, -0.85],
    color: '#fb923c',
    icon: Home,
    description: 'Residential block cluster beside the patrol loop.',
    layer: 'Residential Blocks',
    useCase: 'Find general block direction during resident or visitor assistance.',
    tags: ['Homes', 'Street row', 'Block B']
  },
  {
    id: 'block-c',
    name: 'Block C',
    type: 'residential',
    position: [-1.15, 0.5, 1.18],
    color: '#fb923c',
    icon: Home,
    description: 'Residential block cluster along the lower road section.',
    layer: 'Residential Blocks',
    useCase: 'Use block-level orientation without displaying exact household records.',
    tags: ['Homes', 'Street row', 'Block C']
  }
];

const ROADS = [
  { position: [0, 0.05, 0], scale: [8.7, 0.08, 0.35], rotation: 0 },
  { position: [-2.7, 0.06, 1.45], scale: [3.0, 0.08, 0.32], rotation: 0.12 },
  { position: [2.4, 0.06, -1.55], scale: [3.2, 0.08, 0.32], rotation: -0.08 },
  { position: [0, 0.07, 0], scale: [0.38, 0.08, 5.55], rotation: 0.02 },
  { position: [-3.95, 0.07, -0.7], scale: [0.36, 0.08, 2.3], rotation: -0.2 },
  { position: [4.4, 0.07, 0.6], scale: [0.36, 0.08, 1.8], rotation: 0.12 }
];

const RESIDENTIAL_BLOCKS = [
  [-2.5, -1.6], [-1.7, -1.55], [-0.9, -1.55], [0.45, -1.45], [1.2, -1.38],
  [-2.8, -0.55], [-1.95, -0.5], [-1.1, -0.5], [0.3, -0.42], [1.15, -0.4], [2.05, -0.4],
  [-2.7, 0.65], [-1.85, 0.68], [-0.9, 0.68], [0.95, 0.72], [1.8, 0.72], [2.72, 0.75],
  [-2.4, 2.05], [-1.55, 2.05], [-0.65, 2.02], [0.75, 2.05], [1.65, 2.05]
];

const groupVisibleForLayer = (type, activeLayer) => activeLayer === 'overview' || type === activeLayer;

const FACILITY_FALLBACK_POSITIONS = [
  [3.0, 0.58, -1.75],
  [3.8, 0.58, -0.45],
  [0.35, 0.58, 1.62],
  [-2.95, 0.58, 1.65],
  [-2.15, 0.58, -2.82],
  [1.9, 0.58, 1.95],
  [-3.55, 0.58, -0.1],
  [4.15, 0.58, 1.6]
];

const normalizeMapNumber = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const getFacilityPosition = (facility, index) => {
  const fallback = FACILITY_FALLBACK_POSITIONS[index % FACILITY_FALLBACK_POSITIONS.length];
  return [
    normalizeMapNumber(facility?.mapPosition?.x, fallback[0]),
    normalizeMapNumber(facility?.mapPosition?.y, fallback[1]),
    normalizeMapNumber(facility?.mapPosition?.z, fallback[2])
  ];
};

const createMaterial = (color, options = {}) => new THREE.MeshStandardMaterial({
  color,
  roughness: options.roughness ?? 0.72,
  metalness: options.metalness ?? 0.02,
  transparent: options.transparent ?? false,
  opacity: options.opacity ?? 1
});

const SubdivisionMap3D = ({ role = 'Admin' }) => {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const mapGroupRef = useRef(null);
  const markerRefs = useRef([]);
  const animationRef = useRef(null);
  const [activeLayer, setActiveLayer] = useState('overview');
  const [selectedId, setSelectedId] = useState('main-gate');
  const [facilityCatalog, setFacilityCatalog] = useState([]);
  const [facilityLoadState, setFacilityLoadState] = useState('idle');
  const [labels, setLabels] = useState([]);
  const [zoom, setZoom] = useState(72);

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

        return {
          id: `facility-${facility._id || index}`,
          name: facility.name || `Facility ${index + 1}`,
          type: 'facilities',
          position: getFacilityPosition(facility, index),
          color: hourlyRate > 0 ? '#16a34a' : '#14b8a6',
          icon: Building2,
          description: facility.description || 'Reservable facility maintained from Facility Management.',
          layer: 'Facility Catalog',
          useCase: 'This marker is synced from Facility Management and updates when admins save facility changes.',
          tags: [
            hourlyRate > 0 ? `P${hourlyRate}/hr` : 'Free',
            `${eventTypes.length || 0} event type${eventTypes.length === 1 ? '' : 's'}`,
            'Admin managed'
          ]
        };
      }),
    [facilityCatalog]
  );

  const locations = useMemo(
    () => [...BASE_LOCATIONS, ...dynamicFacilityLocations],
    [dynamicFacilityLocations]
  );

  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === selectedId) || locations[0],
    [locations, selectedId]
  );

  const selectedMeta = ZONE_META[selectedLocation.type] || ZONE_META.overview;
  const SelectedIcon = selectedLocation.icon || selectedMeta.icon;

  const buildScene = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0b1f24');
    scene.fog = new THREE.Fog('#0b1f24', 9, 20);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(6.4, 6.2, 7.8);
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
    controls.minDistance = 6.8;
    controls.maxDistance = 13.2;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minPolarAngle = Math.PI * 0.22;
    controls.target.set(0, 0.1, 0);

    const ambient = new THREE.HemisphereLight('#ecfeff', '#064e3b', 2.8);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight('#ffffff', 2.2);
    keyLight.position.set(-4, 7, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    scene.add(keyLight);

    const fillLight = new THREE.PointLight('#34d399', 8, 14);
    fillLight.position.set(1, 4, -3);
    scene.add(fillLight);

    const mapGroup = new THREE.Group();
    mapGroup.rotation.x = -0.05;
    scene.add(mapGroup);

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(10.7, 0.22, 7.2),
      createMaterial('#97dfbb')
    );
    base.position.y = -0.13;
    base.receiveShadow = true;
    mapGroup.add(base);

    const border = new THREE.Mesh(
      new THREE.BoxGeometry(10.35, 0.04, 6.88),
      createMaterial('#c7f9d4', { transparent: true, opacity: 0.42 })
    );
    border.position.y = 0.03;
    mapGroup.add(border);

    const gridMaterial = createMaterial('#d9fbe6', { transparent: true, opacity: 0.32 });
    for (let x = -5; x <= 5; x += 1) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 6.9), gridMaterial);
      line.position.set(x, 0.08, 0);
      mapGroup.add(line);
    }
    for (let z = -3; z <= 3; z += 1) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.025, 0.025), gridMaterial);
      line.position.set(0, 0.09, z);
      mapGroup.add(line);
    }

    const roadMaterial = createMaterial('#374151');
    const roadEdgeMaterial = createMaterial('#6b7280');
    ROADS.forEach((road) => {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), roadEdgeMaterial);
      edge.scale.set(road.scale[0] + 0.16, 0.05, road.scale[2] + 0.15);
      edge.position.set(road.position[0], road.position[1] - 0.005, road.position[2]);
      edge.rotation.y = road.rotation;
      edge.receiveShadow = true;
      mapGroup.add(edge);

      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), roadMaterial);
      mesh.scale.set(...road.scale);
      mesh.position.set(...road.position);
      mesh.rotation.y = road.rotation;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mapGroup.add(mesh);
    });

    const lotMaterial = createMaterial('#fb923c');
    RESIDENTIAL_BLOCKS.forEach(([x, z], index) => {
      const height = 0.25 + (index % 3) * 0.08;
      const homeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.45, height, 0.34), lotMaterial);
      homeMesh.position.set(x, 0.16 + height / 2, z);
      homeMesh.rotation.y = (index % 2 ? 0.12 : -0.08);
      homeMesh.castShadow = true;
      mapGroup.add(homeMesh);
    });

    const landmarkGeometries = {
      'main-gate': new THREE.BoxGeometry(0.72, 0.78, 0.72),
      'east-gate': new THREE.BoxGeometry(0.55, 0.62, 0.55),
      'clubhouse': new THREE.BoxGeometry(0.9, 1.0, 0.85),
      'pool': new THREE.CylinderGeometry(0.42, 0.42, 0.18, 32),
      'covered-court': new THREE.BoxGeometry(1.05, 0.58, 0.82),
      'pocket-park': new THREE.BoxGeometry(0.7, 0.28, 0.55),
      'recovery-area': new THREE.BoxGeometry(0.72, 0.62, 0.72)
    };

    markerRefs.current = [];
    locations.forEach((location) => {
      const landmarkGeometry = landmarkGeometries[location.id] ||
        (location.type === 'facilities' ? new THREE.CylinderGeometry(0.36, 0.42, 0.5, 24) : null);
      if (landmarkGeometry) {
        const landmark = new THREE.Mesh(landmarkGeometry, createMaterial(location.color));
        landmark.position.set(location.position[0], location.position[1] * 0.55, location.position[2]);
        landmark.castShadow = true;
        landmark.userData = { locationId: location.id, type: 'landmark' };
        mapGroup.add(landmark);
      }

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.21, 0.045, 12, 36),
        createMaterial(location.color)
      );
      ring.position.set(location.position[0], location.position[1] + 0.34, location.position[2]);
      ring.rotation.x = Math.PI / 2;
      ring.userData = { locationId: location.id, type: location.type };
      mapGroup.add(ring);
      markerRefs.current.push(ring);

      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 18, 18),
        createMaterial('#ffffff')
      );
      dot.position.copy(ring.position);
      dot.position.y += 0.01;
      dot.userData = { locationId: location.id, type: location.type };
      mapGroup.add(dot);
      markerRefs.current.push(dot);
    });

    const zones = [
      { type: 'security', position: [-3.95, 0.11, -0.7], scale: [2.0, 0.035, 2.0], color: '#0ea5e9' },
      { type: 'security', position: [4.1, 0.12, 0.55], scale: [1.6, 0.035, 1.6], color: '#0ea5e9' },
      { type: 'facilities', position: [2.9, 0.13, -1.1], scale: [2.4, 0.035, 1.8], color: '#22c55e' },
      { type: 'residential', position: [-0.5, 0.14, 0.55], scale: [5.2, 0.035, 4.0], color: '#f97316' }
    ];
    zones.forEach((zone) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        createMaterial(zone.color, { transparent: true, opacity: 0.18 })
      );
      mesh.position.set(...zone.position);
      mesh.scale.set(...zone.scale);
      mapGroup.add(mesh);
    });

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
        mapGroup.localToWorld(vector);
        vector.y += 0.6;
        vector.project(camera);
        return {
          id: location.id,
          name: location.name,
          type: location.type,
          x: (vector.x * 0.5 + 0.5) * width,
          y: (-vector.y * 0.5 + 0.5) * height,
          visible: vector.z < 1 && groupVisibleForLayer(location.type, activeLayer)
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
        marker.rotation.z += 0.012 + index * 0.0004;
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
          object.material.forEach((material) => material.dispose?.());
        } else {
          object.material?.dispose?.();
        }
      });
    };
  }, [activeLayer, locations]);

  useEffect(() => buildScene(), [buildScene]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const distance = 13.2 - (zoom / 100) * 5.7;
    const direction = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(controls.target.clone().add(direction.multiplyScalar(distance)));
    camera.updateProjectionMatrix();
  }, [zoom]);

  useEffect(() => {
    markerRefs.current.forEach((marker) => {
      const location = locations.find((item) => item.id === marker.userData.locationId);
      const isVisible = location && groupVisibleForLayer(location.type, activeLayer);
      marker.visible = Boolean(isVisible);
      if (marker.material) {
        marker.material.opacity = selectedId === location?.id ? 1 : 0.78;
        marker.material.transparent = selectedId !== location?.id;
      }
    });
  }, [activeLayer, locations, selectedId]);

  const rotateMap = (direction) => {
    if (!mapGroupRef.current) return;
    mapGroupRef.current.rotation.y += direction * 0.45;
  };

  const resetView = () => {
    setZoom(72);
    setActiveLayer('overview');
    setSelectedId('main-gate');
    if (mapGroupRef.current) {
      mapGroupRef.current.rotation.y = 0;
    }
    if (controlsRef.current && cameraRef.current) {
      cameraRef.current.position.set(6.4, 6.2, 7.8);
      controlsRef.current.target.set(0, 0.1, 0);
      controlsRef.current.update();
    }
  };

  return (
    <section className="subdivision-map-module">
      <header className="smap-header">
        <div>
          <h2>3D Mapped Subdivision</h2>
          <p>Roads, facilities, guard points, and residential block zones for {role.toLowerCase()} workflows.</p>
        </div>
        <span className="smap-mode-pill">
          {facilityLoadState === 'error'
            ? 'Facility sync unavailable'
            : `${facilityCatalog.length} synced facilit${facilityCatalog.length === 1 ? 'y' : 'ies'}`}
        </span>
      </header>

      <div className="smap-layout">
        <div className="smap-main">
          <div className="smap-toolbar" aria-label="3D map controls">
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
          </div>

          <div className="smap-viewport" ref={containerRef}>
            <canvas ref={canvasRef} className="smap-canvas" aria-label="Interactive 3D subdivision map" />
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
          <strong>Security Coverage</strong>
          <span>Main gate, east gate, patrol loop, and sensitive access zones stay visible for guard orientation.</span>
        </div>
        <div>
          <Building2 size={22} />
          <strong>Facility Landmarks</strong>
          <span>Facility Management entries are added as live 3D landmarks, alongside the fixed orientation points.</span>
        </div>
        <div>
          <Home size={22} />
          <strong>Residential Blocks</strong>
          <span>Street rows and lot clusters render as layered 3D blocks without exposing exact household details.</span>
        </div>
      </div>
    </section>
  );
};

export default SubdivisionMap3D;
