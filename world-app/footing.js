// Sure footing (v27, Psalm 18:33: "he maketh my feet like hinds' feet, and
// setteth me upon my high places"; Proverbs 4:12, "when thou runnest, thou
// shalt not stumble").
//
// Until now the walker passed straight through the garden's rock — into the
// eagle's crag and out the other side, through the dove's stepped rock and
// the conies' houses — and a tap on the far side of the crag walked him
// through the middle of it. The rock is now solid ground he goes round. It
// is kept deliberately simple, so that it can never be the thing he gets
// stuck on:
//
// - Each solid is one circle on the ground (garden.js lists them). A step
//   that ends inside one is set back out to its edge along the line from
//   its centre, which keeps whatever part of the step ran along the rock —
//   so a walk into the side of the crag slides on round it, and only a
//   walk aimed dead at its middle comes to a stop there, facing it.
// - A tap-walk whose straight way is blocked steers for the tangent of the
//   rock on the side nearer its line (never the side pressed against the
//   garden's rim, where there is no way through), keeps to that side until
//   the way is clear, and then makes for the place again. A tap on the rock
//   itself is taken as a tap at its foot.
//
// No trees or creatures are solid: only rock, which nothing in the garden
// ever moves.

const MARGIN = 0.35;   // how near his middle may come to the rock's edge
const PASS = 0.9;      // how wide of the rock a planned way goes round it

export function createFooting(solids, radius) {
  const list = solids.filter(Boolean).map(s => ({ x: s.x, z: s.z, r: s.r + MARGIN }));

  // Set a position (anything with x and z) back out of any rock it is in.
  // Twice through, so two rocks shouldered together can't hand it back and
  // forth into each other.
  function keepOut(p) {
    for (let pass = 0; pass < 2; pass++) {
      for (const s of list) {
        const dx = p.x - s.x, dz = p.z - s.z;
        const d = Math.hypot(dx, dz);
        if (d >= s.r) continue;
        if (d < 1e-4) { p.x = s.x + s.r; continue; }
        p.x = s.x + (dx / d) * s.r;
        p.z = s.z + (dz / d) * s.r;
      }
      // The crag stands out over the rim: never set him back out past it.
      const r = Math.hypot(p.x, p.z);
      if (r > radius) { p.x *= radius / r; p.z *= radius / r; }
    }
    return p;
  }

  // A place to walk to, moved out to the foot of any rock it lies inside —
  // the nearest foot, unless that lies out past the rim (`lim`), when it is
  // the foot on the side toward the heart of the garden instead.
  function clear(x, z, lim = radius - 0.5) {
    const p = keepOut({ x, z });
    if (Math.hypot(p.x, p.z) <= lim) return { x: p.x, z: p.z };
    for (const s of list) {
      if (Math.hypot(x - s.x, z - s.z) >= s.r) continue;
      const d = Math.hypot(s.x, s.z) || 1;
      return { x: s.x - (s.x / d) * s.r, z: s.z - (s.z / d) * s.r };
    }
    const r = Math.hypot(p.x, p.z);
    return { x: p.x * lim / r, z: p.z * lim / r };
  }

  // The direction to step in from `pos` toward `target`, going round any rock
  // in the way. `memo` is the walk's own record of which side it chose for
  // each rock, so the choice holds steady instead of dithering at the
  // middle. Returns { x, z } (unit) and whether it is going round anything.
  function steer(pos, target, memo) {
    let dx = target.x - pos.x, dz = target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-4) return { x: 0, z: 0, round: false };
    dx /= dist; dz /= dist;
    // The nearest rock the straight way actually runs into: the nearest
    // point of the way to its centre lies inside it. (A place at the rock's
    // own foot is not blocked by it — the way there only meets its edge.)
    let block = null, blockAlong = Infinity;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const cx = s.x - pos.x, cz = s.z - pos.z;
      const along = Math.min(Math.max(cx * dx + cz * dz, 0), dist);
      const gap = Math.hypot(cx - dx * along, cz - dz * along);
      if (gap >= s.r - 0.05) continue;
      if (along < blockAlong) { block = i; blockAlong = along; }
    }
    if (block === null) return { x: dx, z: dz, round: false };

    const s = list[block];
    const cx = s.x - pos.x, cz = s.z - pos.z;
    const cd = Math.hypot(cx, cz);
    const ring = s.r + PASS;
    if (memo[block] === undefined) {
      // The side the rock's middle is not on — unless that way runs out
      // against the rim of the garden, where there is no way round at all.
      let side = (cx * dz - cz * dx) > 0 ? 1 : -1;
      const passX = s.x + side * -dz * ring, passZ = s.z + side * dx * ring;
      if (Math.hypot(passX, passZ) > radius - 1) side = -side;
      memo[block] = side;
    }
    const side = memo[block];
    // Head for the tangent of the passing ring on that side; already within
    // the ring, walk round it.
    const toC = Math.atan2(cx, cz);
    let heading;
    if (cd > ring) heading = toC - side * Math.asin(ring / cd);
    else heading = toC - side * (Math.PI / 2 + 0.15);
    return { x: Math.sin(heading), z: Math.cos(heading), round: true, block };
  }

  // The walk going round rock `block` has come to a stand against the rim
  // (or another rock): try the other side of it.
  function flip(memo, block) {
    if (memo[block] !== undefined) memo[block] = -memo[block];
  }

  return { keepOut, clear, steer, flip, count: list.length };
}
