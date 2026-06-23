const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// 3D offset for isometric-style top face
const DX = 28, DY = -16;

function topFace(x, y, w, h) {
  // Parallelogram shifted up-right above a rect
  return `${x},${y} ${x + w},${y} ${x + w + DX},${y + DY} ${x + DX},${y + DY}`;
}

function rightFace(x, y, w, h) {
  // Right-side face of a 3D box
  const rx = x + w;
  return `${rx},${y} ${rx + DX},${y + DY} ${rx + DX},${y + DY + h} ${rx},${y + h}`;
}

const svg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
<defs>
  <radialGradient id="bg" cx="48%" cy="38%" r="70%">
    <stop offset="0%" stop-color="#0d2e52"/>
    <stop offset="55%" stop-color="#071828"/>
    <stop offset="100%" stop-color="#030c17"/>
  </radialGradient>

  <linearGradient id="topCol" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#62eeff"/>
    <stop offset="100%" stop-color="#1acce8"/>
  </linearGradient>
  <linearGradient id="frontCol" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" stop-color="#18bcd8"/>
    <stop offset="100%" stop-color="#0990b0"/>
  </linearGradient>
  <linearGradient id="sideCol" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="#0878a0"/>
    <stop offset="100%" stop-color="#045570"/>
  </linearGradient>

  <linearGradient id="archGrad" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" stop-color="#0d2e52"/>
    <stop offset="100%" stop-color="#061220"/>
  </linearGradient>

  <radialGradient id="humanGlow" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#00d8ff" stop-opacity="0.25"/>
    <stop offset="100%" stop-color="#00d8ff" stop-opacity="0"/>
  </radialGradient>

  <filter id="glow">
    <feGaussianBlur stdDeviation="10" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="softGlow">
    <feGaussianBlur stdDeviation="22" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="waveGlow">
    <feGaussianBlur stdDeviation="5" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>

  <clipPath id="iconClip">
    <rect width="1024" height="1024" rx="224"/>
  </clipPath>
</defs>

<g clip-path="url(#iconClip)">
  <!-- Background -->
  <rect width="1024" height="1024" fill="url(#bg)"/>

  <!-- Ambient center glow -->
  <ellipse cx="512" cy="480" rx="320" ry="230" fill="#0099cc" opacity="0.07"/>
  <ellipse cx="512" cy="480" rx="180" ry="130" fill="#00bbee" opacity="0.08"/>

  <!-- ==================== 3D CROSS ==================== -->
  <!-- Layout:
       Left cube:   x=148..318, y=385..535
       H-bar:       x=318..706, y=410..535  (connects between cubes, shorter top)
       Right cube:  x=706..876, y=385..535
       V-bar:       x=448..576, y=535..660  (below center)

       Top faces shift by DX=28, DY=-16
  -->

  <!-- LEFT CUBE — front face -->
  <rect x="148" y="385" width="170" height="150" fill="url(#frontCol)" filter="url(#glow)"/>
  <!-- LEFT CUBE — top face -->
  <polygon points="${topFace(148, 385, 170, 0)}" fill="url(#topCol)" opacity="0.95"/>
  <!-- LEFT CUBE — right face -->
  <polygon points="${rightFace(148, 385, 170, 150)}" fill="url(#sideCol)"/>

  <!-- RIGHT CUBE — front face -->
  <rect x="706" y="385" width="170" height="150" fill="url(#frontCol)" filter="url(#glow)"/>
  <!-- RIGHT CUBE — top face -->
  <polygon points="${topFace(706, 385, 170, 0)}" fill="url(#topCol)" opacity="0.95"/>
  <!-- RIGHT CUBE — right face -->
  <polygon points="${rightFace(706, 385, 170, 150)}" fill="url(#sideCol)"/>

  <!-- HORIZONTAL BAR — front face (center, connects cubes) -->
  <rect x="318" y="410" width="388" height="125" fill="url(#frontCol)" filter="url(#glow)"/>
  <!-- HORIZONTAL BAR — top face -->
  <polygon points="${topFace(318, 410, 388, 0)}" fill="url(#topCol)" opacity="0.95"/>

  <!-- ARCH CUTOUT (dark, punched into hbar + cubes) -->
  <!-- Arch: centered at 512, from y=400 to y=540, width=220 -->
  <!-- Filled dark to simulate cutout -->
  <rect x="402" y="422" width="220" height="113" rx="110" fill="url(#archGrad)" opacity="0.97"/>

  <!-- VERTICAL BAR — front face (below cross) -->
  <rect x="448" y="535" width="128" height="125" fill="url(#frontCol)" filter="url(#glow)"/>
  <!-- VERTICAL BAR — top face -->
  <polygon points="${topFace(448, 535, 128, 0)}" fill="url(#topCol)" opacity="0.95"/>
  <!-- VERTICAL BAR — right face -->
  <polygon points="${rightFace(448, 535, 128, 125)}" fill="url(#sideCol)"/>

  <!-- ==================== HUMAN SILHOUETTE ==================== -->
  <!-- Glow behind figure -->
  <ellipse cx="512" cy="486" rx="65" ry="58" fill="url(#humanGlow)"/>

  <!-- Human figure -->
  <g fill="#072438" opacity="0.93">
    <!-- Head -->
    <circle cx="512" cy="436" r="18"/>
    <!-- Torso (shoulders tapering to waist) -->
    <path d="M 490,455
             C 484,457 483,488 487,493
             L 537,493
             C 541,488 540,457 534,455
             C 526,451 519,449 512,449
             C 505,449 498,451 490,455 Z"/>
    <!-- Left leg -->
    <rect x="490" y="493" width="14" height="26" rx="5"/>
    <!-- Right leg -->
    <rect x="520" y="493" width="14" height="26" rx="5"/>
  </g>

  <!-- ==================== WAVE LINES ==================== -->
  <g filter="url(#waveGlow)" opacity="0.85">
    <!-- Wave 1 (top, widest) -->
    <path d="M 240 660
             Q 310 638, 380 652
             Q 450 666, 512 650
             Q 574 634, 644 650
             Q 714 666, 784 652"
          fill="none" stroke="#1ac8e8" stroke-width="5" stroke-linecap="round"/>
    <!-- Wave 2 (middle) -->
    <path d="M 280 685
             Q 350 665, 420 678
             Q 490 691, 512 678
             Q 534 665, 604 678
             Q 674 691, 744 678"
          fill="none" stroke="#14aac8" stroke-width="4" stroke-linecap="round" opacity="0.8"/>
    <!-- Wave 3 (bottom, narrowest) -->
    <path d="M 330 708
             Q 390 692, 440 702
             Q 490 712, 512 702
             Q 534 692, 584 702
             Q 634 712, 694 702"
          fill="none" stroke="#0d8aaa" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
  </g>

  <!-- Subtle top edge highlight -->
  <rect x="0" y="0" width="1024" height="2" fill="#1ad8f8" opacity="0.12"/>
</g>
</svg>`;

async function generate() {
  const outPaths = [
    path.join(__dirname, '..', 'resources', 'icon.png'),
    path.join(__dirname, '..', 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png'),
  ];

  const buf = Buffer.from(svg);
  for (const out of outPaths) {
    await sharp(buf)
      .resize(1024, 1024)
      .flatten({ background: { r: 3, g: 12, b: 23 } }) // remove alpha channel (exigido pela App Store)
      .png()
      .toFile(out);
    console.log('Gerado:', out);
  }
}

generate().catch(err => { console.error(err); process.exit(1); });
