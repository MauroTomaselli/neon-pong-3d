import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ── Constants ──
const FIELD_W = 30, FIELD_H = 18, WALL_H = 0.6;
const PADDLE_W = 0.8, PADDLE_H = 4.8, PADDLE_D = 1.8;
const BALL_R = 0.25, WIN_SCORE = 7;
const DIFF = { FACILE: 0.04, NORMALE: 0.07, DIFFICILE: 0.12 };
const PU_TYPES = [
    { id:'extend', icon:'↔', name:'ESTENDI', color:0x00ff88, dur:8000 },
    { id:'speed', icon:'⚡', name:'VELOCITÀ', color:0xffcc00, dur:7000 },
    { id:'shoot', icon:'🔫', name:'SPARO', color:0xff4444, dur:6000 },
    { id:'slow', icon:'🐢', name:'RALLENTA', color:0x9966ff, dur:7000 }
];

// ── State ──
let difficulty = 'NORMALE', state = 'menu', scores = [0, 0];
let ballVel = { x: 0, z: 0 }, ballSpeed = 0.16;
let mouseY = 0, keys = { up: false, down: false, shoot: false };
let lastTime = 0, paused = false;
// Power-ups
let puBox = null, puTimer = 0, puSpawnCD = 5000;
let activePU = null, puEndTime = 0, puStartTime = 0;
let playerPaddleScale = 1, bullets = [];

// ── DOM ──
const $ = id => document.getElementById(id);
const overlay = $('overlay'), hud = $('hud'), msg = $('message');
const scoreL = $('score-left'), scoreR = $('score-right');
const pauseOv = $('pause-overlay'), winOv = $('win-overlay');
const btnPause = $('btn-pause');

// ── Three.js Setup ──
const canvas = $('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050510);
scene.fog = new THREE.FogExp2(0x050510, 0.025);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 18, 18);
camera.lookAt(0, 0, 0);

// Post-processing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.4, 0.85);
composer.addPass(bloom);

// ── Lights ──
scene.add(new THREE.AmbientLight(0x111133, 0.5));
const dirLight = new THREE.DirectionalLight(0x4466ff, 0.6);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);

const ballLight = new THREE.PointLight(0x00e5ff, 2, 12);
ballLight.position.y = 1;
scene.add(ballLight);

// ── Materials ──
const matCyan = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.2 });
const matPink = new THREE.MeshStandardMaterial({ color: 0xff3d71, emissive: 0xff3d71, emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.2 });
const matBall = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x00e5ff, emissiveIntensity: 1.2, metalness: 1, roughness: 0 });
const matFloor = new THREE.MeshStandardMaterial({ color: 0x080818, metalness: 0.9, roughness: 0.4 });
const matWall = new THREE.MeshStandardMaterial({ color: 0x1a1a3a, emissive: 0x0a0a2a, emissiveIntensity: 0.3, metalness: 0.7, roughness: 0.3 });

// ── Field ──
const floor = new THREE.Mesh(new THREE.BoxGeometry(FIELD_W, 0.15, FIELD_H), matFloor);
floor.position.y = -0.1;
scene.add(floor);

// Grid lines
const gridMat = new THREE.LineBasicMaterial({ color: 0x1a1a4a, transparent: true, opacity: 0.3 });
for (let i = -FIELD_W / 2; i <= FIELD_W / 2; i += 1.5) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(i, 0.01, -FIELD_H / 2), new THREE.Vector3(i, 0.01, FIELD_H / 2)]);
    scene.add(new THREE.Line(g, gridMat));
}
for (let i = -FIELD_H / 2; i <= FIELD_H / 2; i += 1.5) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-FIELD_W / 2, 0.01, i), new THREE.Vector3(FIELD_W / 2, 0.01, i)]);
    scene.add(new THREE.Line(g, gridMat));
}

// Center line
const dashMat = new THREE.LineDashedMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.2, dashSize: 0.5, gapSize: 0.4 });
const centerLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.02, -FIELD_H / 2), new THREE.Vector3(0, 0.02, FIELD_H / 2)]),
    dashMat
);
centerLine.computeLineDistances();
scene.add(centerLine);

// Walls
const wallGeo = new THREE.BoxGeometry(FIELD_W + 0.5, WALL_H, 0.25);
const wallTop = new THREE.Mesh(wallGeo, matWall); wallTop.position.set(0, WALL_H / 2, -FIELD_H / 2 - 0.12); scene.add(wallTop);
const wallBot = new THREE.Mesh(wallGeo, matWall); wallBot.position.set(0, WALL_H / 2, FIELD_H / 2 + 0.12); scene.add(wallBot);

// Wall glow strips
const stripGeo = new THREE.BoxGeometry(FIELD_W, 0.05, 0.05);
const stripMat = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 1.5 });
const s1 = new THREE.Mesh(stripGeo, stripMat); s1.position.set(0, WALL_H, -FIELD_H / 2 - 0.12); scene.add(s1);
const s2 = new THREE.Mesh(stripGeo, stripMat); s2.position.set(0, WALL_H, FIELD_H / 2 + 0.12); scene.add(s2);

// ── Paddles ──
const paddleGeo = new THREE.BoxGeometry(PADDLE_W, PADDLE_H * 0.3, PADDLE_D);

// Round the edges with a slightly larger invisible hitbox
const paddleL = new THREE.Mesh(paddleGeo, matCyan);
paddleL.position.set(-FIELD_W / 2 + 0.8, PADDLE_H * 0.35 / 2, 0);
paddleL.castShadow = true;
scene.add(paddleL);

const paddleR = new THREE.Mesh(paddleGeo, matPink);
paddleR.position.set(FIELD_W / 2 - 0.8, PADDLE_H * 0.35 / 2, 0);
paddleR.castShadow = true;
scene.add(paddleR);

// Paddle glow aura
function addPaddleGlow(paddle, color) {
    const glow = new THREE.PointLight(color, 1.5, 5);
    glow.position.set(0, 0, 0);
    paddle.add(glow);
}
addPaddleGlow(paddleL, 0x00e5ff);
addPaddleGlow(paddleR, 0xff3d71);

// ── Ball ──
const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 24), matBall);
ball.position.y = BALL_R + 0.05;
scene.add(ball);

// ── Particles ──
const PARTICLE_COUNT = 80;
const particleGeo = new THREE.BufferGeometry();
const particlePositions = new Float32Array(PARTICLE_COUNT * 3);
const particleSizes = new Float32Array(PARTICLE_COUNT);
const particleAlphas = new Float32Array(PARTICLE_COUNT);
const particleVelocities = [];
let activeParticles = 0;

for (let i = 0; i < PARTICLE_COUNT; i++) {
    particlePositions[i * 3] = particlePositions[i * 3 + 1] = particlePositions[i * 3 + 2] = -999;
    particleSizes[i] = 0;
    particleAlphas[i] = 0;
    particleVelocities.push({ x: 0, y: 0, z: 0, life: 0 });
}
particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
particleGeo.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1));

const particleMat = new THREE.PointsMaterial({ color: 0x00e5ff, size: 0.15, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
const particles = new THREE.Points(particleGeo, particleMat);
scene.add(particles);

function spawnParticles(x, z, color, count = 12) {
    particleMat.color.set(color);
    for (let i = 0; i < count; i++) {
        const idx = activeParticles % PARTICLE_COUNT;
        activeParticles++;
        particlePositions[idx * 3] = x;
        particlePositions[idx * 3 + 1] = BALL_R;
        particlePositions[idx * 3 + 2] = z;
        particleSizes[idx] = 0.1 + Math.random() * 0.15;
        particleAlphas[idx] = 1;
        const a = Math.random() * Math.PI * 2;
        const s = 0.02 + Math.random() * 0.08;
        particleVelocities[idx] = { x: Math.cos(a) * s, y: 0.02 + Math.random() * 0.05, z: Math.sin(a) * s, life: 1 };
    }
    particleGeo.attributes.position.needsUpdate = true;
    particleGeo.attributes.size.needsUpdate = true;
}

function updateParticles() {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const v = particleVelocities[i];
        if (v.life <= 0) continue;
        v.life -= 0.025;
        particlePositions[i * 3] += v.x;
        particlePositions[i * 3 + 1] += v.y;
        particlePositions[i * 3 + 2] += v.z;
        v.y -= 0.001;
        particleSizes[i] *= 0.96;
        if (v.life <= 0) { particlePositions[i * 3 + 1] = -999; particleSizes[i] = 0; }
    }
    particleGeo.attributes.position.needsUpdate = true;
    particleGeo.attributes.size.needsUpdate = true;
}

// ── Trail ──
const TRAIL_LEN = 20;
const trailPositions = [];
const trailGeo = new THREE.BufferGeometry();
const trailArr = new Float32Array(TRAIL_LEN * 3);
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailArr, 3));
const trailMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending });
const trail = new THREE.Line(trailGeo, trailMat);
scene.add(trail);

function updateTrail() {
    trailPositions.unshift({ x: ball.position.x, y: ball.position.y, z: ball.position.z });
    if (trailPositions.length > TRAIL_LEN) trailPositions.pop();
    for (let i = 0; i < TRAIL_LEN; i++) {
        const p = trailPositions[i] || trailPositions[trailPositions.length - 1];
        trailArr[i * 3] = p.x; trailArr[i * 3 + 1] = p.y; trailArr[i * 3 + 2] = p.z;
    }
    trailGeo.attributes.position.needsUpdate = true;
}

// ── Audio (Web Audio API) ──
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(freq, dur = 0.08, type = 'square') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + dur);
}

// ── Power-up Box ──
const puHud = document.getElementById('powerup-hud');
const puIconEl = document.getElementById('powerup-icon');
const puNameEl = document.getElementById('powerup-name');
const puBarFill = document.getElementById('powerup-bar-fill');
const matPU = new THREE.MeshStandardMaterial({ color:0x00ff88, emissive:0x00ff88, emissiveIntensity:1, metalness:0.5, roughness:0.3 });
const puGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
const puLight = new THREE.PointLight(0x00ff88, 2, 6);
puLight.position.y = 0.5;

function spawnPowerUp() {
    if (puBox) return;
    const type = PU_TYPES[Math.floor(Math.random() * PU_TYPES.length)];
    const m = matPU.clone();
    m.color.set(type.color); m.emissive.set(type.color);
    puBox = new THREE.Mesh(puGeo, m);
    puBox.userData = type;
    puBox.position.set((Math.random()-0.5)*FIELD_W*0.5, 0.5, (Math.random()-0.5)*FIELD_H*0.6);
    puLight.color.set(type.color);
    puBox.add(puLight.clone());
    scene.add(puBox);
}

function collectPU(type) {
    if (puBox) { scene.remove(puBox); puBox = null; }
    activePU = type;
    puStartTime = performance.now();
    puEndTime = puStartTime + type.dur;
    puIconEl.textContent = type.icon;
    puNameEl.textContent = type.name;
    puBarFill.style.width = '100%';
    puHud.classList.remove('hidden');
    playSound(1200, 0.15, 'sine');
    spawnParticles(ball.position.x, ball.position.z, type.color, 20);
    if (type.id === 'extend') playerPaddleScale = 2;
    showMessage(type.icon + ' ' + type.name + '!', 1000);
}

function clearPU() {
    activePU = null;
    puHud.classList.add('hidden');
    playerPaddleScale = 1;
}

function updatePowerUps() {
    // Spawn timer
    puTimer += 16;
    if (!puBox && !activePU && puTimer > puSpawnCD) { spawnPowerUp(); puTimer = 0; }
    // Rotate box
    if (puBox) {
        puBox.rotation.y += 0.03;
        puBox.rotation.x += 0.01;
        puBox.position.y = 0.5 + Math.sin(performance.now()*0.003)*0.2;
        // Check ball collision
        if (ball.position.distanceTo(puBox.position) < 1.0) collectPU(puBox.userData);
    }
    // Active PU timer
    if (activePU) {
        const now = performance.now();
        const pct = Math.max(0, (puEndTime - now) / (puEndTime - puStartTime));
        puBarFill.style.width = (pct*100)+'%';
        if (now >= puEndTime) clearPU();
    }
    // Paddle scale lerp
    const targetZ = playerPaddleScale;
    paddleL.scale.z += (targetZ - paddleL.scale.z) * 0.15;
}

// ── Bullets ──
const bulletGeo = new THREE.SphereGeometry(0.12, 8, 8);
const bulletMat = new THREE.MeshStandardMaterial({ color:0xff4444, emissive:0xff4444, emissiveIntensity:1.5 });

function fireBullet() {
    if (!activePU || activePU.id !== 'shoot') return;
    const b = new THREE.Mesh(bulletGeo, bulletMat);
    b.position.set(paddleL.position.x + 0.5, 0.3, paddleL.position.z);
    scene.add(b);
    bullets.push(b);
    playSound(1600, 0.05, 'sawtooth');
}

function updateBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.position.x += 0.4;
        // Hit AI paddle?
        if (Math.abs(b.position.x - paddleR.position.x) < 0.5 && Math.abs(b.position.z - paddleR.position.z) < PADDLE_D*paddleR.scale.z/2 + 0.3) {
            spawnParticles(b.position.x, b.position.z, 0xff4444, 15);
            paddleR.scale.z = 0.5; // shrink AI
            scene.remove(b); bullets.splice(i,1);
            playSound(300, 0.1, 'sawtooth');
            continue;
        }
        if (b.position.x > FIELD_W/2 + 2) { scene.remove(b); bullets.splice(i,1); }
    }
    // AI paddle recover
    paddleR.scale.z += (1 - paddleR.scale.z) * 0.01;
}

// ── Game Logic ──
function resetBall(dir = 1) {
    ball.position.set(0, BALL_R + 0.05, 0);
    const angle = (Math.random() * 0.8 - 0.4);
    ballSpeed = 0.16;
    ballVel.x = Math.cos(angle) * ballSpeed * dir;
    ballVel.z = Math.sin(angle) * ballSpeed;
    trailPositions.length = 0;
}

function showMessage(text, duration = 1500) {
    msg.textContent = text;
    msg.classList.add('visible');
    setTimeout(() => msg.classList.remove('visible'), duration);
}

function startGame() {
    scores = [0, 0]; scoreL.textContent = '0'; scoreR.textContent = '0';
    overlay.classList.add('hidden');
    hud.classList.add('visible');
    btnPause.classList.add('visible');
    document.body.classList.add('playing');
    state = 'countdown';
    paddleL.position.z = 0; paddleR.position.z = 0;
    paddleL.scale.z = 1; paddleR.scale.z = 1;
    clearPU(); puTimer = 0;
    if (puBox) { scene.remove(puBox); puBox = null; }
    bullets.forEach(b => scene.remove(b)); bullets.length = 0;
    resetBall(1);
    countdown(3);
}

function countdown(n) {
    if (n > 0) {
        showMessage(n.toString(), 800);
        playSound(440, 0.1);
        setTimeout(() => countdown(n - 1), 1000);
    } else {
        showMessage('VIA!', 800);
        playSound(880, 0.15);
        setTimeout(() => { state = 'playing'; }, 500);
    }
}

function scorePoint(player) {
    scores[player]++;
    scoreL.textContent = scores[0];
    scoreR.textContent = scores[1];
    playSound(220, 0.3, 'sawtooth');
    spawnParticles(ball.position.x, ball.position.z, player === 0 ? 0x00e5ff : 0xff3d71, 25);

    if (scores[player] >= WIN_SCORE) {
        state = 'gameover';
        const winText = $('win-text');
        const winScore = $('win-score');
        winText.textContent = player === 0 ? 'HAI VINTO!' : 'HAI PERSO!';
        winText.style.color = player === 0 ? '#00e5ff' : '#ff3d71';
        winScore.textContent = `${scores[0]} — ${scores[1]}`;
        winOv.classList.remove('hidden');
        hud.classList.remove('visible');
        btnPause.classList.remove('visible');
        document.body.classList.remove('playing');
        return;
    }

    showMessage(player === 0 ? 'PUNTO!' : 'PUNTO AI!', 1200);
    state = 'scored';
    setTimeout(() => {
        resetBall(player === 0 ? 1 : -1);
        state = 'playing';
    }, 1500);
}

function updateGame() {
    if (state !== 'playing') return;
    const halfH = FIELD_H / 2 - BALL_R - 0.12;
    const paddleHalf = PADDLE_D / 2;
    const halfField = FIELD_H / 2 - paddleHalf - 0.15;
    const pSpeed = (activePU && activePU.id === 'speed') ? 0.35 : 0.23;

    // Player paddle (keyboard + mouse/touch)
    if (keys.up) paddleL.position.z -= pSpeed;
    if (keys.down) paddleL.position.z += pSpeed;

    // Mouse/Touch control
    const tZ = ((mouseY / innerHeight) - 0.5) * FIELD_H * 0.95;
    paddleL.position.z += (tZ - paddleL.position.z) * 0.15;
    paddleL.position.z = THREE.MathUtils.clamp(paddleL.position.z, -halfField, halfField);

    // AI paddle
    let aiSpeed = DIFF[difficulty];
    if (activePU && activePU.id === 'slow') aiSpeed *= 0.4;
    const aiTarget = ball.position.z + ballVel.z * 8 * (1 - aiSpeed * 3);
    paddleR.position.z += (aiTarget - paddleR.position.z) * aiSpeed;
    paddleR.position.z = THREE.MathUtils.clamp(paddleR.position.z, -halfField, halfField);

    // Ball movement
    ball.position.x += ballVel.x;
    ball.position.z += ballVel.z;
    ball.rotation.x += ballVel.z * 2;
    ball.rotation.z -= ballVel.x * 2;

    // Wall bounce
    if (ball.position.z <= -halfH) { ball.position.z = -halfH; ballVel.z *= -1; playSound(600, 0.05); spawnParticles(ball.position.x, ball.position.z, 0x4466ff, 5); }
    if (ball.position.z >= halfH) { ball.position.z = halfH; ballVel.z *= -1; playSound(600, 0.05); spawnParticles(ball.position.x, ball.position.z, 0x4466ff, 5); }

    // Paddle collision (scale-aware hitbox)
    const pL = paddleL.position, pR = paddleR.position;
    const pw = PADDLE_W / 2 + BALL_R;
    const phL = (PADDLE_D * paddleL.scale.z) / 2 + BALL_R + 0.15;
    const phR = (PADDLE_D * paddleR.scale.z) / 2 + BALL_R + 0.15;

    if (ballVel.x < 0 && ball.position.x - BALL_R <= pL.x + pw && ball.position.x > pL.x - pw && Math.abs(ball.position.z - pL.z) < phL) {
        ball.position.x = pL.x + pw + BALL_R;
        const offset = (ball.position.z - pL.z) / phL;
        ballVel.x = Math.abs(ballVel.x);
        ballVel.z += offset * 0.06;
        ballSpeed = Math.min(ballSpeed * 1.05, 0.35);
        const sp = Math.sqrt(ballVel.x**2 + ballVel.z**2);
        ballVel.x = (ballVel.x/sp)*ballSpeed; ballVel.z = (ballVel.z/sp)*ballSpeed;
        playSound(880, 0.08);
        spawnParticles(ball.position.x, ball.position.z, 0x00e5ff, 10);
        paddleL.scale.x = 1.3;
    }

    if (ballVel.x > 0 && ball.position.x + BALL_R >= pR.x - pw && ball.position.x < pR.x + pw && Math.abs(ball.position.z - pR.z) < phR) {
        ball.position.x = pR.x - pw - BALL_R;
        const offset = (ball.position.z - pR.z) / phR;
        ballVel.x = -Math.abs(ballVel.x);
        ballVel.z += offset * 0.06;
        ballSpeed = Math.min(ballSpeed * 1.05, 0.35);
        const sp = Math.sqrt(ballVel.x**2 + ballVel.z**2);
        ballVel.x = (ballVel.x/sp)*ballSpeed; ballVel.z = (ballVel.z/sp)*ballSpeed;
        playSound(660, 0.08);
        spawnParticles(ball.position.x, ball.position.z, 0xff3d71, 10);
        paddleR.scale.x = 1.3;
    }

    // Paddle squish recovery
    paddleL.scale.x += (1 - paddleL.scale.x) * 0.15;
    paddleR.scale.x += (1 - paddleR.scale.x) * 0.15;

    // Score
    if (ball.position.x < -FIELD_W / 2 - 1) scorePoint(1);
    if (ball.position.x > FIELD_W / 2 + 1) scorePoint(0);

    // Ball light
    ballLight.position.x = ball.position.x;
    ballLight.position.z = ball.position.z;

    updatePowerUps();
    updateBullets();
    updateTrail();
}

// ── Animation Loop ──
function animate(time) {
    requestAnimationFrame(animate);
    if (paused) return;
    const dt = Math.min(time - lastTime, 33);
    lastTime = time;

    updateGame();
    updateParticles();

    // Subtle camera sway
    camera.position.x += (ball.position.x * 0.08 - camera.position.x) * 0.02;

    composer.render();
}

// ── Events ──
window.addEventListener('mousemove', e => { mouseY = e.clientY; });
window.addEventListener('touchmove', e => { if (e.touches.length > 0) mouseY = e.touches[0].clientY; }, {passive: true});
window.addEventListener('touchstart', e => { if (e.touches.length > 0) mouseY = e.touches[0].clientY; }, {passive: true});
window.addEventListener('click', () => { if (state === 'playing') fireBullet(); });
window.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp') keys.up = true;
    if (e.key === 'ArrowDown') keys.down = true;
    if (e.key === ' ' && state === 'playing') fireBullet();
    if (e.key === 'Escape' && state === 'playing') togglePause();
});
window.addEventListener('keyup', e => {
    if (e.key === 'ArrowUp') keys.up = false;
    if (e.key === 'ArrowDown') keys.down = false;
});
window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
});

function togglePause() {
    paused = !paused;
    pauseOv.classList.toggle('hidden', !paused);
}

$('btn-start').addEventListener('click', () => { audioCtx.resume(); startGame(); });

$('btn-difficulty').addEventListener('click', () => {
    const levels = Object.keys(DIFF);
    const idx = (levels.indexOf(difficulty) + 1) % levels.length;
    difficulty = levels[idx];
    $('diff-label').textContent = difficulty;
});

$('btn-pause').addEventListener('click', togglePause);
$('btn-resume').addEventListener('click', togglePause);
$('btn-quit').addEventListener('click', () => {
    paused = false; pauseOv.classList.add('hidden');
    state = 'menu'; overlay.classList.remove('hidden');
    hud.classList.remove('visible'); btnPause.classList.remove('visible');
    document.body.classList.remove('playing');
    resetBall();
});

$('btn-replay').addEventListener('click', () => { winOv.classList.add('hidden'); startGame(); });
$('btn-menu').addEventListener('click', () => {
    winOv.classList.add('hidden'); state = 'menu';
    overlay.classList.remove('hidden');
    document.body.classList.remove('playing');
    resetBall();
});

// ── Start ──
resetBall();
animate(0);
