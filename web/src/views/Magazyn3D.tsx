/**
 * Widok Magazyn 3D — ta sama instalacja, przestrzennie.
 *
 * UKŁAD JEST 1:1 Z WIDOKIEM 2D, bo nie ma własnego: współrzędne bryły i rur
 * czyta z tego samego pliku schema.svg (patrz extractScene.ts). Podmiana
 * rysunku przestawia oba widoki naraz.
 *
 * JEDNO CELOWE ODSTĘPSTWO — WNĘTRZE ZBIORNIKA.
 * Rysunek 2D jest przekrojem: pozycja sondy w pionie oznacza tam POZIOM.
 * W 3D pion to prawdziwa wysokość, a płaszczyzna podłogi to rzut z góry —
 * więc przepisanie przekroju wprost na podłogę położyłoby poziomy na płasko
 * i skłamało o geometrii. Dlatego sondy w zbiorniku dostają:
 *   wysokość  ← z poziomu (1 dół, 3 góra)
 *   położenie ← z przekątnej A/B, dokładnie jak we wstawce „rzut z góry”
 * Rozmieszczenie urządzeń i przebieg rur pozostają wierne rysunkowi.
 *
 * Stylistyka: jasne studio z mgłą, białe bryły na ciemnym cokole, rury jako
 * łukowe rurki ze strzałką kierunku, etykiety jako pigułki HTML w przestrzeni
 * (CSS2DRenderer) — język wizualny z wizualizacji fabryki KLAB.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import type { MaterialProfile } from '@magazyn-pcm/shared';
import schemaMarkup from '../schema/schema.svg?raw';
import { extractScene, type Scene, type SvgBox } from '../schema/extractScene.js';
import type { LiveData } from '../useLiveData.js';
import { FALLBACK_STALE_AFTER_MS, NO_DATA, formatValue, pointState } from '../format.js';
import { isInPhaseBand, temperatureFill } from '../scale.js';
import { getSettings, useSettings } from '../settings.js';
import { useAppliedTheme } from '../theme.js';

/* --- Stałe scenografii ---------------------------------------------------- */

const WORLD_SCALE = 1 / 26;
const BG = 0xfafaf9;
const FLOOR = 0xe3e2dd;
const GRID_1 = 0xc9c8c3;
const GRID_2 = 0xd6d5d0;
const PLATE = 0xd8d7d1;
const BODY = 0xffffff;
const PLINTH = 0x111013;
const CAP = 0x111013;
const PIPE_WARM = 0x3f9e57;
const PIPE_COOL = 0x8fbf9f;
const ACCENT = 0x0d0d0d;
const PLINTH_H = 0.14;

// Kamera cofnięta i podniesiona, bo magazyn jest teraz trzykrotnie wyższy —
// przy poprzednim ustawieniu górne sondy wychodziły poza kadr.
const CAMERA_HOME = new THREE.Vector3(-12, 26, 46);
const CAMERA_TARGET = new THREE.Vector3(1.5, 8, 0);

/** Odczyt koloru z motywu CSS, żeby scena szła za trybem jasnym/ciemnym. */
function themeColor(nazwa: string, fallback: number): THREE.Color {
  const value = getComputedStyle(document.documentElement).getPropertyValue(nazwa).trim();
  if (!value) return new THREE.Color(fallback);
  try {
    return new THREE.Color(value);
  } catch {
    return new THREE.Color(fallback);
  }
}

/**
 * Zbiornik na rysunku 2D jest PRZEKROJEM: jego wysokość opisuje wysokość
 * zbiornika, a nie jego głębokość. Gdyby wziąć ją wprost jako głębokość,
 * magazyn wyszedłby naleśnikiem 16 x 18 jednostek przy wysokości 6,6.
 * Dlatego zbiorniki dostają rzut kwadratowy wyprowadzony z szerokości,
 * zwężony tym współczynnikiem, a wysokość z atrybutu data-h.
 * Środek bryły pozostaje dokładnie tam, gdzie na rysunku.
 */
const VESSEL_FOOTPRINT = 0.72;

/**
 * Magazyn jest WYSOKI, nie przysadzisty.
 *
 * Rysunek 2D jest przekrojem, więc jego proporcje wynikają z tego, co da się
 * czytelnie opisać na płaszczyźnie, a nie z rzeczywistej bryły. W 3D zbiornik
 * dostaje trzykrotność wysokości z rysunku — dopiero wtedy widać stratyfikację
 * i to, że sondy siedzą na trzech różnych poziomach, a nie obok siebie.
 */
const STORAGE_HEIGHT_FACTOR = 3;

/** Liczba poziomych płyt (lamel) wypełniających magazyn. */
const LAMELA_COUNT = 25;
const LAMELA_THICKNESS = 0.09;

/* --- Pomocnicze ----------------------------------------------------------- */

/** Przelicza punkt z przestrzeni SVG na współrzędne świata. */
function toWorld(x: number, y: number, scene: Scene): [number, number] {
  return [
    (x - scene.viewBox.width / 2) * WORLD_SCALE,
    (y - scene.viewBox.height / 2) * WORLD_SCALE,
  ];
}

function boxCenterWorld(box: SvgBox, scene: Scene): [number, number] {
  return toWorld(box.x + box.w / 2, box.y + box.h / 2, scene);
}

function labelPill(text: string, variant: 'object' | 'sensor' | 'zone'): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `scene-label scene-label--${variant}`;
  el.textContent = text;
  return el;
}

/** Wysokość sondy w zbiorniku według poziomu: 1 dół, 3 góra. */
function levelHeight(level: 1 | 2 | 3, vesselHeight: number): number {
  return vesselHeight * { 1: 0.22, 2: 0.5, 3: 0.78 }[level];
}

/** Bryła przeliczona na świat — jedno miejsce, z którego korzystają sondy i pręty. */
interface Solid {
  cx: number;
  cz: number;
  /** Szerokość i głębokość rzutu. */
  w: number;
  d: number;
  height: number;
}

function solidOf(
  object: { vessel: boolean; height: number; id?: string } & SvgBox,
  scene: Scene,
): Solid {
  const [cx, cz] = boxCenterWorld(object, scene);

  if (object.vessel) {
    const side = object.w * WORLD_SCALE * VESSEL_FOOTPRINT;
    const height =
      object.id === 'storage' ? object.height * STORAGE_HEIGHT_FACTOR : object.height;
    return { cx, cz, w: side, d: side, height };
  }

  return {
    cx,
    cz,
    w: object.w * WORLD_SCALE,
    d: object.h * WORLD_SCALE,
    height: object.height,
  };
}

/* --- Widok ---------------------------------------------------------------- */

interface SensorHandle {
  pointId: string;
  mesh: THREE.Mesh;
  outline: THREE.LineSegments;
  label: HTMLDivElement;
}

interface DeviceHandle {
  statePoint: string;
  led: THREE.Mesh;
}

export function Magazyn3D({ data }: { data: LiveData }) {
  const settings = useSettings();
  const hostRef = useRef<HTMLDivElement>(null);
  // Stany poczatkowe z opcji aplikacji; przyciski w widoku dzialaja dalej.
  const [autoRotate, setAutoRotate] = useState(() => getSettings().obrot3d);
  const [showLabels, setShowLabels] = useState(() => getSettings().podpisy3d);
  const [ready, setReady] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);

  // Uchwyty do obiektów, które aktualizujemy przy każdej zmianie danych.
  const sensorsRef = useRef<SensorHandle[]>([]);
  const devicesRef = useRef<DeviceHandle[]>([]);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const labelRootRef = useRef<HTMLElement | null>(null);
  // Uchwyty potrzebne wyłącznie do przemalowania sceny przy zmianie motywu.
  const sceneRef = useRef<THREE.Scene | null>(null);
  const floorMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);

  const scene3d = useMemo(() => extractScene(schemaMarkup), []);
  // Motyw NIE przebudowuje sceny.
  //
  // Wcześniej stał w zależnościach efektu budującego, bo kolory tła, mgły
  // i podłogi są wpieczone w obiekty Three.js. Skutek widać było dopiero
  // w działaniu: przełączenie motywu stawiało scenę od nowa, a wraz z nią
  // kamerę w położeniu wyjściowym — kto dojechał do konkretnej sondy, tracił
  // kadr i musiał szukać jej ponownie. Zmiana motywu to zmiana OŚWIETLENIA,
  // nie zmiana tego, na co się patrzy.
  //
  // Tych kolorów jest trzy i wszystkie da się podmienić w locie (efekt niżej).
  // Reszta scenografii nie zależy od motywu.
  const theme = useAppliedTheme();
  const pointMap = useMemo(() => new Map(data.points.map((p) => [p.id, p])), [data.points]);

  const staleAfterMs = data.health?.staleAfterMs ?? FALLBACK_STALE_AFTER_MS;
  // Gdy kanał żyje, o przestarzałości decyduje serwer — patrz isStale().
  const channelAlive = data.link === 'live';
  // Ta sama hierarchia co w 2D; zestaw "unknown" nie jest pewnikiem.
  const detectedBank =
    data.health && data.health.bank.detection !== 'unknown' ? data.health.bank.active : null;
  const activeMaterial = data.session?.material ?? detectedBank ?? settings.parafinaPodgladu;
  const profile: MaterialProfile | null = data.materials
    ? (data.materials.profiles[activeMaterial] ??
      data.materials.profiles[data.materials.defaultMaterial])
    : null;

  /* --- Budowa sceny, raz ------------------------------------------------- */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    } catch {
      setWebglError('Ta przeglądarka nie udostępnia WebGL — widok 3D nie może się uruchomić.');
      return;
    }

    const width = () => host.clientWidth || 960;
    const height = () => host.clientHeight || 560;

    const sceneBg = themeColor('--scene-bg', BG);
    const sceneFloor = themeColor('--scene-floor', FLOOR);

    const scene = new THREE.Scene();
    scene.background = sceneBg;
    scene.fog = new THREE.Fog(sceneBg.getHex(), 60, 150);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(46, width() / height(), 0.1, 400);
    camera.position.copy(CAMERA_HOME);
    cameraRef.current = camera;

    renderer.setSize(width(), height());
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    // PCFSoftShadowMap jest w nowszych wersjach three wycofany i po cichu
    // zamieniany na PCFShadowMap — ustawiamy go wprost, zeby nie zasmiecac
    // konsoli ostrzezeniem. Miekkosc cienia dobieramy przez shadow.radius.
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.cssText = 'position:absolute;inset:0;display:block';
    host.appendChild(renderer.domElement);

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(width(), height());
    labelRenderer.domElement.style.cssText =
      'position:absolute;inset:0;pointer-events:none;overflow:hidden';
    host.appendChild(labelRenderer.domElement);
    labelRootRef.current = labelRenderer.domElement;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.copy(CAMERA_TARGET);
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minDistance = 12;
    controls.maxDistance = 90;
    controlsRef.current = controls;

    // --- Światło: jasne, miękkie, studyjne --------------------------------
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe8e6e1, 0.85));

    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(18, 34, 14);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -40;
    key.shadow.camera.right = 40;
    key.shadow.camera.top = 40;
    key.shadow.camera.bottom = -40;
    key.shadow.camera.far = 120;
    key.shadow.bias = -0.0004;
    key.shadow.radius = 6;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xf4efe8, 0.18);
    fill.position.set(-24, 16, -20);
    scene.add(fill);

    // --- Podłoga i siatka -------------------------------------------------
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: sceneFloor,
      roughness: 1,
      metalness: 0,
    });
    floorMaterialRef.current = floorMaterial;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 120), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(120, 60, GRID_1, GRID_2);
    grid.position.y = 0.004;
    scene.add(grid);

    // --- Płyty strefowe: obieg ciepła i magazyn ---------------------------
    // Wyznaczane z rysunku, nie wpisane na stałe: magazyn to zbiornik PCM,
    // druga strefa to wszystko pozostałe.
    const storage = scene3d.objects.find((o) => o.id === 'storage');
    const others = scene3d.objects.filter((o) => o.id !== 'storage');

    const addZone = (box: SvgBox, name: string, pad = 26): void => {
      const padded: SvgBox = {
        x: box.x - pad,
        y: box.y - pad,
        w: box.w + pad * 2,
        h: box.h + pad * 2,
      };
      const [cx, cz] = boxCenterWorld(padded, scene3d);
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(padded.w * WORLD_SCALE, 0.12, padded.h * WORLD_SCALE),
        new THREE.MeshStandardMaterial({ color: PLATE, roughness: 0.95 }),
      );
      plate.position.set(cx, 0.06, cz);
      plate.receiveShadow = true;
      scene.add(plate);

      // Podpis strefy stoi przy jej krawędzi bliższej kamerze wyjściowej.
      const [, frontZ] = toWorld(padded.x, padded.y + padded.h, scene3d);
      const label = new CSS2DObject(labelPill(name.toUpperCase(), 'zone'));
      label.position.set(cx, 0.3, frontZ + 0.6);
      scene.add(label);
    };

    if (storage) addZone(storage, 'Magazyn PCM');
    if (others.length > 0) {
      const minX = Math.min(...others.map((o) => o.x));
      const minY = Math.min(...others.map((o) => o.y));
      const maxX = Math.max(...others.map((o) => o.x + o.w));
      const maxY = Math.max(...others.map((o) => o.y + o.h));
      addZone({ x: minX, y: minY, w: maxX - minX, h: maxY - minY }, 'Obieg ciepła');
    }

    // --- Bryły ------------------------------------------------------------
    const devices: DeviceHandle[] = [];

    const solids = new Map<string, Solid>();

    for (const object of scene3d.objects) {
      const solid = solidOf(object, scene3d);
      solids.set(object.id, solid);

      const { cx, cz, w, d } = solid;
      const group = new THREE.Group();
      group.position.set(cx, 0.14, cz);

      // Cokół — ciemna podstawa, na której stoi bryła.
      const plinth = new THREE.Mesh(
        new THREE.BoxGeometry(w * 1.1, PLINTH_H, d * 1.1),
        new THREE.MeshStandardMaterial({ color: PLINTH, roughness: 0.7 }),
      );
      plinth.position.y = PLINTH_H / 2;
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      group.add(plinth);

      if (object.vessel) {
        const vesselHeight = solid.height;

        // Zbiornik jest przejrzysty, żeby było widać sondy w środku.
        const shell = new THREE.Mesh(
          new THREE.BoxGeometry(w, vesselHeight, d),
          new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            roughness: 0.12,
            metalness: 0,
            transparent: true,
            opacity: 0.12,
            side: THREE.DoubleSide,
          }),
        );
        shell.position.y = vesselHeight / 2 + PLINTH_H;
        group.add(shell);

        // Krawędzie dają bryle czytelny kontur bez zasłaniania wnętrza.
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(w, vesselHeight, d)),
          new THREE.LineBasicMaterial({ color: 0x9aa39c, transparent: true, opacity: 0.8 }),
        );
        edges.position.copy(shell.position);
        group.add(edges);

        // LAMELE — poziome płyty wypełniające zbiornik.
        //
        // Magazyn PCM to nie pusta skrzynia: parafina leży między płytami
        // wymiennika. Bez nich zbiornik wyglądał jak akwarium z sześcioma
        // klockami i nie było widać, że sondy tkwią w ośrodku.
        if (object.id === 'storage') {
          const lamelaGeometry = new THREE.BoxGeometry(w * 0.86, LAMELA_THICKNESS, d * 0.86);
          const lamelaMaterial = new THREE.MeshStandardMaterial({
            color: 0xd7dcd6,
            roughness: 0.62,
            metalness: 0.08,
            transparent: true,
            opacity: 0.55,
          });

          // Jedna geometria i jeden materiał na wszystkie płyty — 25 osobnych
          // par kosztowałoby tyle samo pamięci, co reszta sceny razem wzięta.
          const lamele = new THREE.InstancedMesh(lamelaGeometry, lamelaMaterial, LAMELA_COUNT);
          lamele.castShadow = true;
          lamele.receiveShadow = true;

          const dummy = new THREE.Object3D();
          const first = vesselHeight * 0.06;
          const last = vesselHeight * 0.94;
          const step = (last - first) / (LAMELA_COUNT - 1);

          for (let i = 0; i < LAMELA_COUNT; i += 1) {
            dummy.position.set(0, PLINTH_H + first + i * step, 0);
            dummy.updateMatrix();
            lamele.setMatrixAt(i, dummy.matrix);
          }
          lamele.instanceMatrix.needsUpdate = true;
          group.add(lamele);
        }
      } else {
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(w, object.height, d),
          new THREE.MeshStandardMaterial({ color: BODY, roughness: 0.55, metalness: 0.05 }),
        );
        body.position.y = object.height / 2 + PLINTH_H;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        // Detal dachu — jak w referencji, ciemna kostka na wierzchu.
        const cap = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.55, 0.34, d * 0.55),
          new THREE.MeshStandardMaterial({ color: CAP, roughness: 0.6 }),
        );
        cap.position.y = object.height + PLINTH_H + 0.17;
        cap.castShadow = true;
        group.add(cap);

        // Lampka stanu tylko tam, gdzie punkt stanu istnieje.
        if (object.statePoint) {
          const led = new THREE.Mesh(
            new THREE.SphereGeometry(0.13, 16, 12),
            new THREE.MeshStandardMaterial({ color: 0xc9cfc9, roughness: 0.4 }),
          );
          led.position.set(w / 2 - 0.22, object.height + PLINTH_H - 0.28, d / 2 - 0.22);
          group.add(led);
          devices.push({ statePoint: object.statePoint, led });
        }
      }

      if (object.label) {
        const label = new CSS2DObject(labelPill(object.label, 'object'));
        label.position.set(0, object.height + PLINTH_H + 0.85, 0);
        group.add(label);
      }

      scene.add(group);
    }

    // --- Sondy ------------------------------------------------------------
    const sensorHandles: SensorHandle[] = [];

    for (const sensor of scene3d.sensors) {
      const vessel = scene3d.objects.find((o) => o.id === sensor.vesselId);
      const point = pointMap.get(sensor.pointId);

      let px: number;
      let pz: number;
      let py: number;

      const solid = vessel ? solids.get(vessel.id) : undefined;

      if (vessel && solid) {
        const { cx: vx, cz: vz } = solid;

        if (point?.geometry) {
          // Pręty stoją na DWÓCH RÓŻNYCH PRZEKĄTNYCH zbiornika: A po jednej,
          // B po drugiej. Na każdej wysokości jest więc para 1A/1B, 2A/2B,
          // 3A/3B — dokładnie tak, jak sondy są przywiązane do prętów.
          const radius = Math.min(solid.w, solid.d) * 0.3;
          px = vx + (point.geometry.diagonal === 'A' ? -radius : radius);
          pz = vz - radius;
          py = levelHeight(point.geometry.level, solid.height) + PLINTH_H;
        } else {
          // Sondy bez zadeklarowanej geometrii (np. bufor) rozkładamy po
          // wysokości w kolejności, w jakiej stoją na rysunku.
          const siblings = scene3d.sensors
            .filter((s) => s.vesselId === vessel.id)
            .sort((a, b) => a.y - b.y);
          const index = siblings.findIndex((s) => s.pointId === sensor.pointId);
          const fraction = (index + 1) / (siblings.length + 1);
          px = vx;
          pz = vz;
          py = solid.height * (1 - fraction) + PLINTH_H;
        }
      } else {
        const [sx, sz] = boxCenterWorld(sensor, scene3d);
        px = sx;
        pz = sz;
        py = sensor.height / 2 + PLINTH_H;
      }

      const size = Math.min(sensor.w, sensor.h) * WORLD_SCALE * 0.9;
      const geometry = new THREE.BoxGeometry(size, sensor.height * 0.8, size);

      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: 0xeceee9, roughness: 0.4, metalness: 0.02 }),
      );
      mesh.position.set(px, py, pz);
      mesh.castShadow = true;
      scene.add(mesh);

      // Obwódka pasma przemiany — osobne oznaczenie, nie odcień.
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: ACCENT, linewidth: 2 }),
      );
      outline.position.copy(mesh.position);
      outline.visible = false;
      scene.add(outline);

      const labelEl = labelPill(sensor.pointId, 'sensor');
      const label = new CSS2DObject(labelEl);
      label.position.set(px, py + sensor.height * 0.62, pz);
      scene.add(label);

      sensorHandles.push({ pointId: sensor.pointId, mesh, outline, label: labelEl });
    }

    // --- Pręty pozycjonujące w zbiorniku PCM ------------------------------
    const storageSolid = storage ? solids.get(storage.id) : undefined;
    if (storageSolid) {
      const radius = Math.min(storageSolid.w, storageSolid.d) * 0.26;
      for (const dx of [-radius, radius]) {
        const rod = new THREE.Mesh(
          new THREE.CylinderGeometry(0.045, 0.045, storageSolid.height * 0.92, 8),
          new THREE.MeshStandardMaterial({ color: 0xb6bdb6, roughness: 0.5 }),
        );
        rod.position.set(
          storageSolid.cx + dx,
          storageSolid.height * 0.46 + PLINTH_H,
          storageSolid.cz - radius,
        );
        scene.add(rod);
      }
    }

    // --- Rury -------------------------------------------------------------
    for (const pipe of scene3d.pipes) {
      if (pipe.points.length < 2) continue;

      const points = pipe.points.map(([x, y]) => {
        const [wx, wz] = toWorld(x, y, scene3d);
        return new THREE.Vector3(wx, 0.55, wz);
      });

      // Lekkie zaokrąglenie narożników, żeby rura nie była kanciasta.
      const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.04);
      const color = pipe.isReturn ? PIPE_COOL : PIPE_WARM;

      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, Math.max(40, points.length * 12), 0.07, 10, false),
        new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1 }),
      );
      tube.castShadow = true;
      scene.add(tube);

      // Strzałka kierunku — pokazuje, gdzie płynie, nie sugerując ruchu.
      const tip = curve.getPoint(0.9);
      const tangent = curve.getTangent(0.9).normalize();
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.17, 0.42, 12),
        new THREE.MeshStandardMaterial({ color, roughness: 0.4 }),
      );
      cone.position.copy(tip);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
      scene.add(cone);
    }

    sensorsRef.current = sensorHandles;
    devicesRef.current = devices;
    setReady(true);

    // --- Pętla renderowania -----------------------------------------------
    let raf = 0;
    let rotating = true;
    // Wlasny pomiar czasu miedzy ramkami — THREE.Clock jest wycofany,
    // a potrzebujemy z niego tylko jednej liczby.
    let previousFrameMs = performance.now();

    const animate = (): void => {
      raf = requestAnimationFrame(animate);

      const nowMs = performance.now();
      // Ograniczenie na wypadek powrotu z uspionej karty: bez tego jeden
      // ogromny krok obrocilby kamere o przypadkowy kat.
      const delta = Math.min((nowMs - previousFrameMs) / 1000, 0.1);
      previousFrameMs = nowMs;

      if (rotating) {
        // Obrót kamery wokół środka sceny — powolny, żeby nie rozpraszał.
        const angle = delta * 0.12;
        camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      }

      controls.update();
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    };

    const rotateHandler = (event: Event): void => {
      rotating = (event as CustomEvent<boolean>).detail;
    };
    host.addEventListener('scene-rotate', rotateHandler);

    const resize = (): void => {
      camera.aspect = width() / height();
      camera.updateProjectionMatrix();
      renderer.setSize(width(), height());
      labelRenderer.setSize(width(), height());
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    animate();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      host.removeEventListener('scene-rotate', rotateHandler);
      controls.dispose();
      renderer.dispose();
      scene.traverse((node) => {
        if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments) {
          node.geometry.dispose();
          const material = node.material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material.dispose();
        }
      });
      renderer.domElement.remove();
      labelRenderer.domElement.remove();
      sensorsRef.current = [];
      devicesRef.current = [];
      sceneRef.current = null;
      floorMaterialRef.current = null;
    };
    // Scena budowana RAZ. Dane i motyw wchodzą osobnymi efektami, bez przebudowy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene3d]);

  /* --- Motyw: przemalowanie bez przebudowy -------------------------------- */
  //
  // Trzy kolory zależne od motywu: tło, mgła (ta sama barwa, żeby dal znikał
  // w tle, a nie odcinał się od niego kreską) i podłoga. Kamera, obrót
  // i widoczność podpisów pozostają nietknięte.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const sceneBg = themeColor('--scene-bg', BG);
    scene.background = sceneBg;
    if (scene.fog) scene.fog.color.copy(sceneBg);
    floorMaterialRef.current?.color.copy(themeColor('--scene-floor', FLOOR));
    // `ready` w zależnościach: przy pierwszym przebiegu scena jeszcze nie stoi,
    // a bez tego przemalowanie po jej zbudowaniu by nie nastąpiło.
  }, [theme, ready]);

  /* --- Przekazanie przełącznika obrotu do pętli -------------------------- */
  useEffect(() => {
    hostRef.current?.dispatchEvent(new CustomEvent('scene-rotate', { detail: autoRotate }));
  }, [autoRotate]);

  /* --- Widoczność etykiet ------------------------------------------------ */
  useEffect(() => {
    if (labelRootRef.current) {
      labelRootRef.current.style.display = showLabels ? '' : 'none';
    }
  }, [showLabels, ready]);

  /* --- Aktualizacja danych: bez przebudowy sceny ------------------------- */
  useEffect(() => {
    if (!ready || !profile) return;
    const now = Date.now();

    for (const handle of sensorsRef.current) {
      const point = pointMap.get(handle.pointId);
      const value = data.values[handle.pointId];
      const state = pointState(point, value, staleAfterMs, now, channelAlive);
      const usable = state === 'ok' || state === 'stale';
      const numeric = usable ? (value?.v ?? null) : null;

      const material = handle.mesh.material as THREE.MeshStandardMaterial;
      material.color.set(temperatureFill(numeric, profile));
      material.opacity = state === 'not-connected' ? 0.35 : 1;
      material.transparent = state === 'not-connected';

      handle.outline.visible = state === 'ok' && isInPhaseBand(numeric, profile);

      const text = point && value ? formatValue(value, point) : NO_DATA;
      handle.label.textContent = `${handle.pointId}  ${text}`;
      handle.label.dataset.state = state;
    }

    for (const device of devicesRef.current) {
      const point = pointMap.get(device.statePoint);
      const value = data.values[device.statePoint];
      const state = pointState(point, value, staleAfterMs, now, channelAlive);
      const material = device.led.material as THREE.MeshStandardMaterial;

      if (state === 'ok') {
        const active = (value?.v ?? 0) !== 0;
        material.color.set(active ? 0x4caf50 : 0xcfd4cd);
        material.emissive.set(active ? 0x1f5c2a : 0x000000);
      } else {
        // Nie wiemy, czy pracuje. To nie to samo co „nie pracuje”.
        material.color.set(0xd9dcd8);
        material.emissive.set(0x000000);
      }
    }
  }, [ready, profile, data.values, pointMap, staleAfterMs]);

  const resetCamera = (): void => {
    cameraRef.current?.position.copy(CAMERA_HOME);
    controlsRef.current?.target.copy(CAMERA_TARGET);
  };

  if (webglError) {
    return (
      <div className="canvas">
        <div className="note is-bad">{webglError}</div>
      </div>
    );
  }

  return (
    <section className="canvas canvas--3d">
      <div className="canvas__tools">
        <button
          type="button"
          className={`tool${autoRotate ? ' is-on' : ''}`}
          onClick={() => setAutoRotate((value) => !value)}
          title={autoRotate ? 'Zatrzymaj obrót' : 'Włącz obrót'}
        >
          ⟳
        </button>
        <button
          type="button"
          className={`tool${showLabels ? ' is-on' : ''}`}
          onClick={() => setShowLabels((value) => !value)}
          title={showLabels ? 'Ukryj podpisy' : 'Pokaż podpisy'}
        >
          A
        </button>
        <button type="button" className="tool" onClick={resetCamera} title="Ustaw kamerę wyjściowo">
          ⌂
        </button>
      </div>

      <div className="stage3d" ref={hostRef} />

      <p className="flow-note">
        Ten sam układ co w widoku 2D — współrzędne bryły i rur pochodzą z tego samego pliku
        schematu. Wnętrze zbiornika jest odwzorowane przestrzennie: wysokość sondy to jej poziom,
        a położenie w rzucie wynika z przekątnej A/B. Obracaj przeciągnięciem, przybliżaj kółkiem.
      </p>
    </section>
  );
}
