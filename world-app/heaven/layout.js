// Where everything in heaven stands (AB#106) — one place to read it, so
// every module agrees. North is +z, as in Eden. The walker comes up the
// ladder at its head in the south, facing north, and the whole of heaven
// opens before him: the street of gold and the river of the water of life
// running up the middle toward the glory, the saints standing in ranks on
// both banks, and the Tree of Life over the river beyond them.

export const RADIUS = 45;                       // how far the walk may wander

// The head of the ladder, where it comes up through an opening in the sea of
// glass — and the way down again. He arrives a little north of it, far
// enough that the follow camera starts out in front of it, not over it.
export const LADDER_HEAD = { x: 0, z: -26, r: 1.7 };
export const ARRIVAL = { x: 0, z: -18.5, facing: 0 };

// The glory (Revelation 21:23; 4:3): light alone, out past where the walk
// can reach, with the emerald bow round about it. No throne and no figure.
export const GLORY = { x: 0, y: 20, z: 68 };

// The river of the water of life, clear as crystal, proceeding out of the
// glory down the middle of the street (Revelation 22:1), and the street of
// pure gold, as it were transparent glass, on either side of it (21:21).
export const RIVER = { halfWidth: 1.25, from: -14 };
export const STREET = { halfWidth: 2.9 };

// The Tree of Life, on either side of the river (Revelation 22:2): a trunk on
// each bank of it, one crown over the water.
export const TREE = { z: 35, trunkX: 2.35 };

// The saints in ranks on both banks, from just before the arrival to just
// before the tree: four rows a side, twenty ranks deep.
export const RANKS = { rowsX: [3.9, 6.1, 8.3, 10.5], from: -10.5, step: 2.15, count: 20 };

// Today's saint (if today keeps one) greets him at the head of the ladder.
export const GREETING = { x: 2.2, z: -15.4 };
