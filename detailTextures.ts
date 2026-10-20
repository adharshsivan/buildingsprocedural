import * as THREE from 'three';
import { RNG } from './rng';
import type { UVRect } from './batcher';

const cache = new Map<string, THREE.CanvasTexture>();

function texture(key: string, width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('A Canvas 2D context is required for procedural materials.');
  draw(ctx);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  cache.set(key, map);
  return map;
}

export function roomUV(variant: number): UVRect {
  const cell = ((variant % 16) + 16) % 16;
  return [(cell % 4) / 4 + 0.004, 1 - (Math.floor(cell / 4) + 1) / 4 + 0.004, 0.242, 0.242];
}

// Sixteen furnished rooms share one atlas per lighting state; gutters prevent mip bleeding.
export function roomAtlas(lit: boolean) {
  return texture(`rooms-${lit}`, 1024, 1024, ctx => {
    const paints = ['#c4bfb2', '#c8c5bc', '#9caaa7', '#b6a492'];
    const upholstery = ['#777f71', '#b3a292', '#526766', '#b4b1a1', '#a27d68'];
    for (let i = 0; i < 16; i++) {
      const rng = new RNG(310 + i * 37);
      ctx.save();
      ctx.translate((i % 4) * 256, Math.floor(i / 4) * 256);
      ctx.beginPath(); ctx.rect(0, 0, 256, 256); ctx.clip();
      if (i % 2) { ctx.translate(256, 0); ctx.scale(-1, 1); }
      ctx.fillStyle = paints[i % 4]; ctx.fillRect(0, 0, 256, 256);
      const shade = ctx.createLinearGradient(0, 0, 0, 256);
      shade.addColorStop(0, '#00000060'); shade.addColorStop(0.3, '#00000000'); shade.addColorStop(1, '#00000020');
      ctx.fillStyle = shade; ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#665547'; ctx.fillRect(0, 191, 256, 65);
      ctx.strokeStyle = '#41382b55'; ctx.lineWidth = 1;
      for (let x = -100; x < 350; x += 35) {
        ctx.beginPath(); ctx.moveTo(x, 191); ctx.lineTo(x * 1.6 - 75, 256); ctx.stroke();
      }
      ctx.fillStyle = '#e1d8c5'; ctx.fillRect(0, 188, 256, 3);
      if (i % 4 !== 2) {
        const artX = rng.int(30, 80), artY = rng.int(45, 72);
        ctx.fillStyle = '#443b33'; ctx.fillRect(artX, artY, 56, 62);
        ctx.fillStyle = '#d6cbb4'; ctx.fillRect(artX + 3, artY + 3, 50, 56);
        ctx.fillStyle = ['#988c70', '#728f8b', '#af806b'][i % 3];
        ctx.beginPath(); ctx.arc(artX + 28, artY + 24, 16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5f6960'; ctx.fillRect(artX + 3, artY + 43, 50, 16);
      }
      const fabric = upholstery[i % upholstery.length];
      if (i % 3 === 0) {
        ctx.fillStyle = '#635347'; ctx.fillRect(23, 134, 134, 60);
        ctx.fillStyle = fabric; ctx.fillRect(26, 144, 126, 51);
        ctx.fillStyle = '#e2dacf'; ctx.fillRect(26, 158, 126, 43);
        ctx.fillStyle = '#f0e9dd'; ctx.fillRect(32, 146, 43, 20); ctx.fillRect(98, 146, 43, 20);
        ctx.fillStyle = '#828976'; ctx.fillRect(26, 183, 126, 17);
      } else if (i % 3 === 1) {
        ctx.fillStyle = '#332b25'; ctx.fillRect(26, 189, 5, 15); ctx.fillRect(145, 189, 5, 15);
        ctx.fillStyle = fabric; ctx.fillRect(25, 145, 126, 45);
        ctx.fillStyle = '#00000018'; ctx.fillRect(25, 176, 126, 12);
        ctx.fillStyle = '#d7ccba'; ctx.fillRect(30, 149, 24, 25); ctx.fillRect(119, 150, 22, 24);
        ctx.fillStyle = '#8a7361'; ctx.fillRect(59, 204, 92, 6);
        ctx.fillStyle = '#3f3830'; ctx.fillRect(68, 210, 4, 18); ctx.fillRect(140, 210, 4, 18);
      } else {
        ctx.fillStyle = '#b9b4a3'; ctx.fillRect(18, 140, 143, 51);
        ctx.fillStyle = '#ddcfb6'; ctx.fillRect(16, 138, 147, 5);
        ctx.fillStyle = '#3d4b49'; ctx.fillRect(38, 105, 53, 32);
        ctx.fillStyle = '#71847d'; ctx.fillRect(41, 109, 47, 24);
        ctx.fillStyle = '#4f4740'; ctx.fillRect(61, 134, 6, 7);
        ctx.fillStyle = '#454844'; ctx.fillRect(117, 165, 30, 8); ctx.fillRect(120, 171, 4, 32); ctx.fillRect(141, 171, 4, 32);
      }
      ctx.fillStyle = '#776150'; ctx.fillRect(181, 70, 47, 122);
      ctx.fillStyle = '#4e4236'; ctx.fillRect(185, 74, 39, 114);
      for (let row = 0; row < 3; row++) {
        ctx.fillStyle = '#b29573'; ctx.fillRect(182, 106 + row * 30, 46, 3);
        for (let book = 0; book < 5; book++) {
          ctx.fillStyle = rng.pick(['#aaa18a', '#627b79', '#ac7860', '#c6b8a3']);
          const h = rng.int(15, 25);
          ctx.fillRect(186 + book * 6, 106 + row * 30 - h, 4, h);
        }
      }
      const lx = 162, ly = 117;
      ctx.fillStyle = '#4b4031'; ctx.fillRect(lx, ly, 2, 76);
      ctx.fillStyle = lit ? '#ffdfa0' : '#cabd9f';
      ctx.beginPath(); ctx.moveTo(lx - 11, ly - 8); ctx.lineTo(lx + 13, ly - 8);
      ctx.lineTo(lx + 19, ly + 12); ctx.lineTo(lx - 17, ly + 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#9c6e50'; ctx.fillRect(9, 176, 12, 16);
      ctx.fillStyle = '#486046';
      for (let leaf = 0; leaf < 6; leaf++) {
        ctx.beginPath(); ctx.ellipse(15 + Math.sin(leaf * 2) * 7, 172 - leaf * 3, 4, 10, leaf, 0, 6.28); ctx.fill();
      }
      if (lit) {
        const glow = ctx.createRadialGradient(lx, ly, 1, lx, ly, 115);
        glow.addColorStop(0, '#ffde9d65'); glow.addColorStop(1, '#ffbe6900');
        ctx.fillStyle = glow; ctx.fillRect(0, 0, 256, 256);
      } else {
        ctx.fillStyle = '#16222c50'; ctx.fillRect(0, 0, 256, 256);
      }
      ctx.restore();
    }
  });
}

export function lobbyUV(variant: number): UVRect {
  const cell = ((variant % 4) + 4) % 4;
  return [(cell % 2) / 2 + 0.005, 1 - (Math.floor(cell / 2) + 1) / 2 + 0.005, 0.49, 0.49];
}

// Reception spaces are deliberately separate from dwelling interiors: no beds, sofas or domestic shelving.
export function lobbyAtlas(lit: boolean) {
  return texture(`lobby-${lit}`, 1024, 1024, ctx => {
    const palettes = [
      { wall:'#d9d4c8', floor:'#7f7568', desk:'#473d33', stone:'#bdb3a2', lift:'#6d716d' },
      { wall:'#dde2df', floor:'#767b79', desk:'#4d5d58', stone:'#c2c8c4', lift:'#555a5b' },
      { wall:'#ded8ce', floor:'#806d58', desk:'#574434', stone:'#c7b5a0', lift:'#67655e' },
      { wall:'#cbd4d5', floor:'#687274', desk:'#39484c', stone:'#a9b4b5', lift:'#4d575a' },
    ];
    for (let i = 0; i < 4; i++) {
      const ox = (i % 2) * 512, oy = Math.floor(i / 2) * 512;
      const p = palettes[i];
      ctx.save(); ctx.translate(ox, oy); ctx.beginPath(); ctx.rect(0, 0, 512, 512); ctx.clip();
      ctx.fillStyle = p.wall; ctx.fillRect(0, 0, 512, 512);
      const ceiling = ctx.createLinearGradient(0, 0, 0, 150);
      ceiling.addColorStop(0, '#00000033'); ceiling.addColorStop(1, '#00000000');
      ctx.fillStyle = ceiling; ctx.fillRect(0, 0, 512, 160);
      // patterned lobby tile floor in perspective
      ctx.fillStyle = p.floor; ctx.fillRect(0, 334, 512, 178);
      ctx.strokeStyle = '#ffffff26'; ctx.lineWidth = 2;
      for (let x = -500; x < 1100; x += 74) { ctx.beginPath(); ctx.moveTo(256, 334); ctx.lineTo(x, 512); ctx.stroke(); }
      for (let y = 352; y < 512; y += 33) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
      ctx.fillStyle = p.stone; ctx.fillRect(0, 326, 512, 8);
      // lift doors and call panel on the back wall
      ctx.fillStyle = p.lift; ctx.fillRect(332, 119, 111, 208);
      ctx.fillStyle = '#333b3c'; ctx.fillRect(337, 124, 50, 198); ctx.fillRect(390, 124, 48, 198);
      ctx.fillStyle = '#ffffff1c'; ctx.fillRect(389, 124, 3, 198);
      ctx.fillStyle = '#b7bdaf'; ctx.fillRect(450, 192, 17, 57);
      ctx.fillStyle = lit ? '#ffd783' : '#a7b5a8'; ctx.beginPath(); ctx.arc(458, 207, 5, 0, 6.28); ctx.fill();
      // reception counter and internal signage
      ctx.fillStyle = p.desk; ctx.fillRect(68, 226, 192, 84);
      ctx.fillStyle = '#191b1a50'; ctx.fillRect(68, 295, 192, 15);
      ctx.fillStyle = p.stone; ctx.fillRect(58, 214, 212, 17);
      ctx.fillStyle = '#e3dac5'; ctx.font = '600 20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('LOKAM', 164, 265);
      ctx.fillStyle = '#6a6256'; ctx.fillRect(104, 155, 126, 35);
      ctx.fillStyle = '#ece6d9'; ctx.font = '14px sans-serif'; ctx.fillText('RESIDENTS', 167, 178);
      // mailboxes, directory and planter
      ctx.fillStyle = '#858c86';
      for (let y = 110; y < 203; y += 19) for (let x = 24; x < 93; x += 32) { ctx.fillRect(x, y, 27, 15); ctx.fillStyle = '#d9ddcf'; ctx.fillRect(x + 21, y + 6, 3, 3); ctx.fillStyle = '#858c86'; }
      ctx.fillStyle = '#a26d4c'; ctx.fillRect(274, 268, 32, 66);
      ctx.fillStyle = '#305c3c';
      for (let leaf = 0; leaf < 9; leaf++) { const a = leaf * 2.4; ctx.beginPath(); ctx.ellipse(290 + Math.cos(a) * 21, 263 + Math.sin(a) * 15, 8, 30, a, 0, 6.28); ctx.fill(); }
      // ceiling lights and night warmth
      for (const x of [118, 256, 395]) {
        ctx.fillStyle = lit ? '#ffe5b0' : '#e9ece5'; ctx.fillRect(x - 42, 57, 84, 11);
        if (lit) { const glow = ctx.createRadialGradient(x, 62, 2, x, 62, 130); glow.addColorStop(0, '#ffd58b52'); glow.addColorStop(1, '#ffd58b00'); ctx.fillStyle = glow; ctx.fillRect(x - 130, 0, 260, 280); }
      }
      if (!lit) { ctx.fillStyle = '#14202a2c'; ctx.fillRect(0, 0, 512, 512); }
      ctx.restore();
    }
  });
}

export function shopUV(variant: number): UVRect {
  const cell = ((variant % 4) + 4) % 4;
  return [(cell % 2) / 2 + 0.005, 1 - (Math.floor(cell / 2) + 1) / 2 + 0.005, 0.49, 0.49];
}

export function shopAtlas(lit: boolean) {
  return texture(`shops-${lit}`, 1024, 1024, ctx => {
    const themes = [
      { wall:'#d9d0bd', shelf:'#775b40', goods:['#ad5747','#d6b14a','#668c6d','#e7ded2'] },
      { wall:'#cad6d4', shelf:'#4d625d', goods:['#457d78','#e8e2d4','#ba794b','#617da2'] },
      { wall:'#ded7cb', shelf:'#59524a', goods:['#c26b43','#8b9a6e','#e2cf67','#795f9a'] },
      { wall:'#d4d8d2', shelf:'#59605f', goods:['#e5e3dc','#6288a0','#b66c73','#7b8d5e'] },
    ];
    for (let i = 0; i < 4; i++) {
      const ox = (i % 2) * 512, oy = Math.floor(i / 2) * 512, t = themes[i];
      ctx.save(); ctx.translate(ox, oy); ctx.beginPath(); ctx.rect(0, 0, 512, 512); ctx.clip();
      ctx.fillStyle = t.wall; ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = '#6e675e'; ctx.fillRect(0, 370, 512, 142);
      ctx.strokeStyle = '#ffffff25';
      for (let y = 392; y < 512; y += 36) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
      // two product shelves and counter
      for (const sy of [100, 205]) {
        ctx.fillStyle = t.shelf; ctx.fillRect(26, sy, 262, 16);
        for (let x = 38; x < 274; x += 29) { ctx.fillStyle = t.goods[(x / 29 + sy) % t.goods.length | 0]; ctx.fillRect(x, sy - 52, 18, 49); }
      }
      ctx.fillStyle = '#4b4035'; ctx.fillRect(292, 260, 177, 102);
      ctx.fillStyle = '#d6c5a8'; ctx.fillRect(285, 247, 192, 20);
      ctx.fillStyle = '#252a29'; ctx.fillRect(360, 198, 57, 45);
      ctx.fillStyle = '#bdd2c5'; ctx.fillRect(366, 204, 45, 28);
      if (lit) { const glow = ctx.createLinearGradient(0, 0, 0, 370); glow.addColorStop(0, '#ffe0a848'); glow.addColorStop(1, '#ffe0a800'); ctx.fillStyle = glow; ctx.fillRect(0, 0, 512, 370); }
      else { ctx.fillStyle = '#13202a24'; ctx.fillRect(0, 0, 512, 512); }
      ctx.restore();
    }
  });
}

export function wayfindingAtlas() {
  return texture('wayfinding', 768, 256, ctx => {
    ctx.fillStyle = '#28312d'; ctx.fillRect(0, 0, 768, 256);
    ctx.fillStyle = '#e5e9d5'; ctx.font = '600 86px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('P', 128, 108); ctx.fillText('L', 384, 108); ctx.fillText('↑', 640, 108);
    ctx.font = '18px sans-serif';
    ctx.fillText('PARKING', 128, 167); ctx.fillText('LOBBY', 384, 167); ctx.fillText('EXIT', 640, 167);
  });
}

export function equipmentAtlas() {
  return texture('equipment', 512, 256, ctx => {
    ctx.fillStyle = '#e8e9e4'; ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#353c3c'; ctx.beginPath(); ctx.arc(128, 128, 104, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 5; i++) {
      ctx.save(); ctx.translate(128, 128); ctx.rotate(i * Math.PI * 2 / 5);
      ctx.fillStyle = '#76817d'; ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.bezierCurveTo(70, -73, 109, -14, 83, 25); ctx.bezierCurveTo(67, 43, 38, 17, 0, 0); ctx.fill(); ctx.restore();
    }
    ctx.strokeStyle = '#a3aaa5'; ctx.lineWidth = 2;
    for (let radius = 16; radius < 107; radius += 9) {
      ctx.beginPath(); ctx.arc(128, 128, radius, 0, Math.PI * 2); ctx.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(128 + Math.cos(a) * 105, 128 + Math.sin(a) * 105); ctx.stroke();
    }
    ctx.fillStyle = '#b9bfba'; ctx.beginPath(); ctx.arc(128, 128, 14, 0, Math.PI * 2); ctx.fill();
    for (let y = 20; y < 231; y += 10) {
      ctx.fillStyle = '#5d6966'; ctx.fillRect(278, y, 210, 4);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(278, y + 4, 210, 1);
    }
  });
}

export function residenceSign() {
  return texture('residence-sign', 1024, 256, ctx => {
    ctx.fillStyle = '#303733'; ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = '#e6dfca'; ctx.textAlign = 'center';
    ctx.font = '500 70px sans-serif'; ctx.fillText('LOKAM', 512, 114);
    ctx.font = '24px sans-serif'; ctx.fillText('R E S I D E N C E S', 512, 177);
  });
}

/** UV mapping for 4 distinct rooftop billboard advertisement campaigns in a 2x2 grid. */
export function hoardingUV(variant: number): UVRect {
  const cell = ((variant % 4) + 4) % 4;
  return [(cell % 2) * 0.5 + 0.005, 1 - (Math.floor(cell / 2) + 1) * 0.5 + 0.005, 0.49, 0.49];
}

/**
 * Authentic large-format commercial billboard advertisements with sharp typography,
 * brand logos, high-contrast product graphics and downward spotlight illumination gradients.
 */
export function hoardingAtlas(lit: boolean): THREE.CanvasTexture {
  return texture(`hoarding-${lit}`, 1024, 512, ctx => {
    ctx.fillStyle = '#111216';
    ctx.fillRect(0, 0, 1024, 512);

    for (let i = 0; i < 4; i++) {
      const ox = (i % 2) * 512;
      const oy = Math.floor(i / 2) * 256;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.beginPath();
      ctx.rect(0, 0, 512, 256);
      ctx.clip();

      if (i === 0) {
        // --- AD 0: AURORA AIRWAYS (Luxury Airline Campaign)
        const bg = ctx.createLinearGradient(0, 0, 512, 256);
        bg.addColorStop(0, '#07162c');
        bg.addColorStop(0.5, '#0b2f52');
        bg.addColorStop(1, '#051224');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 512, 256);

        // Flight trail arcs
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(-40, 240);
        ctx.bezierCurveTo(160, 210, 310, 130, 460, 40);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(199, 210, 254, 0.6)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-40, 238);
        ctx.bezierCurveTo(160, 208, 310, 128, 460, 38);
        ctx.stroke();

        // Supersonic airliner silhouette
        ctx.save();
        ctx.translate(415, 68);
        ctx.rotate(-0.46);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(38, 0);
        ctx.lineTo(-24, -13);
        ctx.lineTo(-12, -4);
        ctx.lineTo(-32, -3);
        ctx.lineTo(-36, -11);
        ctx.lineTo(-44, -11);
        ctx.lineTo(-39, 0);
        ctx.lineTo(-44, 11);
        ctx.lineTo(-36, 11);
        ctx.lineTo(-32, 3);
        ctx.lineTo(-12, 4);
        ctx.lineTo(-24, 13);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Branding & Typography
        ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
        ctx.fillRect(36, 32, 150, 22);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1;
        ctx.strokeRect(36, 32, 150, 22);
        ctx.fillStyle = '#fde68a';
        ctx.font = '600 11px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('★  WORLD AIRLINE 2026', 44, 47);

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 34px sans-serif';
        ctx.fillText('AURORA AIR', 36, 92);

        ctx.fillStyle = '#38bdf8';
        ctx.font = '600 14px sans-serif';
        ctx.fillText('FLY BEYOND IN FIRST CLASS', 36, 116);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '400 11px sans-serif';
        ctx.fillText('DAILY NONSTOP TO TOKYO · LONDON · DUBAI · ZÜRICH', 36, 142);

        ctx.fillStyle = '#0284c7';
        ctx.fillRect(36, 172, 144, 32);
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 12px sans-serif';
        ctx.fillText('BOOK AURORA.COM  →', 48, 193);

      } else if (i === 1) {
        // --- AD 1: CHRONOS GENÈVE (Swiss Luxury Watchmaker)
        const bg = ctx.createRadialGradient(256, 128, 20, 256, 128, 280);
        bg.addColorStop(0, '#1c1d22');
        bg.addColorStop(1, '#0e0f12');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 512, 256);

        // Watch face graphic
        const wx = 380, wy = 128, wr = 82;
        ctx.strokeStyle = '#c59b6d';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(wx, wy, wr, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#141519';
        ctx.beginPath();
        ctx.arc(wx, wy, wr - 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(197, 155, 109, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(wx, wy, wr - 14, 0, Math.PI * 2);
        ctx.stroke();

        // Dial markers
        for (let a = 0; a < 12; a++) {
          const rad = (a * Math.PI) / 6;
          const x1 = wx + Math.cos(rad) * (wr - 12);
          const y1 = wy + Math.sin(rad) * (wr - 12);
          const x2 = wx + Math.cos(rad) * (wr - 4);
          const y2 = wy + Math.sin(rad) * (wr - 4);
          ctx.strokeStyle = a % 3 === 0 ? '#e2c69d' : '#8a7761';
          ctx.lineWidth = a % 3 === 0 ? 3 : 1.5;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }

        // Subdials
        for (const [sdx, sdy] of [[wx - 26, wy], [wx + 26, wy], [wx, wy + 28]]) {
          ctx.strokeStyle = 'rgba(197, 155, 109, 0.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(sdx, sdy, 16, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Watch hands at 10:10
        ctx.strokeStyle = '#e2c69d';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx - 26, wy - 34);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx + 34, wy - 28);
        ctx.stroke();
        ctx.fillStyle = '#c59b6d';
        ctx.beginPath();
        ctx.arc(wx, wy, 4, 0, Math.PI * 2);
        ctx.fill();

        // Branding
        ctx.fillStyle = '#e2c69d';
        ctx.font = '700 32px serif';
        ctx.textAlign = 'left';
        ctx.fillText('CHRONOS', 42, 86);

        ctx.font = '500 13px sans-serif';
        ctx.fillStyle = '#baa07e';
        ctx.fillText('GENÈVE  ·  DEPUIS 1892', 46, 110);

        ctx.font = '600 16px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('THE MASTERPIECE CHRONOMETER', 42, 148);

        ctx.font = '400 11px sans-serif';
        ctx.fillStyle = '#8f8f94';
        ctx.fillText('TITANIUM & ROSE GOLD · WATER RESISTANT 300M', 42, 172);

        ctx.fillStyle = '#c59b6d';
        ctx.fillRect(42, 194, 60, 2);

      } else if (i === 2) {
        // --- AD 2: NEXUS 10G FIBRE (Urban Telecom & Tech)
        const bg = ctx.createLinearGradient(0, 0, 512, 256);
        bg.addColorStop(0, '#0f0525');
        bg.addColorStop(0.5, '#1e0c45');
        bg.addColorStop(1, '#061d36');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 512, 256);

        // Neon digital wave lines
        for (let w = 0; w < 4; w++) {
          ctx.strokeStyle = w % 2 === 0 ? 'rgba(0, 240, 255, 0.4)' : 'rgba(236, 72, 153, 0.4)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(220, 220 - w * 28);
          ctx.bezierCurveTo(310, 100 - w * 20, 390, 240 - w * 15, 520, 90 + w * 20);
          ctx.stroke();
        }

        // Tech badge
        ctx.fillStyle = '#06b6d4';
        ctx.beginPath();
        ctx.roundRect(40, 34, 100, 26, 6);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.font = '800 14px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('10G FIBRE', 53, 52);

        // Typography
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 36px sans-serif';
        ctx.fillText('NEXUS', 40, 102);

        ctx.fillStyle = '#00f0ff';
        ctx.font = '700 16px sans-serif';
        ctx.fillText('THE SPEED OF THOUGHT', 40, 128);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '400 12px sans-serif';
        ctx.fillText('ZERO LATENCY · UNLIMITED GIGABIT BROADBAND', 40, 154);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '400 10px sans-serif';
        ctx.fillText('NOW LIVE ACROSS ALL METROPOLITAN DISTRICTS', 40, 175);

        ctx.fillStyle = '#ec4899';
        ctx.beginPath();
        ctx.roundRect(40, 192, 135, 30, 4);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 11px sans-serif';
        ctx.fillText('GET CONNECTED  →', 50, 211);

      } else {
        // --- AD 3: THE VERTEX RESIDENCES (Ultra-Luxury Architecture)
        const bg = ctx.createLinearGradient(0, 0, 512, 256);
        bg.addColorStop(0, '#15141c');
        bg.addColorStop(0.5, '#281c25');
        bg.addColorStop(1, '#110f15');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 512, 256);

        // Architectural tower silhouette
        const tx = 395, ty = 230;
        ctx.fillStyle = '#1c1825';
        ctx.fillRect(tx - 38, ty - 190, 76, 190);
        ctx.fillRect(tx - 28, ty - 215, 56, 25);
        ctx.fillRect(tx - 12, ty - 232, 24, 17);
        ctx.strokeStyle = '#dfb872';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(tx - 38, ty - 190, 76, 190);
        ctx.strokeRect(tx - 28, ty - 215, 56, 25);
        // Spire
        ctx.beginPath();
        ctx.moveTo(tx, ty - 232);
        ctx.lineTo(tx, ty - 250);
        ctx.stroke();

        // Tower illuminated windows
        ctx.fillStyle = '#fde68a';
        for (let wy = ty - 180; wy < ty - 20; wy += 14) {
          for (let wx = tx - 32; wx < tx + 30; wx += 10) {
            if ((wx + wy) % 3 === 0) ctx.fillRect(wx, wy, 4, 6);
          }
        }

        // Monogram
        ctx.strokeStyle = '#dfb872';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(60, 48, 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#dfb872';
        ctx.font = '700 16px serif';
        ctx.textAlign = 'center';
        ctx.fillText('V', 60, 54);

        // Typography
        ctx.textAlign = 'left';
        ctx.fillStyle = '#fef08a';
        ctx.font = '700 30px serif';
        ctx.fillText('THE VERTEX', 88, 56);

        ctx.fillStyle = '#ffffff';
        ctx.font = '600 14px sans-serif';
        ctx.fillText('ULTRA-LUXURY SKY PENTHOUSES', 42, 102);

        ctx.fillStyle = '#dfb872';
        ctx.font = '500 12px sans-serif';
        ctx.fillText('360° HARBOUR & HORIZON PANORAMAS', 42, 126);

        ctx.fillStyle = '#9ca3af';
        ctx.font = '400 11px sans-serif';
        ctx.fillText('PRIVATE ELEVATORS · ROOFTOP INFINITY POOL · 24/7 CONCIERGE', 42, 149);

        ctx.fillStyle = '#dfb872';
        ctx.fillRect(42, 174, 170, 32);
        ctx.fillStyle = '#1e1b26';
        ctx.font = '700 12px sans-serif';
        ctx.fillText('SCHEDULE VIEWING  →', 52, 195);
      }

      // Spotlight illumination overlay for dusk/night mode
      if (lit) {
        // 4 downward spotlight cones along top edge of the ad
        for (let s = 0; s < 4; s++) {
          const sx = 64 + s * 128;
          const spot = ctx.createRadialGradient(sx, 0, 2, sx, 60, 190);
          spot.addColorStop(0, 'rgba(255, 248, 230, 0.42)');
          spot.addColorStop(0.25, 'rgba(255, 235, 185, 0.22)');
          spot.addColorStop(0.7, 'rgba(255, 220, 150, 0.08)');
          spot.addColorStop(1, 'rgba(255, 210, 120, 0)');
          ctx.fillStyle = spot;
          ctx.fillRect(sx - 110, 0, 220, 220);
        }
      }

      // Subtle metallic border around each ad cell in the atlas
      ctx.strokeStyle = '#2d3338';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, 510, 254);

      ctx.restore();
    }
  });
}


export function disposeDetailTextures() {
  cache.forEach(t => t.dispose());
  cache.clear();
}
/** Garment cell index → atlas UV rect (4 × 2 grid, inset to avoid mip bleeding). */
export function garmentUV(cell: number): UVRect {
  return [(cell % 4) / 4 + 0.006, 1 - (Math.floor(cell / 4) + 1) / 2 + 0.006, 0.238, 0.488];
}
/** A small, fully opaque patch (centre of the towel cell) for pegs and fold creases. */
export const OPAQUE_FABRIC_UV: UVRect = [0.115, 0.24, 0.02, 0.02];

/**
 * Cut-out garment silhouettes in neutral greys. Alpha defines the shape; the
 * per-garment colour comes from vertex colours, so one material covers all laundry.
 */
export function garmentAtlas() {
  return texture('garments', 1024, 512, ctx => {
    ctx.clearRect(0, 0, 1024, 512);
    const rng = new RNG(4411);
    const cell = (i: number, draw: () => void, details: () => void) => {
      ctx.save();
      ctx.translate((i % 4) * 256, Math.floor(i / 4) * 256);
      ctx.beginPath();
      draw();
      ctx.closePath();
      ctx.fillStyle = '#f4f4f2';
      ctx.fill();
      ctx.clip();
      // soft vertical folds from gravity
      for (let x = 0; x < 256; x += rng.int(14, 26)) {
        const g = ctx.createLinearGradient(x, 0, x + 18, 0);
        g.addColorStop(0, '#00000000'); g.addColorStop(0.5, `rgba(0,0,0,${rng.float(0.04, 0.1)})`); g.addColorStop(1, '#00000000');
        ctx.fillStyle = g; ctx.fillRect(x, 0, 18, 256);
      }
      const shade = ctx.createLinearGradient(0, 0, 0, 256);
      shade.addColorStop(0, '#00000012'); shade.addColorStop(1, '#00000000');
      ctx.fillStyle = shade; ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = '#0000002a'; ctx.fillStyle = '#0000002a'; ctx.lineWidth = 2;
      details();
      ctx.restore();
    };
    // 0 t-shirt (hung by shoulders)
    cell(0, () => {
      ctx.moveTo(78, 10); ctx.quadraticCurveTo(128, 40, 178, 10); ctx.lineTo(248, 46); ctx.lineTo(226, 98);
      ctx.lineTo(196, 84); ctx.lineTo(198, 248); ctx.lineTo(58, 248); ctx.lineTo(60, 84); ctx.lineTo(30, 98); ctx.lineTo(8, 46);
    }, () => { ctx.beginPath(); ctx.moveTo(60, 236); ctx.lineTo(198, 236); ctx.stroke(); ctx.beginPath(); ctx.moveTo(84, 14); ctx.quadraticCurveTo(128, 44, 172, 14); ctx.stroke(); });
    // 1 collared shirt with placket and faint check
    cell(1, () => {
      ctx.moveTo(92, 6); ctx.lineTo(164, 6); ctx.lineTo(250, 40); ctx.lineTo(252, 200); ctx.lineTo(222, 202); ctx.lineTo(206, 82);
      ctx.lineTo(204, 252); ctx.lineTo(52, 252); ctx.lineTo(50, 82); ctx.lineTo(34, 202); ctx.lineTo(4, 200); ctx.lineTo(6, 40);
    }, () => {
      ctx.fillStyle = '#00000010';
      for (let x = 0; x < 256; x += 22) ctx.fillRect(x, 0, 6, 256);
      for (let y = 0; y < 256; y += 22) ctx.fillRect(0, y, 256, 6);
      ctx.fillStyle = '#0000002a';
      ctx.beginPath(); ctx.moveTo(128, 10); ctx.lineTo(128, 252); ctx.stroke();
      for (let y = 40; y < 250; y += 36) { ctx.beginPath(); ctx.arc(136, y, 3, 0, 6.28); ctx.fill(); }
      ctx.strokeRect(150, 70, 32, 30);
      ctx.beginPath(); ctx.moveTo(92, 6); ctx.lineTo(116, 34); ctx.lineTo(128, 12); ctx.lineTo(140, 34); ctx.lineTo(164, 6); ctx.stroke();
    });
    // 2 trousers (hung by waistband)
    cell(2, () => {
      ctx.moveTo(52, 4); ctx.lineTo(204, 4); ctx.lineTo(222, 252); ctx.lineTo(140, 252); ctx.lineTo(128, 92);
      ctx.lineTo(116, 252); ctx.lineTo(34, 252);
    }, () => {
      ctx.fillStyle = '#00000022'; ctx.fillRect(40, 4, 180, 20);
      ctx.beginPath(); ctx.moveTo(84, 30); ctx.lineTo(76, 250); ctx.moveTo(172, 30); ctx.lineTo(180, 250); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(128, 24); ctx.lineTo(128, 80); ctx.stroke();
    });
    // 3 shorts
    cell(3, () => {
      ctx.moveTo(30, 6); ctx.lineTo(226, 6); ctx.lineTo(250, 250); ctx.lineTo(142, 250); ctx.lineTo(128, 150);
      ctx.lineTo(114, 250); ctx.lineTo(6, 250);
    }, () => { ctx.fillStyle = '#00000022'; ctx.fillRect(20, 6, 216, 26); ctx.beginPath(); ctx.moveTo(14, 226); ctx.lineTo(118, 226); ctx.moveTo(138, 226); ctx.lineTo(246, 226); ctx.stroke(); });
    // 4 towel / bedsheet: woven bands near both ends
    cell(4, () => { ctx.rect(6, 4, 244, 248); }, () => {
      ctx.fillStyle = '#00000018';
      for (const y of [22, 30, 214, 222]) ctx.fillRect(6, y, 244, 4);
      ctx.fillStyle = '#0000000b';
      for (let y = 4; y < 252; y += 3) ctx.fillRect(6, y, 244, 1);
    });
    // 5 saree / dupatta / mundu: long cloth with woven border on both long edges
    cell(5, () => { ctx.rect(4, 2, 248, 252); }, () => {
      ctx.fillStyle = '#00000030'; ctx.fillRect(4, 2, 22, 252); ctx.fillRect(230, 2, 22, 252);
      ctx.fillStyle = '#ffffff40'; ctx.fillRect(10, 2, 4, 252); ctx.fillRect(242, 2, 4, 252);
      ctx.fillStyle = '#00000014';
      for (let y = 20; y < 250; y += 34) for (let x = 46; x < 220; x += 34) { ctx.beginPath(); ctx.arc(x + (y % 68 ? 17 : 0), y, 3, 0, 6.28); ctx.fill(); }
    });
    // 6 kid's frock
    cell(6, () => {
      ctx.moveTo(84, 4); ctx.lineTo(104, 4); ctx.lineTo(112, 40); ctx.lineTo(144, 40); ctx.lineTo(152, 4); ctx.lineTo(172, 4);
      ctx.lineTo(178, 90); ctx.quadraticCurveTo(230, 170, 252, 252); ctx.lineTo(4, 252); ctx.quadraticCurveTo(26, 170, 78, 90);
    }, () => { ctx.fillStyle = '#00000020'; ctx.fillRect(70, 86, 116, 10); ctx.beginPath(); ctx.moveTo(10, 236); ctx.lineTo(246, 236); ctx.stroke(); });
    // 7 pair of socks / small cloths
    cell(7, () => {
      for (const ox of [16, 136]) {
        ctx.moveTo(ox, 4); ctx.lineTo(ox + 64, 4); ctx.lineTo(ox + 64, 170); ctx.quadraticCurveTo(ox + 104, 176, ox + 104, 220);
        ctx.quadraticCurveTo(ox + 100, 252, ox + 60, 250); ctx.lineTo(ox + 18, 250); ctx.quadraticCurveTo(ox, 248, ox, 200); ctx.closePath();
      }
    }, () => { ctx.fillStyle = '#00000022'; ctx.fillRect(16, 4, 64, 22); ctx.fillRect(136, 4, 64, 22); });
  });
}
