import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ArcherHandedness } from '../../types/biomechanics';
import { SKELETON, jointIndices } from '../drawing';
import { JOINT_LANDMARKS, armLandmarks, boneSides, cameraPose, type BoneSide, type CameraPreset, type SceneFrame, type ScenePose } from '../pose3d';
import type { JointName, Vec3 } from '../types';

/**
 * The three.js side of the 3D pose viewer. Only the viewer component imports
 * this, so three.js stays in its own lazily loaded chunk. It renders on demand
 * (pose changes, orbiting, resizes) rather than every animation frame.
 */

const COLORS: Record<BoneSide | 'joint' | 'highlight' | 'arrow', string> = {
  bow: '#2ee6ff',
  draw: '#ff6b1a',
  body: '#c9d1dc',
  joint: '#f3f6fa',
  highlight: '#ffc53d',
  arrow: '#ffc53d',
};
const BACKGROUND = '#05070b';
const FOV = 40;
const PRESET_MS = 450;
const BONE_RADIUS: Record<BoneSide, number> = { bow: 0.017, draw: 0.017, body: 0.012 };
const JOINT_RADIUS = 0.024;
const HIGHLIGHT_RADIUS = 0.05;

const Y_AXIS = new Vector3(0, 1, 0);
const HIDDEN = new Matrix4().makeScale(0, 0, 0);

function vector(point: Vec3) {
  return new Vector3(point.x, point.y, point.z);
}

export class PoseScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(FOV, 16 / 9, 0.05, 60);
  private readonly controls: OrbitControls;
  private readonly bones: InstancedMesh;
  private readonly joints: InstancedMesh;
  private readonly arrowShaft: Mesh;
  private readonly arrowHead: Mesh;
  private readonly sides: BoneSide[];
  private readonly arms: ReturnType<typeof armLandmarks>;
  private readonly resizeObserver: ResizeObserver;
  private frame = 0;
  private tween: { from: [Vector3, Vector3]; to: [Vector3, Vector3]; start: number } | null = null;
  private reducedMotion = false;
  private disposed = false;
  /** Called when the person starts orbiting, so the UI can drop the selected preset. */
  onUserMove: (() => void) | null = null;

  private readonly host: HTMLElement;
  private readonly layout: SceneFrame;

  constructor(host: HTMLElement, layout: SceneFrame, handedness: ArcherHandedness) {
    this.host = host;
    this.layout = layout;
    // Throws when WebGL is unavailable; the component turns that into a message.
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(this.renderer.domElement);

    this.scene.background = new Color(BACKGROUND);
    this.scene.add(new HemisphereLight('#ffffff', '#2a3442', 2.4));
    const sun = new DirectionalLight('#ffffff', 1.6);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);

    const grid = new GridHelper(6, 24, '#3d4d63', '#1c2532');
    grid.position.set(layout.center.x, layout.floorY, layout.center.z);
    // Grid lines run along and across the shooting line, so the floor reads the same from every preset.
    grid.rotation.y = Math.atan2(-layout.forward.z, layout.forward.x);
    this.scene.add(grid);

    this.sides = boneSides(handedness);
    this.arms = armLandmarks(handedness);
    this.bones = new InstancedMesh(new CylinderGeometry(1, 1, 1, 10), new MeshLambertMaterial(), SKELETON.length);
    this.sides.forEach((side, index) => this.bones.setColorAt(index, new Color(COLORS[side])));
    this.joints = new InstancedMesh(new SphereGeometry(1, 14, 10), new MeshLambertMaterial(), JOINT_LANDMARKS.length);
    JOINT_LANDMARKS.forEach((_, index) => this.joints.setColorAt(index, new Color(COLORS.joint)));
    const arrowMaterial = new MeshLambertMaterial({ color: COLORS.arrow });
    this.arrowShaft = new Mesh(new CylinderGeometry(0.006, 0.006, 1, 8), arrowMaterial);
    this.arrowHead = new Mesh(new ConeGeometry(0.018, 0.06, 12), arrowMaterial);
    for (const mesh of [this.bones, this.joints]) mesh.frustumCulled = false;
    this.scene.add(this.bones, this.joints, this.arrowShaft, this.arrowHead);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(vector(layout.center));
    this.controls.minDistance = 0.6;
    this.controls.maxDistance = 12;
    this.controls.addEventListener('change', this.requestRender);
    this.controls.addEventListener('start', this.handleStart);
    this.setReducedMotion(false);
    this.jumpTo('side');

    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(host);
    this.resize();
  }

  /** Shows a pose (or nobody, for null), with optional highlighted joints. */
  showPose(pose: ScenePose | null, highlight: JointName[], handedness: ArcherHandedness): void {
    const matrix = new Matrix4();
    const quaternion = new Quaternion();
    const start = new Vector3();
    const end = new Vector3();
    const direction = new Vector3();
    const point = (index: number) => pose?.points[index] ?? null;

    SKELETON.forEach(([a, b], index) => {
      const p = point(a);
      const q = point(b);
      if (!p || !q) { this.bones.setMatrixAt(index, HIDDEN); return; }
      start.set(p.x, p.y, p.z);
      end.set(q.x, q.y, q.z);
      direction.subVectors(end, start);
      const length = direction.length();
      if (length < 1e-6) { this.bones.setMatrixAt(index, HIDDEN); return; }
      quaternion.setFromUnitVectors(Y_AXIS, direction.divideScalar(length));
      const radius = BONE_RADIUS[this.sides[index]];
      matrix.compose(start.add(end).multiplyScalar(0.5), quaternion, new Vector3(radius, length, radius));
      this.bones.setMatrixAt(index, matrix);
    });

    const highlighted = new Set(highlight.flatMap((joint) => jointIndices(joint, handedness)));
    JOINT_LANDMARKS.forEach((landmark, index) => {
      const p = point(landmark);
      if (!p) { this.joints.setMatrixAt(index, HIDDEN); return; }
      const lit = highlighted.has(landmark);
      const radius = lit ? HIGHLIGHT_RADIUS : JOINT_RADIUS;
      matrix.compose(start.set(p.x, p.y, p.z), quaternion.identity(), new Vector3(radius, radius, radius));
      this.joints.setMatrixAt(index, matrix);
      this.joints.setColorAt(index, new Color(lit ? COLORS.highlight : COLORS.joint));
    });

    // The arrow runs from the draw hand to the bow hand, tip at the bow hand.
    const drawHand = point(this.arms.draw.wrist);
    const bowHand = point(this.arms.bow.wrist);
    const visible = Boolean(drawHand && bowHand);
    this.arrowShaft.visible = visible;
    this.arrowHead.visible = visible;
    if (drawHand && bowHand) {
      start.set(drawHand.x, drawHand.y, drawHand.z);
      end.set(bowHand.x, bowHand.y, bowHand.z);
      direction.subVectors(end, start);
      const length = direction.length();
      if (length > 1e-6) {
        quaternion.setFromUnitVectors(Y_AXIS, direction.divideScalar(length));
        const headLength = 0.06;
        const shaft = Math.max(0, length - headLength);
        this.arrowShaft.position.copy(start).addScaledVector(direction, shaft / 2);
        this.arrowShaft.quaternion.copy(quaternion);
        this.arrowShaft.scale.set(1, shaft, 1);
        this.arrowHead.position.copy(end).addScaledVector(direction, -headLength / 2);
        this.arrowHead.quaternion.copy(quaternion);
      } else {
        this.arrowShaft.visible = false;
        this.arrowHead.visible = false;
      }
    }

    this.bones.instanceMatrix.needsUpdate = true;
    this.joints.instanceMatrix.needsUpdate = true;
    if (this.joints.instanceColor) this.joints.instanceColor.needsUpdate = true;
    this.requestRender();
  }

  /** Moves to a preset camera, eased unless the person prefers reduced motion. */
  goTo(preset: CameraPreset): void {
    if (this.reducedMotion) { this.jumpTo(preset); return; }
    const pose = cameraPose(this.layout, preset, FOV);
    this.tween = {
      from: [this.camera.position.clone(), this.controls.target.clone()],
      to: [vector(pose.position), vector(pose.target)],
      start: performance.now(),
    };
    this.requestRender();
  }

  /** No easing of preset moves and no orbit momentum when motion should be reduced. */
  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.controls.enableDamping = !reduced;
    this.controls.dampingFactor = 0.12;
    if (reduced && this.tween) {
      const [position, target] = this.tween.to;
      this.tween = null;
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.controls.update();
    }
  }

  /** Releases the WebGL context, GPU buffers and listeners. Safe to call twice. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.removeEventListener('change', this.requestRender);
    this.controls.removeEventListener('start', this.handleStart);
    this.controls.dispose();
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    this.scene.traverse((object) => {
      const mesh = object as Partial<Mesh>;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.bones.dispose();
    this.joints.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private jumpTo(preset: CameraPreset) {
    const pose = cameraPose(this.layout, preset, FOV);
    this.tween = null;
    this.camera.position.copy(vector(pose.position));
    this.controls.target.copy(vector(pose.target));
    this.controls.update();
    this.requestRender();
  }

  private readonly handleStart = () => {
    this.tween = null;
    this.onUserMove?.();
  };

  private readonly resize = () => {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  };

  // Damped orbiting and preset moves keep asking for frames until they settle;
  // controls.update() fires 'change' while the camera still moves.
  private readonly requestRender = () => {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(this.renderFrame);
  };

  private readonly renderFrame = (now: number) => {
    this.frame = 0;
    if (this.tween) {
      const progress = Math.min(1, (now - this.tween.start) / PRESET_MS);
      const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
      this.camera.position.lerpVectors(this.tween.from[0], this.tween.to[0], eased);
      this.controls.target.lerpVectors(this.tween.from[1], this.tween.to[1], eased);
      if (progress >= 1) this.tween = null;
      else this.requestRender();
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
