// Heaven's own sky, light and air (AB#106). "There shall be no night there"
// (Revelation 22:5), and "the city had no need of the sun, neither of the
// moon, to shine in it: for the glory of God did lighten it" (21:23). So there
// is no clock here and no sun: the dome is warm gold low down, clearing to a
// luminous blue overhead, and brightest toward the glory in the north; the
// light falls from that same quarter and fills everything softly from all
// round. The air fades the far distance into the same gold.

import * as THREE from 'three';
import { smoothstep } from '../util.js';
import { GLORY } from './layout.js';

export const HEAVEN_HORIZON = new THREE.Color(0xF6E3BC);
const ZENITH = new THREE.Color(0xA8C3E3);
const TOWARD = new THREE.Color(0xFFF4DC);
const SKY_R = 420;

export function createHeavenSky(scene) {
  scene.fog = new THREE.Fog(HEAVEN_HORIZON.getHex(), 70, 260);

  const geo = new THREE.SphereGeometry(SKY_R, 32, 16);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const north = new THREE.Vector3(GLORY.x, 0, GLORY.z).normalize();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const up = Math.max(0, v.y);
    c.copy(HEAVEN_HORIZON).lerp(ZENITH, smoothstep(0.04, 0.75, up));
    // Brighter toward the glory, and most of all near the horizon there.
    const toward = Math.max(0, v.x * north.x + v.z * north.z);
    c.lerp(TOWARD, Math.pow(toward, 3) * (1 - smoothstep(0.1, 0.6, up)) * 0.85);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  dome.renderOrder = -1;
  scene.add(dome);

  // The light: from the glory's quarter, high, and an even fill from all
  // round, so nothing here stands in shadow.
  const glow = new THREE.DirectionalLight(0xFFF1D6, 1.15);
  glow.position.set(GLORY.x, GLORY.y + 40, GLORY.z);
  scene.add(glow);
  scene.add(new THREE.HemisphereLight(0xFFF8EA, 0xDDE8EE, 1.7));

  return { dome };
}
