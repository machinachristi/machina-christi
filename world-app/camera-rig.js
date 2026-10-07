// Third-person follow camera in the WoW/Sky mold: it trails behind-and-above
// the character, easing toward its desired pose with frame-rate-independent
// smoothing. On entry it holds a brief wide establishing shot of the sacred
// trees before settling in behind the character; any input skips ahead.

import * as THREE from 'three';
import { damp, smoothstep, shortestAngle } from './util.js';

const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();

export class CameraRig {
  constructor(camera, target, heightAt) {
    this.camera = camera;
    this.target = target;          // the character's root group
    this.heightAt = heightAt;

    this.distance = 6.4;
    this.height = 3.0;
    this.lookHeight = 1.4;
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

  _desiredLook(out) {
    const yaw = this.target.rotation.y;
    out.set(
      this.target.position.x + Math.sin(yaw) * 0.9,
      this.target.position.y + this.lookHeight,
      this.target.position.z + Math.cos(yaw) * 0.9,
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
    // Coming back toward the camera — a drag down, or the down arrow — it
    // holds its bearing and backs away before him rather than swinging round
    // behind; otherwise he turns to face a camera that keeps fleeing round
    // him, and a held drag toward it walks him in a tight circle for ever.
    const off = shortestAngle(this.yaw, this.target.rotation.y);
    const follow = smoothstep(Math.PI * 0.75, Math.PI * 0.55, Math.abs(off));
    this.yaw += off * follow * (1 - Math.exp(-this.yawLambda * dt));
    const desired = this._desiredPosition(_desired);
    const look = this._desiredLook(_look);

    if (this.intro) {
      this.intro.t += dt;
      const k = smoothstep(0, 1, this.intro.t / this.intro.dur);
      this.camera.position.lerpVectors(this.intro.fromPos, desired, k);
      this.lookPoint.lerpVectors(this.intro.fromLook, look, k);
      if (this.intro.t >= this.intro.dur) this.intro = null;
    } else {
      const c = this.camera.position;
      c.x = damp(c.x, desired.x, this.posLambda, dt);
      c.y = damp(c.y, desired.y, this.posLambda, dt);
      c.z = damp(c.z, desired.z, this.posLambda, dt);
      this.lookPoint.x = damp(this.lookPoint.x, look.x, this.lookLambda, dt);
      this.lookPoint.y = damp(this.lookPoint.y, look.y, this.lookLambda, dt);
      this.lookPoint.z = damp(this.lookPoint.z, look.z, this.lookLambda, dt);
    }

    // Never sink into a hillside.
    const floor = this.heightAt(this.camera.position.x, this.camera.position.z) + 0.6;
    if (this.camera.position.y < floor) this.camera.position.y = floor;

    this.camera.lookAt(this.lookPoint);
  }
}
