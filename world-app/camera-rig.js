// Third-person follow camera in the WoW/Sky mold: it trails behind-and-above
// the character, easing toward its desired pose with frame-rate-independent
// smoothing. On entry it holds a brief wide establishing shot of the sacred
// trees before settling in behind the character; any input skips ahead.
//
// AB#127, a small figure in a large place: the camera stands well back and
// looks out level over his head at the garden beyond him, rather than down
// at his back, and it sees as much as the screen's shape allows.

import * as THREE from 'three';
import { clamp, damp, smoothstep, shortestAngle } from './util.js';

const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();

// How much the camera sees follows the screen's shape. A tall phone gets a
// tall view, 72° from top to bottom (about 37° across); a wide screen is
// held to 90° across instead, since past that the edges of the picture
// stretch. (A screen 1.38 times wider than tall is where the two meet.)
export const FOV_TALL = 72;
export const FOV_ACROSS_MAX = 90;
const DEG = Math.PI / 180;

export function fovFor(aspect) {
  const across = Math.tan((FOV_ACROSS_MAX / 2) * DEG);
  const fitted = (2 * Math.atan(across / Math.max(aspect, 0.1))) / DEG;
  return Math.min(FOV_TALL, fitted);
}

export class CameraRig {
  constructor(camera, target, heightAt) {
    this.camera = camera;
    this.target = target;          // the character's root group
    this.heightAt = heightAt;

    // 10.5 m behind him and 3.4 m up, looking 9 m past him at that same
    // height: a level gaze, so he stands low in the picture with the garden
    // and its sky opening out above him (was 6.4 m back, 3.0 m up, looking
    // down at a point 0.9 m ahead of him, 1.4 m up).
    this.distance = 10.5;
    this.height = 3.4;
    this.ahead = 9;
    this.lookHeight = 3.4;
    this.posLambda = 3.0;          // higher = snappier trailing
    this.lookLambda = 5.5;
    // v25 (Proverbs 4:26): the camera swings round behind the walker on its
    // own slower yaw, apart from how closely it keeps his distance. Steering
    // is read against the camera, so when the camera turned as fast as he
    // did, a held sideways drag chased its own tail and spun him on the
    // spot; now it carves a wide, calm arc and he walks where the thumb says.
    this.yawLambda = 1.0;
    this.yaw = target.rotation.y;

    this.lookPoint = new THREE.Vector3();
    this.intro = null;

    // v34 (Psalm 8:3): lying back in the grass, he looks up, and the camera
    // goes with his eyes — blended over the follow pose by `gaze`, 0..1. The
    // follow pose itself keeps easing along underneath, untouched, so when
    // he gets up again the camera comes back to exactly where it would be.
    this.gaze = 0;
    this.gazeEye = new THREE.Vector3();
    this.gazeLook = new THREE.Vector3();
    this._followPos = new THREE.Vector3();
    this._followLook = new THREE.Vector3();
    this._blended = false;
  }

  // Fits the view to the screen: its shape, and how much it sees (fovFor).
  fit(width, height) {
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.fov = fovFor(this.camera.aspect);
    this.camera.updateProjectionMatrix();
  }

  // k: 0..1 how far the view is his own, looking up; eye/look: where the
  // camera is then, and the point it looks at.
  setGaze(k, eye = null, look = null) {
    this.gaze = k;
    if (eye) this.gazeEye.copy(eye);
    if (look) this.gazeLook.copy(look);
  }

  _desiredPosition(out) {
    const yaw = this.yaw;
    out.set(
      this.target.position.x - Math.sin(yaw) * this.distance,
      this.target.position.y + this.height,
      this.target.position.z - Math.cos(yaw) * this.distance,
    );
    return out;
  }

  // Where the camera looks from `from`: on along the line from it through
  // him, `ahead` metres past him. (Not along the way he faces: with the
  // point this far out, a look that followed his turning would swing him
  // off the side of a phone's narrow picture.) The gaze is level when the
  // camera stands where it means to; when it stands higher or lower over
  // him than that (a slope behind him, the rule that keeps it out of the
  // hillside, the climb up the ladder), it tips by just enough to keep his
  // feet at the same place in the picture.
  _desiredLook(out, from) {
    const p = this.target.position;
    let dx = p.x - from.x, dz = p.z - from.z;
    const flat = Math.hypot(dx, dz);
    if (flat > 1e-3) { dx /= flat; dz /= flat; }
    else { dx = Math.sin(this.yaw); dz = Math.cos(this.yaw); }
    const meant = Math.atan2(this.height, this.distance);
    const seen = Math.atan2(from.y - p.y, Math.max(flat, 1));
    const level = Math.atan2(this.height - this.lookHeight, this.distance + this.ahead);
    const pitch = level + clamp(seen - meant, -0.5, 0.6);
    out.set(
      p.x + dx * this.ahead,
      from.y - Math.tan(pitch) * (flat + this.ahead),
      p.z + dz * this.ahead,
    );
    return out;
  }

  // Opening shot: a slow dolly-in from high behind the character, straight
  // down the axis they face — the sacred trees stay centre-frame the whole
  // descent into the follow pose.
  beginIntro(focus, duration = 3.8) {
    const p = this.target.position;
    this.intro = {
      t: 0,
      dur: duration,
      fromPos: new THREE.Vector3(p.x, p.y + 9, p.z - 18),
      fromLook: focus.clone().setY(focus.y + 2.2),
    };
    this.yaw = this.target.rotation.y;
    this.camera.position.copy(this.intro.fromPos);
    this.lookPoint.copy(this.intro.fromLook);
    this.camera.lookAt(this.lookPoint);
  }

  // Straight into the follow pose, with no easing: on a change of realm
  // (AB#106) there is nothing in the new place to ease from.
  snap() {
    this.intro = null;
    this._blended = false;
    this._desiredPosition(this.camera.position);
    const floor = this.heightAt(this.camera.position.x, this.camera.position.z) + 0.6;
    if (this.camera.position.y < floor) this.camera.position.y = floor;
    this._desiredLook(this.lookPoint, this.camera.position);
    this.camera.lookAt(this.lookPoint);
  }

  // Ease out of the intro quickly (but smoothly) — called on first input.
  skipIntro() {
    if (this.intro) this.intro.dur = Math.min(this.intro.dur, this.intro.t + 0.45);
  }

  // Yaw of the camera's current view line toward the character — the frame
  // of reference the drag vector is interpreted in.
  getYaw() {
    return Math.atan2(
      this.target.position.x - this.camera.position.x,
      this.target.position.z - this.camera.position.z,
    );
  }

  update(dt) {
    // Last frame's view was blended toward his eyes: take the follow pose
    // back up where it was left, so the easing below carries on from it.
    if (this._blended) {
      this.camera.position.copy(this._followPos);
      this.lookPoint.copy(this._followLook);
      this._blended = false;
    }
    // Coming back toward the camera — a drag down, or the down arrow — it
    // holds its bearing and backs away before him rather than swinging round
    // behind; otherwise he turns to face a camera that keeps fleeing round
    // him, and a held drag toward it walks him in a tight circle for ever.
    const off = shortestAngle(this.yaw, this.target.rotation.y);
    const follow = smoothstep(Math.PI * 0.75, Math.PI * 0.55, Math.abs(off));
    this.yaw += off * follow * (1 - Math.exp(-this.yawLambda * dt));
    const desired = this._desiredPosition(_desired);

    if (this.intro) {
      this.intro.t += dt;
      const k = smoothstep(0, 1, this.intro.t / this.intro.dur);
      const look = this._desiredLook(_look, desired);
      this.camera.position.lerpVectors(this.intro.fromPos, desired, k);
      this.lookPoint.lerpVectors(this.intro.fromLook, look, k);
      if (this.intro.t >= this.intro.dur) this.intro = null;
    } else {
      const c = this.camera.position;
      c.x = damp(c.x, desired.x, this.posLambda, dt);
      c.y = damp(c.y, desired.y, this.posLambda, dt);
      c.z = damp(c.z, desired.z, this.posLambda, dt);
    }

    // Never sink into a hillside.
    const floor = this.heightAt(this.camera.position.x, this.camera.position.z) + 0.6;
    if (this.camera.position.y < floor) this.camera.position.y = floor;

    if (!this.intro) {
      // Past him from where the camera now is, after the hillside rule.
      const look = this._desiredLook(_look, this.camera.position);
      this.lookPoint.x = damp(this.lookPoint.x, look.x, this.lookLambda, dt);
      this.lookPoint.y = damp(this.lookPoint.y, look.y, this.lookLambda, dt);
      this.lookPoint.z = damp(this.lookPoint.z, look.z, this.lookLambda, dt);
    }

    if (this.gaze > 0.001) {
      this._followPos.copy(this.camera.position);
      this._followLook.copy(this.lookPoint);
      const g = smoothstep(0, 1, this.gaze);
      this.camera.position.lerp(this.gazeEye, g);
      this.lookPoint.lerp(this.gazeLook, g);
      this._blended = true;
      // On the way down to his eyes, never through a bank.
      const low = this.heightAt(this.camera.position.x, this.camera.position.z) + 0.35;
      if (this.camera.position.y < low) this.camera.position.y = low;
    }

    this.camera.lookAt(this.lookPoint);
  }
}
