import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, NineSliceSprite, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import type { Crew, GameState, Room, Ship, SystemKind } from '../sim/types';

export interface SceneProps {
  state: GameState;
  selectedCrew: string | null;
  selectedWeapon: string | null;
  onRoom: (shipId: string, roomId: string) => void;
  onCrew: (crewId: string) => void;
  reducedMotion: boolean;
  enemyIntel?: boolean;
}

type Point = { x: number; y: number };
type RoomView = { room: Room; root: Container; floor: Graphics; detail: Graphics; glyph: Graphics; caption?: Text; overlay: Graphics; visualKey: string; floorColor: number };
type CrewView = { root: Container; body: Graphics; status: Graphics; statusKey: string; fromX: number; fromY: number; toX: number; toY: number; movedAt: number };
type Quality = 'auto' | 'high' | 'balanced' | 'performance';
const W = 1600;
const H = 600;
const C = {
  ink: 0x101b28, edge: 0x526576, pale: 0xd1d7d9, blue: 0x55beef,
  orange: 0xf1a15e, red: 0xf56b6b, green: 0x9de8b0,
};

function polygon(g: Graphics, points: number[], color: number, alpha = 1, line?: number) {
  g.poly(points).fill({ color, alpha });
  if (line !== undefined) g.stroke({ color: line, width: 2 });
}

function line(g: Graphics, points: number[], color: number, width = 1, alpha = 1) {
  g.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
  g.stroke({ color, width, alpha });
}

function label(parent: Container, value: string, x: number, y: number, size = 10, color = 0x8ca9ba) {
  const text = new Text({ text: value, style: { fontFamily: 'monospace', fontSize: size, fill: color, letterSpacing: 2 } });
  text.position.set(x, y);
  parent.addChild(text);
  return text;
}

function randomSource(seed: number) {
  let value = seed >>> 0 || 19;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

function background(parent: Container, image?: HTMLImageElement) {
  const g = new Graphics();
  parent.addChild(g);
  g.rect(0, 0, W, H).fill(0x050b16);
  if (image) {
    const stars = new Sprite(Texture.from(image));
    stars.width = W;
    stars.height = H;
    parent.addChild(stars);
  }
  const procedural = new Container();
  parent.addChild(procedural);
  procedural.visible = !image;
  const space = new Graphics();
  procedural.addChild(space);
  const rng = randomSource(74019);
  // Layered translucent ellipses supply a soft, fully original nebula without textures.
  for (let i = 0; i < 80; i++) {
    const x = rng() * W;
    const y = 90 + Math.sin(x / 260) * 145 + rng() * 150;
    space.ellipse(x, y, 80 + rng() * 180, 15 + rng() * 60)
      .fill({ color: i % 3 === 0 ? 0x583a78 : 0x16394f, alpha: 0.015 });
  }
  for (let i = 0; i < 640; i++) {
    const x = rng() * W;
    const y = rng() * H;
    const radius = rng() > 0.96 ? 1.5 : 0.45 + rng() * 0.65;
    space.circle(x, y, radius).fill({ color: i % 4 === 0 ? 0x6da6e4 : 0xc2d5e0, alpha: 0.2 + rng() * 0.65 });
    if (radius > 1.4) {
      space.circle(x, y, 4).fill({ color: 0x6da6e4, alpha: 0.07 });
      line(space, [x - 4, y, x + 4, y], 0x9bbddf, 0.5, 0.35);
    }
  }
  // Planet is deliberately below the enemy silhouette, not behind its room hitboxes.
  const planet = new Container();
  procedural.addChild(planet);
  const surface = new Graphics();
  planet.addChild(surface);
  surface.circle(1500, 950, 490).fill(0x18334d);
  for (let i = 0; i < 90; i++) {
    const x = 1050 + rng() * 850;
    const y = 470 + rng() * 450;
    surface.ellipse(x, y, 20 + rng() * 110, 3 + rng() * 15)
      .fill({ color: i % 3 === 0 ? 0x8a888a : 0x41607a, alpha: 0.15 + rng() * 0.3 });
  }
  const mask = new Graphics().circle(1500, 950, 490).fill(0xffffff);
  planet.addChild(mask);
  surface.mask = mask;
  for (let i = 14; i >= 0; i--) {
    space.circle(1500, 950, 491 + i * 0.9).stroke({ color: 0x70c7fa, width: 1.5, alpha: 0.012 + (14 - i) * 0.003 });
  }
  space.circle(1500, 950, 490).stroke({ color: 0x8fd5f3, width: 2, alpha: 0.7 });
  for (let i = 0; i < 9; i++) {
    const x = 25 + rng() * 1100;
    const y = 470 + rng() * 115;
    const r = 5 + rng() * 14;
    polygon(space, [x - r, y, x - r * 0.6, y - r * 0.6, x + r * 0.4, y - r,
      x + r, y, x + r * 0.3, y + r * 0.7, x - r * 0.4, y + r], 0x26303c, 1, 0x45505b);
    line(space, [x - r * 0.6, y - r * 0.6, x, y - r * 0.2, x + r * 0.4, y - r], 0x69717d, 1, 0.55);
  }
  const frame = new Graphics();
  const contact = new Container();
  parent.addChild(contact);
  contact.addChild(frame);
  polygon(frame, [1030, 35, 1550, 35, 1580, 65, 1580, 405, 1555, 430, 1055, 430, 1005, 380, 1005, 65],
    0x762d3c, 0.07, 0x653644);
  line(frame, [1030, 35, 1100, 35], C.red, 2, 0.7);
  line(frame, [1580, 340, 1580, 405, 1555, 430, 1490, 430], C.red, 2, 0.5);
  label(parent, 'TACTICAL / LOCAL SPACE', 200, 22, 15, 0x91adbf);
  const contactLabel = label(contact, 'HOSTILE CONTACT', 1040, 54, 15, 0xd29b9e);
  label(parent, 'WAYFARER / INTERNAL SCHEMATIC', 200, 548, 15);
  return { contact, contactLabel };
}

function systemGlyph(g: Graphics, kind: SystemKind, x: number, y: number, color: number) {
  g.position.set(x, y);
  const stroke = { color, width: 2.2 };
  switch (kind) {
    case 'shields':
      g.poly([-10, -11, 0, -8, 10, -11, 9, 2, 5, 9, 0, 13, -5, 9, -9, 2]).stroke(stroke);
      line(g, [0, -5, 0, 8], color, 1, 0.5);
      break;
    case 'oxygen':
      g.circle(-4, 0, 8).stroke(stroke);
      line(g, [8, 4, 14, 4, 14, 8, 8, 13, 15, 13], color, 1.8);
      break;
    case 'medbay':
      g.poly([-4, -12, 4, -12, 4, -4, 12, -4, 12, 4, 4, 4, 4, 12, -4, 12, -4, 4, -12, 4, -12, -4, -4, -4]).fill(color);
      break;
    case 'weapons':
      polygon(g, [-12, 7, 5, -10, 12, -3, -5, 14], color);
      line(g, [-4, 9, -9, 15, -13, 11], color, 3);
      line(g, [9, -9, 15, -15], color, 3);
      break;
    case 'engines':
      g.roundRect(-8, -9, 17, 18, 3).stroke(stroke);
      line(g, [-3, -6, -3, 6, 4, 6, 4, -6], color, 1);
      for (let i = -1; i < 2; i++) line(g, [-12, i * 6, -18, i * 8], color, 2);
      break;
    case 'cockpit':
      g.poly([-13, 8, -9, -7, 0, -12, 9, -7, 13, 8]).stroke(stroke);
      line(g, [-9, 1, 9, 1, 9, 8, -9, 8, -9, 1], color, 2);
      line(g, [0, -11, 0, 0], color, 2);
      break;
    case 'reactor':
      polygon(g, [1, -14, -10, 3, -1, 3, -4, 14, 11, -4, 3, -4, 7, -14], color);
      break;
    case 'sensors':
      g.circle(0, 0, 11).stroke(stroke);
      g.circle(0, 0, 4).fill(color);
      line(g, [0, -15, 0, -7, 7, 0, 15, 0, 0, 7, 0, 15, -7, 0, -15, 0], color, 1);
      break;
    case 'doors':
      g.rect(-10, -12, 20, 24).stroke(stroke);
      line(g, [0, -12, 0, 12], color, 2);
      break;
    case 'ew':
      line(g, [-15, 1, -9, 1, -5, -10, 1, 11, 7, -5, 11, 1, 16, 1], color, 2);
      break;
  }
}

class ShipView {
  root = new Container();
  bodyLayer = new Container();
  engines = new Container();
  fireLayer = new Container();
  fires = new Map<string, { root: Container; count: number }>();
  shieldLayer = new Container();
  shield = new Graphics();
  rooms = new Map<string, RoomView>();
  crew = new Map<string, CrewView>();
  crewLayer = new Container();
  roomLayer = new Container();
  doorLayer = new Graphics();
  shieldLevel = -1;
  doorsKey = '';
  cached = false;
  revealed = true;
  current: { current: SceneProps };
  grid: { x: number; y: number; unit: number; width: number; height: number };
  signature: string;
  player: boolean;
  ship: Ship;

  constructor(ship: Ship, parent: Container, current: { current: SceneProps }, hull?: Texture) {
    this.ship = ship;
    this.current = current;
    this.player = ship.id === 'player';
    this.signature = ShipView.layoutKey(ship);
    const bounds = ship.rooms.reduce((b, r) => ({
      minX: Math.min(b.minX, r.x), minY: Math.min(b.minY, r.y),
      maxX: Math.max(b.maxX, r.x + r.w), maxY: Math.max(b.maxY, r.y + r.h),
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    const width = ship.rooms.length ? Math.max(1, bounds.maxX - bounds.minX) : 12;
    const height = ship.rooms.length ? Math.max(1, bounds.maxY - bounds.minY) : 8;
    const unit = Math.min(540 / width, 285 / height);
    this.grid = {
      x: -width * unit / 2 - (ship.rooms.length ? bounds.minX : 0) * unit,
      y: -height * unit / 2 - (ship.rooms.length ? bounds.minY : 0) * unit,
      unit, width: width * unit, height: height * unit,
    };
    this.root.position.set(this.player ? 580 : 1290, this.player ? 292 : 242);
    this.root.scale.set(this.player ? 0.9 : 0.66);
    parent.addChild(this.root);
    this.shieldLayer.addChild(this.shield);
    this.root.addChild(this.shieldLayer, this.bodyLayer);
    this.drawHull(hull);
    this.bodyLayer.addChild(this.roomLayer);
    for (const room of ship.rooms) {
      const { x, y, w, h } = this.bounds(room);
      const root = new Container();
      root.position.set(x, y);
      root.eventMode = 'static';
      root.cursor = 'pointer';
      root.hitArea = new Rectangle(0, 0, w, h);
      root.on('pointertap', () => current.current.onRoom(ship.id, room.id));
      const floor = new Graphics();
      const detail = new Graphics();
      const glyph = new Graphics();
      const overlay = new Graphics();
      root.addChild(floor, detail, glyph, overlay);
      this.roomLayer.addChild(root);
      systemGlyph(glyph, room.system, w / 2, h / 2 - 2, room.system === 'medbay' ? 0xb64c56 : 0x526174);
      glyph.alpha = 0.8;
      const glyphScale = Math.min(1, w / 46, h / 45);
      glyph.scale.set(glyphScale);
      // Tile seams, wall consoles and deck labels are authored in room-local coordinates.
      for (let row = 0; row < room.h; row++) {
        for (let col = 0; col < room.w; col++) {
          if ((row + col) % 2 === 0)
            detail.rect(col * this.grid.unit + 4, row * this.grid.unit + 4,
              this.grid.unit - 8, this.grid.unit - 8).fill({ color: 0x8294a0, alpha: 0.08 });
        }
      }
      for (let tx = this.grid.unit; tx < w - 4; tx += this.grid.unit)
        line(detail, [tx, 4, tx, h - 4], 0x657785, 1, 0.4);
      for (let ty = this.grid.unit; ty < h - 4; ty += this.grid.unit)
        line(detail, [4, ty, w - 4, ty], 0x657785, 1, 0.4);
      line(detail, [4, h - 5, 4, 4, w - 5, 4], 0xf6fafb, 2, 0.65);
      line(detail, [5, h - 5, w - 5, h - 5, w - 5, 5], 0x596a76, 2, 0.5);
      detail.rect(5, 5, Math.min(22, w - 10), 5).fill(0x607382);
      for (let k = 0; k < Math.min(4, Math.floor((w - 10) / 6)); k++)
        detail.rect(7 + k * 5, 6, 3, 2).fill({ color: C.blue, alpha: 0.6 });
      detail.roundRect(w - 23, h - 12, 16, 6, 1).fill(0x768894);
      line(detail, [w - 21, h - 9, w - 10, h - 9], 0xc3e6ee, 1.2, 0.7);
      const caption = w > 95 && h > 70 ? label(root, room.system.toUpperCase(), 7, 15, 15, 0x475967) : undefined;
      this.rooms.set(room.id, { room, root, floor, detail, glyph, caption, overlay, visualKey: '', floorColor: -1 });
    }
    this.bodyLayer.addChild(this.doorLayer);
    this.root.addChild(this.crewLayer, this.engines, this.fireLayer);
    this.drawEngines();
  }

  static layoutKey(ship: Ship) {
    return JSON.stringify([ship.id, ship.rooms.map(r => [r.id, r.x, r.y, r.w, r.h, r.system])]);
  }

  bounds(room: Room) {
    return { x: this.grid.x + room.x * this.grid.unit, y: this.grid.y + room.y * this.grid.unit,
      w: room.w * this.grid.unit, h: room.h * this.grid.unit };
  }

  center(roomId?: string): Point {
    const room = this.rooms.get(roomId ?? '')?.room ?? this.ship.rooms[0];
    if (!room) return { x: this.root.x, y: this.root.y };
    const b = this.bounds(room);
    return { x: this.root.x + (b.x + b.w / 2) * this.root.scale.x,
      y: this.root.y + (b.y + b.h / 2) * this.root.scale.y };
  }

  drawHull(hull?: Texture) {
    const g = new Graphics();
    this.bodyLayer.addChild(g);
    const a = this.grid.width / 2;
    const b = this.grid.height / 2;
    if (hull) {
      // Nine-slicing stretches only the transparent aperture; room coordinates stay authoritative.
      const scale = 0.35;
      const top = this.player ? 270 : 285;
      const bottom = this.player ? 322 : 286;
      const right = this.player ? 364 : 361;
      const shell = new NineSliceSprite({
        texture: hull, leftWidth: 460, rightWidth: right, topHeight: top, bottomHeight: bottom,
      });
      shell.width = this.grid.width / scale + 460 + right;
      shell.height = this.grid.height / scale + top + bottom;
      shell.scale.set(scale);
      shell.position.set(-a - 460 * scale, -b - top * scale);
      g.roundRect(-a - 3, -b - 3, this.grid.width + 6, this.grid.height + 6, 5).fill(C.ink);
      this.bodyLayer.addChild(shell);
      return;
    }
    const paint = this.player ? 0x8a969f : 0x8e6264;
    const accent = this.player ? C.orange : 0xcf6956;
    // Wing spars, engine pods and forward prow surround the actual authored room envelope.
    for (const side of [-1, 1]) {
      const sy = (n: number) => side * n;
      polygon(g, [-a - 18, sy(b * 0.48), -a - 79, sy(b + 35), -a + 105, sy(b + 26),
        -a + 147, sy(b * 0.75), a - 12, sy(b * 0.7), a + 28, sy(b + 13),
        a - 55, sy(b + 35), -a + 42, sy(b + 48), -a - 85, sy(b + 46)],
      0x313e4c, 1, C.ink);
      polygon(g, [-a - 74, sy(b + 36), -a + 45, sy(b + 25), -a + 99, sy(b * 0.83),
        -a + 133, sy(b * 0.84), -a + 108, sy(b + 32), -a + 30, sy(b + 42)],
      paint, 1, 0x65727c);
      polygon(g, [-a + 4, sy(b + 29), -a + 26, sy(b + 27), -a + 57, sy(b + 39), -a + 36, sy(b + 42)], accent);
      for (let i = 0; i < 4; i++)
        line(g, [-a - 49 + i * 29, sy(b + 35), -a - 40 + i * 29, sy(b + 42)], 0x1e2b38, 1.5);
      g.roundRect(-a - 64, sy(b * 0.68) - 25, 97, 50, 9).fill(0x344454).stroke({ color: C.ink, width: 4 });
      g.rect(-a - 76, sy(b * 0.68) - 17, 17, 34).fill(0x1c2a38).stroke({ color: 0x5c7285, width: 2 });
      for (let i = 0; i < 5; i++)
        line(g, [-a - 55 + i * 9, sy(b * 0.68) - 17, -a - 55 + i * 9, sy(b * 0.68) + 17], 0x71818b, 2, 0.5);
    }
    polygon(g, [-a - 41, -b + 22, -a + 13, -b - 21, a - 35, -b - 21,
      a + 56, -b * 0.67, a + 87, -b * 0.27, a + 87, b * 0.37,
      a + 47, b * 0.8, a - 27, b + 22, -a + 12, b + 22, -a - 41, b - 22],
    0x202c3b, 1, 0x0b121e);
    polygon(g, [-a - 35, -b + 24, -a + 16, -b - 14, a - 35, -b - 14,
      a + 48, -b * 0.63, a + 77, -b * 0.25, a + 77, b * 0.35,
      a + 39, b * 0.74, a - 28, b + 15, -a + 15, b + 15, -a - 35, b - 24],
    paint, 1, 0x627788);
    polygon(g, [a + 23, -b * 0.74, a + 38, -b * 0.66, a + 65, -b * 0.26,
      a + 65, b * 0.34, a + 30, b * 0.77, a + 15, b * 0.84,
      a + 50, b * 0.32, a + 50, -b * 0.24], accent);
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 8; i++) {
        const x = -a + 25 + i * (this.grid.width - 35) / 8;
        line(g, [x, side * (b + 1), x + 8, side * (b + 14)], 0x394857, 1.5);
        g.circle(x + 10, side * (b + 9), 1.4).fill(0xb9c5cb);
      }
    }
    // Two turret assemblies remain external to room hit targets.
    for (const side of [-1, 1]) {
      g.roundRect(a * 0.46, side * (b + 12) - 8, 57, 16, 3).fill(0x243546).stroke({ color: 0x687d8c, width: 2 });
      g.rect(a * 0.46 + 48, side * (b + 12) - 3, 36, 6).fill(0xb3bfc5);
      g.rect(a * 0.46 + 71, side * (b + 12) - 4, 10, 8).fill(0x506171);
    }
    g.roundRect(-a - 3, -b - 2, this.grid.width + 6, this.grid.height + 4, 8)
      .fill(0x283646).stroke({ color: C.ink, width: 3 });
  }

  drawDoors(ship: Ship) {
    const g = this.doorLayer.clear();
    for (const door of ship.doors) {
      const a = this.rooms.get(door.a);
      const b = door.b ? this.rooms.get(door.b) : undefined;
      if (!a || !b) continue;
      const ra = this.bounds(a.room);
      const rb = this.bounds(b.room);
      const color = !this.revealed ? 0x74818c : door.health <= 0 ? 0x687785 : door.locked ? C.red : door.open ? 0x7dc7cf : C.orange;
      const vertical = Math.abs(ra.x + ra.w - rb.x) < 1 || Math.abs(rb.x + rb.w - ra.x) < 1;
      if (vertical) {
        const x = rb.x > ra.x ? ra.x + ra.w - 1 : ra.x + 1;
        const y = (Math.max(ra.y, rb.y) + Math.min(ra.y + ra.h, rb.y + rb.h)) / 2;
        g.rect(x - 3, y - 9, 6, 18).fill(color).stroke({ color: C.ink, width: 1.5 });
        if (door.open && this.revealed) g.rect(x - 2, y - 4, 4, 8).fill(C.ink);
      } else {
        const y = rb.y > ra.y ? ra.y + ra.h - 1 : ra.y + 1;
        const x = (Math.max(ra.x, rb.x) + Math.min(ra.x + ra.w, rb.x + rb.w)) / 2;
        g.rect(x - 9, y - 3, 18, 6).fill(color).stroke({ color: C.ink, width: 1.5 });
        if (door.open && this.revealed) g.rect(x - 4, y - 2, 8, 4).fill(C.ink);
      }
    }
  }

  update(ship: Ship, props: SceneProps) {
    this.ship = ship;
    this.revealed = this.player || props.enemyIntel !== false ||
      (ship.doctrine === 'derelict' && props.state.crew.some(c => c.home === 'player' && c.shipId === ship.id && c.health > 0));
    let dirty = !this.cached;
    const doorsKey = `${this.revealed}:` + ship.doors.map(d => `${d.id}:${d.open}:${d.locked}:${d.health > 0}`).join('|');
    if (doorsKey !== this.doorsKey) {
      this.doorsKey = doorsKey;
      this.drawDoors(ship);
      dirty = true;
    }
    for (const room of ship.rooms) {
      const view = this.rooms.get(room.id);
      if (!view) continue;
      view.room = room;
      const { w, h } = this.bounds(room);
      const system = ship.systems.find(s => s.kind === room.system);
      const targeted = props.state.ships.some(s => s.id !== ship.id && s.weapons.some(wp => wp.target === room.id));
      const selectedDestination = props.state.crew.find(c => c.id === props.selectedCrew)?.path.includes(room.id);
      const color = !this.revealed ? 0x73828f : room.oxygen < 0.25 ? 0x879fac : room.system === 'shields' ? 0xafcbd3 : C.pale;
      const damage = this.revealed && system ? Math.max(0, 1 - system.health / Math.max(1, system.max)) : 0;
      const oxygenRisk = this.revealed && room.oxygen < 0.3;
      const breach = this.revealed && room.breach > 0;
      const visualKey = `${color}:${damage}:${oxygenRisk}:${!!selectedDestination}:${!!props.selectedWeapon && !this.player}:${targeted}:${breach}:${this.revealed}`;
      if (view.visualKey === visualKey) continue;
      view.visualKey = visualKey;
      view.glyph.visible = this.revealed;
      if (view.caption) view.caption.visible = this.revealed;
      dirty = true;
      if (view.floorColor !== color) {
        view.floorColor = color;
        view.floor.clear().roundRect(1, 1, w - 2, h - 2, 3)
          .fill(color).stroke({ color: C.ink, width: 4 });
      }
      view.overlay.clear();
      if (damage > 0)
        view.overlay.rect(3, 3, w - 6, h - 6).fill({ color: C.red, alpha: damage * 0.24 });
      if (oxygenRisk) {
        for (let x = 6; x < w - 5; x += 11)
          line(view.overlay, [x, h - 5, Math.min(x + 7, w - 5), h - 12], 0x3c758e, 1.4, 0.55);
      }
      // Flatten the static deck, labels and hull into one GPU quad, not dozens of alternating batches.
      if (!this.cached) {
        this.bodyLayer.cacheAsTexture({ resolution: 1, antialias: false });
        this.cached = true;
      } else if (dirty) this.bodyLayer.updateCacheTexture();
      this.updateFires(ship);
      if (selectedDestination)
        view.overlay.roundRect(4, 4, w - 8, h - 8, 2).stroke({ color: C.green, width: 2 });
      if (props.selectedWeapon && !this.player)
        view.overlay.roundRect(4, 4, w - 8, h - 8, 2).stroke({ color: C.orange, width: 1, alpha: 0.6 });
      if (targeted) this.reticle(view.overlay, w / 2, h / 2, Math.min(w, h) * 0.4);
      if (breach) {
        polygon(view.overlay, [w - 19, 9, w - 9, 12, w - 13, 20, w - 22, 18, w - 25, 13], 0x152332, 1, C.red);
        line(view.overlay, [w - 18, 8, w - 16, 2, w - 10, 1], C.red, 1.4);
      }
    }
    const present = props.state.crew.filter(c => c.shipId === ship.id && c.health > 0 && (this.revealed || c.home === 'player'));
    for (const [id, view] of this.crew) {
      if (!present.some(c => c.id === id)) { view.root.destroy({ children: true }); this.crew.delete(id); }
    }
    for (const crew of present) this.updateCrew(crew, props);
  }

  updateCrew(crew: Crew, props: SceneProps) {
    const room = this.rooms.get(crew.room)?.room;
    if (!room) return;
    let view = this.crew.get(crew.id);
    if (!view) {
      const root = new Container();
      const status = new Graphics();
      const body = new Graphics();
      root.addChild(status, body);
      root.eventMode = 'static';
      root.cursor = 'pointer';
      root.hitArea = new Rectangle(-12, -20, 24, 35);
      root.on('pointertap', event => {
        event.stopPropagation();
        const latest = this.current.current;
        const liveCrew = latest.state.crew.find(c => c.id === crew.id);
        if (!liveCrew) return;
        if ((latest.selectedWeapon && liveCrew.shipId !== 'player') || liveCrew.home !== 'player')
          latest.onRoom(liveCrew.shipId, liveCrew.room);
        else latest.onCrew(liveCrew.id);
      });
      this.crewLayer.addChild(root);
      view = { root, status, body, statusKey: '', fromX: 0, fromY: 0, toX: 0, toY: 0, movedAt: -1 };
      this.crew.set(crew.id, view);
      const palette = crew.name === 'Mara' ? 0x63bada : crew.name === 'Ivo' ? 0x92bfa2 : crew.name === 'Kade' ? 0xe7ad68 : 0xc07d81;
      body.ellipse(0, 11, 10, 4).fill({ color: 0x111f2a, alpha: 0.3 });
      body.roundRect(-6, -2, 12, 14, 3).fill(palette).stroke({ color: C.ink, width: 1.6 });
      body.rect(-7, 1, 3, 7).fill(palette);
      body.rect(4, 1, 3, 7).fill(palette);
      body.rect(-5, 10, 4, 5).fill(0x243646);
      body.rect(1, 10, 4, 5).fill(0x243646);
      body.circle(0, -9, 7).fill(crew.species.toLowerCase() === 'human' ? 0xd6ac87 : 0x99b59b).stroke({ color: C.ink, width: 1.5 });
      polygon(body, [-7, -10, -6, -16, 3, -17, 7, -11, 3, -12, 0, -14, -3, -11], crew.name === 'Kade' ? 0xc69654 : 0x36404b);
      body.rect(-4, -10, 3, 2).fill(0x1a2834);
      body.rect(2, -10, 3, 2).fill(0x1a2834);
      body.rect(-2, -4, 4, 1).fill(0x704f42);
      body.rect(-2, 0, 4, 5).fill(0xdce9e9);
      body.rect(-1, 1, 2, 2).fill(palette);
    }
    const peers = props.state.crew.filter(c => c.shipId === crew.shipId && c.room === crew.room && c.health > 0);
    const index = peers.findIndex(c => c.id === crew.id);
    const b = this.bounds(room);
    let x = b.x + b.w * (index + 1) / (peers.length + 1);
    let y = b.y + b.h * 0.69;
    const next = crew.path[0] ? this.rooms.get(crew.path[0])?.room : undefined;
    if (next && crew.task === 'move') {
      const n = this.bounds(next);
      const t = Math.max(0, Math.min(1, crew.progress));
      x += (n.x + n.w / 2 - x) * t;
      y += (n.y + n.h * 0.69 - y) * t;
    }
    if (view.movedAt < 0) {
      view.root.position.set(x, y);
      view.toX = x;
      view.toY = y;
      view.movedAt = 0;
    } else if (view.toX !== x || view.toY !== y) {
      view.fromX = view.root.x;
      view.fromY = view.root.y;
      view.toX = x;
      view.toY = y;
      view.movedAt = performance.now();
    }
    view.root.scale.set(Math.min(1, b.w / 38, b.h / 44));
    const statusKey = `${props.selectedCrew === crew.id}:${crew.health}`;
    if (view.statusKey === statusKey) return;
    view.statusKey = statusKey;
    view.status.clear();
    if (props.selectedCrew === crew.id) {
      view.status.ellipse(0, 10, 13, 6).fill({ color: C.green, alpha: 0.13 }).stroke({ color: C.green, width: 1.6 });
      polygon(view.status, [-4, -26, 4, -26, 0, -21], C.green);
    }
    view.status.rect(-9, 18, 18, 3).fill(0x253846);
    view.status.rect(-9, 18, 18 * Math.max(0, Math.min(1, crew.health / 100)), 3).fill(crew.health < 30 ? C.red : C.green);
    if (view.root.isCachedAsTexture) view.root.updateCacheTexture();
    else view.root.cacheAsTexture({ resolution: 1, antialias: false });
  }

  reticle(g: Graphics, x: number, y: number, r: number) {
    g.circle(x, y, r).stroke({ color: C.red, width: 1.6 });
    for (const side of [-1, 1]) {
      line(g, [x + side * (r - 5), y, x + side * (r + 7), y], C.red, 2);
      line(g, [x, y + side * (r - 5), x, y + side * (r + 7)], C.red, 2);
    }
  }

  drawEngines() {
    const g = new Graphics();
    if (!this.player) g.scale.x = -1;
    this.engines.addChild(g);
    const a = this.grid.width / 2;
    const b = this.grid.height / 2;
    for (const side of [-1, 1]) {
      const y = side * b * 0.68;
      for (let i = 7; i > 0; i--)
        g.ellipse(-a - 78 - i * 3, y, 8 + i * 5, 2 + i * 1.7)
          .fill({ color: this.player ? 0x38afff : 0xf59566, alpha: 0.035 });
      polygon(g, [-a - 76, y - 10, -a - 135, y, -a - 76, y + 10],
        this.player ? C.blue : C.orange, 0.7);
      g.ellipse(-a - 77, y, 4, 10).fill(0xd6f4ff);
    }
    this.engines.cacheAsTexture({ resolution: 1, antialias: false });
  }

  updateFires(ship: Ship) {
    for (const room of ship.rooms) {
      const count = this.revealed ? Math.min(5, Math.ceil(room.fire * 5)) : 0;
      let fire = this.fires.get(room.id);
      if (fire?.count === count || (!fire && count === 0)) continue;
      if (fire) fire.root.destroy({ children: true });
      this.fires.delete(room.id);
      if (count === 0) continue;
      const root = new Container();
      this.fireLayer.addChild(root);
      fire = { root, count };
      this.fires.set(room.id, fire);
      const p = this.bounds(room);
      for (let i = 0; i < count; i++) {
        const g = new Graphics();
        const x = p.x + 12 + ((i * 19) % Math.max(1, p.w - 22));
        const y = p.y + p.h - 13;
        g.position.set(x, y);
        root.addChild(g);
        g.circle(0, -4, 13).fill({ color: 0xf47d42, alpha: 0.11 });
        polygon(g, [-6, 0, -5, -9, 0, -21, 2, -9, 6, -13, 6, 0],
          0xf29a4f, 0.95);
        polygon(g, [-3, 0, 0, -11, 4, 0], 0xffe6a3);
      }
      root.cacheAsTexture({ resolution: 1, antialias: false });
    }
  }

  animate(time: number, cosmetic: boolean) {
    let changed = false;
    if (cosmetic) {
      const pulse = 0.85 + Math.sin(time * 0.003) * 0.15;
      this.engines.alpha = pulse;
      this.shieldLayer.alpha = pulse;
      for (const fire of this.fires.values()) {
        fire.root.alpha = 0.85 + Math.sin(time * 0.009) * 0.15;
      }
      changed = true;
    }
    for (const view of this.crew.values()) {
      if (view.root.x === view.toX && view.root.y === view.toY) continue;
      const t = Math.min(1, Math.max(0, (time - view.movedAt) / 50));
      if (t === 1) view.root.position.set(view.toX, view.toY);
      else view.root.position.set(view.fromX + (view.toX - view.fromX) * t, view.fromY + (view.toY - view.fromY) * t);
      changed = true;
    }
    const shieldLevel = this.revealed ? this.ship.shields : 0;
    if (this.shieldLevel === shieldLevel) return changed;
    this.shieldLevel = shieldLevel;
    this.shield.clear();
    this.shieldLayer.visible = shieldLevel > 0;
    if (shieldLevel <= 0) return true;
    const a = this.grid.width / 2;
    const b = this.grid.height / 2;
    const rx = a + 145;
    const ry = b + 113;
    for (let i = 5; i > 0; i--)
      this.shield.ellipse(0, 0, rx + i * 2, ry + i * 2)
        .stroke({ color: C.blue, width: 2, alpha: 0.015 });
    this.shield.ellipse(0, 0, rx, ry).fill({ color: 0x167fbd, alpha: 0.11 })
      .stroke({ color: C.blue, width: 3, alpha: 0.48 });
    this.shield.ellipse(0, 0, rx - 8, ry - 8)
      .stroke({ color: 0x3fabe6, width: 10, alpha: 0.08 });
    const radius = 15;
    for (let row = -Math.ceil(ry / 26); row <= Math.ceil(ry / 26); row++) {
      for (let col = -Math.ceil(rx / 30); col <= Math.ceil(rx / 30); col++) {
        const x = col * radius * 3 + (row % 2) * radius * 1.5;
        const y = row * radius * 0.866;
        const d = (x / rx) ** 2 + (y / ry) ** 2;
        if (d < 0.7 || d > 0.92) continue;
        const points: number[] = [];
        for (let k = 0; k < 6; k++) points.push(x + Math.cos(k * Math.PI / 3) * radius, y + Math.sin(k * Math.PI / 3) * radius);
        this.shield.poly(points).stroke({ color: C.blue, width: 1, alpha: (d - 0.6) * 0.8 });
      }
    }
    if (this.shieldLayer.isCachedAsTexture) this.shieldLayer.updateCacheTexture();
    else this.shieldLayer.cacheAsTexture({ resolution: 1, antialias: false });
    return true;
  }
}

export default function Scene(props: SceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const [failure, setFailure] = useState(false);
  const [quality, setQuality] = useState<Quality>('auto');
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const [qualityDescription, setQualityDescription] = useState('detecting renderer');
  const [renderedFPS, setRenderedFPS] = useState<number | null>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const app = new Application();
    let cancelled = false;
    let initialized = false;
    let observer: ResizeObserver | undefined;
    let lastProps: SceneProps | undefined;
    const views = new Map<string, ShipView>();
    const world = new Container();
    let frameId = 0;
    let frameDirty = true;
    let hullTexture: Texture | undefined;
    let enemyHullTexture: Texture | undefined;
    const dispose = () => {
      observer?.disconnect();
      cancelAnimationFrame(frameId);
      if (initialized) {
        app.destroy(true, { children: true, texture: true, textureSource: true });
        if (hullTexture && !hullTexture.destroyed) hullTexture.destroy(true);
        if (enemyHullTexture && !enemyHullTexture.destroyed) enemyHullTexture.destroy(true);
        initialized = false;
      }
    };
    void (async () => {
      try {
        await app.init({
          antialias: false, background: 0x050b16, autoDensity: true,
          autoStart: false, sharedTicker: false, resolution: 1,
          width: Math.max(1, element.clientWidth), height: Math.max(1, element.clientHeight),
          preference: 'webgl',
        });
        initialized = true;
        if (cancelled) { dispose(); return; }
        app.stop();
        const gl = 'gl' in app.renderer ? app.renderer.gl as WebGLRenderingContext : undefined;
        const debug = gl?.getExtension('WEBGL_debug_renderer_info');
        const rendererName = debug ? String(gl?.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : '';
        const software = /swiftshader|llvmpipe|softpipe|software|basic render|warp/i.test(rendererName);
        app.canvas.setAttribute('aria-hidden', 'true');
        app.canvas.style.display = 'block';
        app.canvas.style.width = '100%';
        app.canvas.style.height = '100%';
        element.appendChild(app.canvas);
        app.stage.addChild(world);
        const image = new Image();
        image.src = new URL(`${import.meta.env.BASE_URL}art/space.png`, document.baseURI).href;
        let spaceImage: HTMLImageElement | undefined;
        try { await image.decode(); spaceImage = image; }
        catch { /* The complete procedural background remains available offline if an asset is missing. */ }
        if (cancelled) { dispose(); return; }
        const hull = new Image();
        hull.src = new URL(`${import.meta.env.BASE_URL}art/wayfarer-hull.png`, document.baseURI).href;
        try {
          await hull.decode();
          if (!cancelled) hullTexture = Texture.from(hull);
        } catch { /* Procedural hull plates remain the asset-independent fallback. */ }
        if (cancelled) { dispose(); return; }
        const hostileHull = new Image();
        hostileHull.src = new URL(`${import.meta.env.BASE_URL}art/corsair-hull.png`, document.baseURI).href;
        try {
          await hostileHull.decode();
          if (!cancelled) enemyHullTexture = Texture.from(hostileHull);
        } catch { /* Hostile contacts retain the original procedural hull fallback. */ }
        if (cancelled) { dispose(); return; }
        const backgroundLayer = new Container();
        world.addChild(backgroundLayer);
        const backdrop = background(backgroundLayer, spaceImage);
        backgroundLayer.cacheAsTexture({ resolution: 1, antialias: false });
        const effects = new Graphics();
        const fit = () => {
          if (cancelled) return;
          const width = Math.max(1, element.clientWidth);
          const height = Math.max(1, element.clientHeight);
          app.renderer.resize(width, height);
          frameDirty = true;
          const scale = Math.min(width / W, height / H);
          world.scale.set(scale);
          world.position.set((width - W * scale) / 2, (height - H * scale) / 2);
        };
        observer = new ResizeObserver(fit);
        observer.observe(element);
        fit();
        let effectsTick = -1;
        let effectsFraction = -1;
        let previousProjectiles: GameState['projectiles'] | undefined;
        let lastTick = latest.current.state.tick;
        let tickTime = performance.now() - 150;
        let appliedQuality: Quality | undefined;
        let measuredSince = performance.now();
        let submittedFrames = 0;
        const frame = (time: number) => {
          if (cancelled) return;
          frameId = requestAnimationFrame(frame);
          if (appliedQuality !== qualityRef.current) {
            appliedQuality = qualityRef.current;
            const dpr = window.devicePixelRatio || 1;
            // Software rasterizers draw one quarter as many pixels; the DOM HUD stays full resolution.
            const resolution = appliedQuality === 'performance' ? 0.5
              : appliedQuality === 'balanced' ? Math.min(dpr, 1)
                : appliedQuality === 'high' ? Math.min(dpr, 2)
                  : software ? 0.5 : Math.min(dpr, 1.5);
            app.renderer.resolution = resolution;
            fit();
            setQualityDescription(`${software ? 'software' : 'GPU'} · ${Math.round(resolution * 100)}% resolution`);
          }
          const p = latest.current;
          const tickChanged = p.state.tick !== lastTick;
          if (tickChanged) {
            lastTick = p.state.tick;
            tickTime = time;
          }
          let changed = frameDirty;
          frameDirty = false;
          if (lastProps !== p || tickChanged) {
            changed = true;
            const contactVisible = p.state.encounter !== 'none';
            const contactText = p.state.encounter === 'derelict' ? 'DERELICT / NO SIGNAL' : 'HOSTILE CONTACT';
            const backdropChanged = backdrop.contact.visible !== contactVisible || backdrop.contactLabel.text !== contactText;
            backdrop.contact.visible = contactVisible;
            if (backdrop.contactLabel.text !== contactText) backdrop.contactLabel.text = contactText;
            if (backdropChanged) backgroundLayer.updateCacheTexture();
            const player = p.state.ships.find(s => s.id === 'player');
            const contact = p.state.encounter === 'hostile' || p.state.encounter === 'surrender'
              ? p.state.ships.find(s => s.id !== 'player' && (s.doctrine === 'pirate' || s.doctrine === 'military'))
              : p.state.encounter === 'derelict'
                ? p.state.ships.find(s => s.doctrine === 'derelict')
                : p.state.encounter === 'won' ? p.state.ships.find(s => s.id === 'enemy') : undefined;
            const visible = player ? contact ? [player, contact] : [player] : [];
            for (const [id, view] of views) {
              if (!visible.some(s => s.id === id)) { view.root.destroy({ children: true }); views.delete(id); }
            }
            for (const ship of visible) {
              let view = views.get(ship.id);
              if (view && view.signature !== ShipView.layoutKey(ship)) {
                view.root.destroy({ children: true });
                views.delete(ship.id);
                view = undefined;
              }
              if (!view) {
                view = new ShipView(ship, world, latest, ship.id === 'player' ? hullTexture : enemyHullTexture);
                views.set(ship.id, view);
              }
              view.update(ship, p);
            }
            // Effects always stay above newly created ships.
            world.addChild(effects);
            lastProps = p;
          }
          // A stopped simulation settles after its final interpolated tick; paused frames submit no GPU work.
          const cosmetic = !p.reducedMotion && time - tickTime < 120;
          for (const view of views.values()) changed = view.animate(time, cosmetic) || changed;
          const fraction = Math.min(1, Math.max(0, (time - tickTime) / 50));
          if (effectsTick !== p.state.tick || previousProjectiles !== p.state.projectiles ||
            (p.state.projectiles.length > 0 && effectsFraction !== fraction)) {
            effectsTick = p.state.tick;
            effectsFraction = fraction;
            previousProjectiles = p.state.projectiles;
            changed = true;
            effects.clear();
            for (const projectile of p.state.projectiles) {
              const source = views.get(projectile.source);
              const target = views.get(projectile.target);
              if (!source || !target) continue;
              const start = source.center();
              const end = target.center(projectile.room);
              const t = 1 - Math.max(0, Math.min(1, (projectile.remaining - fraction) / Math.max(1, projectile.total)));
              const x = start.x + (end.x - start.x) * t;
              const y = start.y + (end.y - start.y) * t;
              const color = projectile.family === 'ion' ? C.blue : projectile.family === 'missile' ? C.orange : C.red;
              if (projectile.family === 'beam') {
                line(effects, [start.x, start.y, end.x, end.y], color, 5, 0.15);
                line(effects, [start.x, start.y, end.x, end.y], 0xffead5, 1.2, 0.85);
              } else {
                const tail = Math.max(0, t - 0.045);
                line(effects, [start.x + (end.x - start.x) * tail, start.y + (end.y - start.y) * tail, x, y], color, 3, 0.9);
                effects.circle(x, y, 7).fill({ color, alpha: 0.12 });
                effects.circle(x, y, 2).fill(0xffefd7);
              }
            }
          }
          if (changed) {
            app.render();
            submittedFrames++;
          }
          const measuredMS = time - measuredSince;
          if (measuredMS >= 1000) {
            setRenderedFPS(submittedFrames * 1000 / measuredMS);
            submittedFrames = 0;
            measuredSince = time;
          }
        };
        frameId = requestAnimationFrame(frame);
      } catch (error) {
        dispose();
        if (!cancelled) {
          console.error('Unable to initialize the tactical renderer', error);
          setFailure(true);
        }
      }
    })();
    return () => { cancelled = true; dispose(); };
  }, []);

  return <div ref={host} className="tactical-scene" role="region"
    aria-label="Tactical cutaway of Wayfarer and current contact. Use the room and crew controls for keyboard orders."
    style={{ width: '100%', height: '100%', minHeight: 280, overflow: 'hidden', position: 'relative' }}>
    {failure && <p role="status" style={{ color: '#b8ccd9', padding: 24 }}>
      Tactical graphics are unavailable. Room and crew orders remain available in the control panels.
    </p>}
    {!failure && <label style={{
      position: 'absolute', right: 12, top: 6, display: 'flex', alignItems: 'center', gap: 6,
      color: '#b8ccd9', background: '#08111df2', border: '1px solid #3c5264', padding: '3px 6px',
      fontSize: 11, lineHeight: '16px', whiteSpace: 'nowrap',
    }}>
      Graphics
      <select aria-label="Tactical graphics quality" value={quality} onChange={event => setQuality(event.target.value as Quality)}
        onKeyDown={event => event.stopPropagation()}
        style={{ color: '#dceaf3', background: '#132231', border: '1px solid #526b7e', fontSize: 11,
          height: 22, padding: '2px 4px', lineHeight: '16px' }}>
        <option value="auto">Auto</option>
        <option value="high">High</option>
        <option value="balanced">Balanced</option>
        <option value="performance">Performance</option>
      </select>
      <span>{qualityDescription}</span>
      <output data-testid="tactical-rendered-fps" aria-label="Actual tactical rendered frames per second"
        aria-live="off" data-rendered-fps={renderedFPS?.toFixed(1)}
        data-render-state={renderedFPS === null ? 'measuring' : renderedFPS === 0 ? 'idle' : 'rendering'}
        title="Successful app.render submissions per elapsed second, sampled about once per second. Zero is expected once a paused or unchanged scene settles; rAF callbacks and DOM updates are not counted.">
        Rendered {renderedFPS === null ? '—' : renderedFPS.toFixed(1)} FPS
        {renderedFPS === null ? ' · measuring' : renderedFPS === 0 ? ' · idle (paused / unchanged)' : ''}
      </output>
    </label>}
  </div>;
}
