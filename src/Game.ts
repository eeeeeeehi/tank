import { Input } from './Input';
import { Level } from './map/Level';
import { Tank } from './entities/Tank';
import { Bullet } from './entities/Bullet';
import { Particle } from './entities/Particle';
import { SoundManager } from './utils/SoundManager';
import { checkCircleRectCollision } from './utils/MathUtils';

export class Game {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    input: Input;
    lastTime: number = 0;

    level: Level;
    player: Tank;
    enemies: Tank[] = [];
    bullets: Bullet[] = [];
    particles: Particle[] = [];
    inputBlockTimer: number = 0;

    gameState: 'start' | 'playing' | 'win' | 'lose' | 'victory' = 'start';
    gameMode: 'stage' | 'battleroyale' = 'stage';
    currentLevelIdx: number = 0;
    // playerLives removed in favor of this.player.hp
    // Score removed as per request

    // Ranking (Stores Stage Reached & Date)
    highScores: { stage: number, date: number }[] = [];
    lastRank: number = -1;
    currentScoreDate: number = 0; // To identify current run
    soundManager: SoundManager;

    // Screen Shake
    shakeTime: number = 0;
    shakeIntensity: number = 0;


    // Player Indicator
    playerIndicatorTimer: number = 0;
    countdownTimer: number = 0;
    helpUI: HTMLElement | null = null;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.input = new Input(this.canvas);

        this.soundManager = new SoundManager();
        this.loadRanking();

        this.level = new Level();
        this.player = new Tank(100, 300, true);
        this.initLevel(); // Initial setup
        this.updateHUD(); // Initial HUD
        this.initHelpUI();
    }

    loadRanking() {
        const saved = localStorage.getItem('tank_ranking_stage');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    if (typeof parsed[0] === 'number') {
                        // Migrate legacy number[]
                        this.highScores = parsed.map((s: number) => ({ stage: s, date: 0 }));
                    } else {
                        this.highScores = parsed;
                    }
                } else {
                    this.highScores = [];
                }
            } catch (e) {
                this.highScores = [];
            }
        } else {
            this.highScores = [];
        }
    }

    saveRanking() {
        if (this.gameMode === 'battleroyale') return;

        const stage = this.currentLevelIdx + 1;
        this.currentScoreDate = Date.now();

        this.highScores.push({ stage, date: this.currentScoreDate });

        // Sort: High Stage first, then Newest Date first
        this.highScores.sort((a, b) => {
            if (b.stage !== a.stage) return b.stage - a.stage;
            return b.date - a.date;
        });

        // Find My Rank (0-indexed)
        this.lastRank = this.highScores.findIndex(s => s.date === this.currentScoreDate && s.stage === stage);

        // Keep all scores for "Your Rank is X" logic? 
        // Or trimming? User implies showing rank even if low.
        // Let's keep Top 100 to prevent infinite growth, effectively "Not Ranked" if < 100.
        if (this.highScores.length > 100) {
            this.highScores = this.highScores.slice(0, 100);
        }

        localStorage.setItem('tank_ranking_stage', JSON.stringify(this.highScores));
    }

    // Called when moving to next level
    initLevel() {
        this.canvas.width = 800;
        this.canvas.height = 600;

        this.bullets = [];
        this.particles = [];
        this.shakeTime = 0;
        this.shakeTime = 0;
        this.playerIndicatorTimer = 3.0; // Show "YOU" for 3 seconds
        this.inputBlockTimer = 0.5; // Prevent accidental shots from previous screen

        // Load Level Layout
        this.level = new Level(this.currentLevelIdx, 800, 600);

        // Keep Player
        this.player.x = 100;
        this.player.y = 300;
        this.player.rotation = 0;
        // Don't auto-heal on new level. Upgrades handle it.

        // Spawn Enemies based on Level
        this.enemies = [];

        if (this.gameMode === 'stage') {
            const count = 1 + this.currentLevelIdx;
            for (let i = 0; i < count; i++) {
                this.spawnEnemy(this.currentLevelIdx + 1);
            }
        }

        this.updateUI();
    }

    spawnEnemy(difficultyLevel: number) {
        let ex = 0, ey = 0;
        let attempts = 0;
        do {
            ex = 100 + Math.random() * (this.canvas.width - 200);
            ey = 100 + Math.random() * (this.canvas.height - 200);
            attempts++;
        } while (this.level.walls.some((w: any) =>
            ex > w.x - 40 && ex < w.x + w.w + 40 &&
            ey > w.y - 40 && ey < w.y + w.h + 40
        ) && attempts < 20);

        // Random Enemy Type
        const rand = Math.random();
        let enemy: Tank;

        if (this.gameMode === 'battleroyale') {
            // Random mix for BR
            if (rand < 0.1) enemy = new Tank(ex, ey, false, '#ccc', 200, 1, 3, 'normal', 1.0, 'armored');
            else if (rand < 0.2) enemy = new Tank(ex, ey, false, '#f80', 200, 1, 1, 'shotgun', 1.5, 'shotgun');
            else if (rand < 0.3) enemy = new Tank(ex, ey, false, '#ff0', 250, 1, 1, 'normal', 0.2, 'machinegun');
            else if (rand < 0.4) enemy = new Tank(ex, ey, false, '#0ff', 500, 1, 1, 'normal', 2.0, 'sniper');
            else if (rand < 0.5) enemy = new Tank(ex, ey, false, '#800', 200, 2, 1, 'normal', 1.0, 'heavy');
            else if (rand < 0.6) enemy = new Tank(ex, ey, false, '#a0f', 400, 1, 1, 'normal', 0.5, 'dasher');
            else enemy = new Tank(ex, ey, false);
        } else {
            // Stage Progression Logic
            if (difficultyLevel >= 5 && rand < 0.15) {
                // Armored (Silver): 3 HP, Slow, Normal Gun
                enemy = new Tank(ex, ey, false, '#ccc', 200, 1, 3, 'normal', 1.0, 'armored');
                enemy.speed = 60; // Slow
            } else if (difficultyLevel >= 4 && rand < 0.3) {
                // Shotgun (Orange): 1 HP, Spread
                enemy = new Tank(ex, ey, false, '#f80', 200, 1, 1, 'shotgun', 1.5, 'shotgun');
            } else if (difficultyLevel >= 3 && rand < 0.45) {
                // Machine Gunner (Yellow): Fast Fire, Low Damage (1), but Rapid
                enemy = new Tank(ex, ey, false, '#ff0', 250, 1, 1, 'normal', 0.2, 'machinegun');
            } else if (difficultyLevel >= 2 && rand < 0.6) {
                // Sniper (Cyan): Fast Bullet (500), Slow Reload (2s)
                enemy = new Tank(ex, ey, false, '#0ff', 500, 1, 1, 'normal', 2.0, 'sniper');
            } else if (difficultyLevel >= 2 && rand < 0.75) {
                // Heavy (Dark Red): 2 Damage
                enemy = new Tank(ex, ey, false, '#800', 200, 2, 1, 'normal', 1.0, 'heavy');
            } else if (difficultyLevel >= 2 && rand < 0.9) {
                // Speedster (Purple): Fast Bullet, Fast Move
                enemy = new Tank(ex, ey, false, '#a0f', 400, 1, 1, 'normal', 0.5, 'dasher');
                enemy.speed = 150;
            } else {
                // Standard (Red)
                enemy = new Tank(ex, ey, false); // Default params
            }
        }

        this.enemies.push(enemy);
    }

    start() {
        this.lastTime = performance.now();
        requestAnimationFrame((time) => this.loop(time));
    }

    loop(time: number) {
        const deltaTime = (time - this.lastTime) / 1000;
        this.lastTime = time;

        this.update(deltaTime);
        this.draw();

        requestAnimationFrame((time) => this.loop(time));
    }

    update(dt: number) {
        this.input.update(); // Poll Gamepads

        // Toggle Help
        if (this.input.isDown('Digit0') && this.inputBlockTimer <= 0) {
            this.toggleHelp();
            this.inputBlockTimer = 0.2;
        }

        // Shake Update
        if (this.shakeTime > 0) {
            this.shakeTime -= dt;
            if (this.shakeTime < 0) this.shakeTime = 0;
        }

        if (this.gameState === 'playing' && this.playerIndicatorTimer > 0) {
            this.playerIndicatorTimer -= dt;
        }

        // Input Block Timer
        if (this.inputBlockTimer > 0) {
            this.inputBlockTimer -= dt;
        }

        // Game State Logic
        if (this.gameState === 'start') {
            // Background Battle Logic (Demo Mode)
            const demoTanks = this.enemies; // Reusing enemies array for demo tanks

            // Spawn demo tanks if empty
            if (demoTanks.length < 8) {
                this.spawnEnemy(99); // Max difficulty random spawn
            }

            // Update Background Battle
            for (const enemy of demoTanks) {
                // Pass all tanks as targets (FFA)
                enemy.update(dt, null, this.level, this.bullets, demoTanks);
            }

            // Update Bullets
            for (let i = this.bullets.length - 1; i >= 0; i--) {
                const b = this.bullets[i];
                b.update(dt, this.level);
                if (!b.active) {
                    this.spawnExplosion(b.x, b.y, '#ff0', 5, false);
                    this.bullets.splice(i, 1);
                } else {
                    // Check collisions in demo
                    for (let j = this.enemies.length - 1; j >= 0; j--) {
                        const enemy = this.enemies[j];
                        if (b.owner !== enemy && this.checkBulletTankCollision(b, enemy)) {
                            b.active = false;
                            const dead = enemy.takeDamage(b.damage);
                            if (dead) {
                                this.spawnExplosion(enemy.x, enemy.y, enemy.color, 40, true);
                                this.enemies.splice(j, 1);
                            } else {
                                this.spawnExplosion(enemy.x, enemy.y, '#fff', 5, false);
                            }
                            break;
                        }
                    }
                }
            }

            // Update Particles
            for (let i = this.particles.length - 1; i >= 0; i--) {
                this.particles[i].update(dt);
                if (this.particles[i].life <= 0) this.particles.splice(i, 1);
            }

            // Input to Start (Blocked for short time after return)
            if (this.inputBlockTimer <= 0) {
                if (this.input.isDown('Space') || this.input.isDown('Enter') || this.input.gamepadShoot) {
                    this.startGame('stage');
                }
                if (this.input.isDown('KeyB')) {
                    this.startGame('battleroyale');
                }
            }
            return;
        }

        if (this.gameState !== 'playing') {
            // Fireworks for Victory
            if (this.gameState === 'win' || this.gameState === 'victory') {
                if (Math.random() < 0.05) { // 5% chance per frame (~3 per sec)
                    const fx = 100 + Math.random() * 600;
                    const fy = 100 + Math.random() * 400;
                    const color = `hsl(${Math.random() * 360}, 100 %, 50 %)`;
                    this.spawnExplosion(fx, fy, color, 80, true);
                    this.soundManager.playExplosion(); // Reuse explosion sound
                }

                // Update particles for fireworks
                for (let i = this.particles.length - 1; i >= 0; i--) {
                    this.particles[i].update(dt);
                    if (this.particles[i].life <= 0) this.particles.splice(i, 1);
                }
            }

            const isLeft = this.input.isDown('ArrowLeft') || this.input.axisLeft.x < -0.5;
            const isRight = this.input.isDown('ArrowRight') || this.input.axisLeft.x > 0.5;
            const isConfirm = this.input.isDown('Space') || this.input.isDown('Enter') || this.input.gamepadShoot;

            if (isLeft && this.inputBlockTimer <= 0) {
                this.upgradeSelectionIndex = (this.upgradeSelectionIndex - 1 + this.upgradeOptions.length) % this.upgradeOptions.length;
                this.inputBlockTimer = 0.2; // Input debounce
                this.updateUI(); // Re-render to show selection
            }
            if (isRight && this.inputBlockTimer <= 0) {
                this.upgradeSelectionIndex = (this.upgradeSelectionIndex + 1) % this.upgradeOptions.length;
                this.inputBlockTimer = 0.2; // Input debounce
                this.updateUI();
            }
            if (isConfirm && this.inputBlockTimer <= 0) {
                if (this.gameState === 'win') {
                    this.selectUpgrade(this.upgradeSelectionIndex);
                } else if (this.gameState === 'victory' || this.gameState === 'lose') {
                    this.firstNameScreen();
                }
            }
            return;
        }

        // Battle Royale Countdown
        if (this.countdownTimer > 0) {
            this.countdownTimer -= dt;
            if (this.countdownTimer <= 0) {
                this.countdownTimer = 0;
                // Maybe play sound?
            } else {
                return; // Block gameplay
            }
        }

        // Check for shots
        const originalBulletCount = this.bullets.length;

        // Update Player
        // Block input briefly at start to prevent accidental shots
        const playerInput = this.inputBlockTimer > 0 ? undefined : this.input;
        this.player.update(dt, playerInput, this.level, this.bullets);

        // Update Enemies
        // In BR, they target Player AND Other Enemies.
        const allTanks = [this.player, ...this.enemies]; // All potential targets

        for (const enemy of this.enemies) {
            enemy.update(dt, null, this.level, this.bullets, this.gameMode === 'battleroyale' ? allTanks : undefined);
        }

        // Sound check for New Bullets
        if (this.bullets.length > originalBulletCount) {
            this.soundManager.playShoot();
        }

        // Update Bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.update(dt, this.level);
            if (!b.active) {
                // Bullet hit wall or expired
                this.spawnExplosion(b.x, b.y, '#ff0', 5, false);
                this.bullets.splice(i, 1);
            }
        }

        // Update Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.update(dt);
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // Check Bullet collisions
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];

            // Check Player
            if (this.checkBulletTankCollision(b, this.player)) {
                b.active = false;
                this.spawnExplosion(this.player.x, this.player.y, '#0f0', 50, true);
                this.soundManager.playExplosion();
                this.triggerShake(0.5, 10);

                // Player Hit Logic
                const dead = this.player.takeDamage(b.damage);
                this.updateHUD();

                if (dead) {
                    if (this.gameMode === 'stage') this.saveRanking();
                    this.gameState = 'lose';
                    this.updateUI();
                } else {
                    if (this.gameMode === 'battleroyale') {
                        // BR is 1 HP, so dead anyway usually, but just in case
                        this.gameState = 'lose';
                        this.updateUI();
                    } else {
                        // Respawn
                        this.player.x = 100;
                        this.player.y = 300;
                        this.player.rotation = 0;
                    }
                }
                break;
            }

            // Check Enemies
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const enemy = this.enemies[j];
                const canHit = b.owner !== enemy && (this.gameMode === 'battleroyale' || b.owner === this.player);

                if (canHit && this.checkBulletTankCollision(b, enemy)) {
                    b.active = false;
                    this.soundManager.playExplosion();

                    // Damage Enemy
                    const dead = enemy.takeDamage(b.damage);

                    if (dead) {
                        this.spawnExplosion(enemy.x, enemy.y, enemy.color, 50, true);
                        this.triggerShake(0.3, 5);
                        this.enemies.splice(j, 1);

                        // Win Check
                        if (this.enemies.length === 0) {
                            if (this.gameMode === 'battleroyale') {
                                this.gameState = 'victory';
                            } else {
                                this.gameState = 'win';
                                this.generateUpgrades(); // Generate options
                            }
                            this.updateUI();
                        }
                    } else {
                        // Hit effect but not dead
                        this.spawnExplosion(enemy.x, enemy.y, '#fff', 10, false);
                    }

                    this.updateHUD();
                    break;
                }
            }
        }
    }

    firstNameScreen() {
        this.gameState = 'start';
        this.canvas.width = 800;
        this.canvas.height = 600;
        this.inputBlockTimer = 0.5;
        this.updateUI();
    }

    updateHUD() {
        const hudLives = document.getElementById('hud-lives');
        const hudStage = document.getElementById('hud-stage');

        if (hudLives) {
            const hearts = '❤'.repeat(Math.max(0, this.player.hp));
            hudLives.innerText = `ライフ: ${hearts}`;
            hudLives.style.color = this.player.hp <= 1 ? '#f55' : 'white';
        }

        if (hudStage) {
            if (this.gameMode === 'battleroyale') {
                hudStage.innerText = `生存数: ${this.enemies.length + (this.player.hp > 0 ? 1 : 0)}`;
            } else {
                hudStage.innerText = `ステージ: ${this.currentLevelIdx + 1}`;
            }
        }
    }

    getSafeSpawnPosition(radius: number): { x: number, y: number } {
        const w = this.canvas.width;
        const h = this.canvas.height;
        // Try up to 100 times to find a spot not overlapping walls
        for (let i = 0; i < 100; i++) {
            const x = 50 + Math.random() * (w - 100);
            const y = 50 + Math.random() * (h - 100);

            let safe = true;
            // Check Walls
            for (const wall of this.level.walls) {
                if (checkCircleRectCollision({ x, y, r: radius + 5 }, wall)) {
                    safe = false;
                    break;
                }
            }
            if (safe) return { x, y };
        }
        return { x: 400, y: 300 }; // Fallback
    }

    startGame(mode: 'stage' | 'battleroyale') {
        this.gameMode = mode;
        this.gameState = 'playing';

        // Reset Player Traits (Clear Upgrades)
        this.player = new Tank(0, 0, true);

        if (mode === 'battleroyale') {
            this.canvas.width = 1200;
            this.canvas.height = 800;

            this.player.maxHp = 1; // HARDCORE
            this.player.hp = 1;

            this.currentLevelIdx = 0;
            // Load Level -1 for BR Arena
            this.level = new Level(-1, 1200, 800);

            this.countdownTimer = 3; // Start Countdown

            this.bullets = [];
            this.particles = [];

            // Spawn Player Safe
            const pSpawn = this.getSafeSpawnPosition(15);
            this.player.x = pSpawn.x;
            this.player.y = pSpawn.y;
            // hp already set

            // Spawn 9 Enemies Safe
            this.enemies = [];
            for (let i = 0; i < 9; i++) {
                this.spawnEnemy(99); // Max difficulty mix
            }
            this.playerIndicatorTimer = 3.0;
        } else {
            this.player.maxHp = 3; // Standard HP (was 5 in previous playerLives, let's keep it challenging or 5?)
            // If user expects 5, set 5. Default Tank is 3.
            this.player.maxHp = 5;
            this.player.hp = 5;

            this.currentLevelIdx = 0;
            this.initLevel(); // Standard Level 0 load
        }

        this.updateUI();
        this.updateHUD();
    }

    triggerShake(duration: number, intensity: number) {
        this.shakeTime = duration;
        this.shakeIntensity = intensity;
    }

    spawnExplosion(x: number, y: number, color: string, count: number, big: boolean) {
        for (let i = 0; i < count; i++) {
            this.particles.push(new Particle(x, y, color, big ? 150 : 50));
        }
        if (big) {
            this.particles.push(new Particle(x, y, color, 0, 'shockwave'));
            for (let i = 0; i < 20; i++) this.particles.push(new Particle(x + (Math.random() - 0.5) * 15, y + (Math.random() - 0.5) * 15, '#fa0', 60, 'fire'));
            for (let i = 0; i < 10; i++) this.particles.push(new Particle(x, y, '#555', 40, 'smoke'));
            for (let i = 0; i < 8; i++) this.particles.push(new Particle(x, y, color, 150, 'debris'));
        }
    }

    // Upgrade System
    upgradeOptions: { id: string, label: string, description: string, apply: (t: Tank) => void }[] = [];
    upgradeSelectionIndex: number = 0;

    generateUpgrades() {
        const potentialUpgrades = [
            {
                id: 'speed',
                label: 'エンジン強化',
                description: '移動速度 +15%',
                apply: (t: Tank) => { t.speed *= 1.15; }
            },
            {
                id: 'firerate',
                label: 'クイックリロード',
                description: '連射速度 +15%',
                apply: (t: Tank) => { t.fireRate *= 0.85; }
            },
            {
                id: 'bulletspeed',
                label: '高速弾',
                description: '弾速 +20%',
                apply: (t: Tank) => { t.bulletSpeed *= 1.2; }
            },
            {
                id: 'hp',
                label: '強化装甲',
                description: '最大HP+1 & 回復',
                apply: (t: Tank) => { t.maxHp += 1; t.hp = t.maxHp; }
            }
        ];

        // Add Shotgun option if player doesn't have it yet
        if (this.player.weaponType !== 'shotgun') {
            potentialUpgrades.push({
                id: 'shotgun',
                label: '拡散弾モジュール',
                description: '3方向ショットガンに変更',
                apply: (t: Tank) => { t.weaponType = 'shotgun'; }
            });
        }

        // Shuffle and pick 3
        const shuffled = potentialUpgrades.sort(() => 0.5 - Math.random());
        this.upgradeOptions = shuffled.slice(0, 3);
        this.upgradeSelectionIndex = 1; // Default to center option
    }

    selectUpgrade(index: number) {
        if (this.upgradeOptions[index]) {
            this.upgradeOptions[index].apply(this.player);
            // Apply healing on clear regardless? Or just maintain HP?
            // Let's heal 1 HP for free on clear
            if (this.player.hp < this.player.maxHp) this.player.hp++;

            // Next level
            this.currentLevelIdx++;
            this.initLevel();
            this.gameState = 'playing';
            this.updateUI();
            this.updateHUD();
        }
    }

    updateUI() {
        const ui = document.getElementById('game-ui');
        if (!ui) return;

        // Clear existing listeners to prevent doubles?
        // We'll rewrite innerHTML so listeners are gone.
        // Need to attach new listeners after HTML set.

        let html = '';
        if (this.gameState === 'start') {
            html += '<h1>タンクバトル</h1><p>[SPACE/ボタン] キャンペーンモード</p><p>[B] バトルロイヤル (生存戦)</p>';
            this.renderRanking(ui, html); // Helper to append Ranking
            ui.style.display = 'flex';
        } else if (this.gameState === 'playing') {
            ui.style.display = 'none';
        } else if (this.gameState === 'win') {
            html += `<h1>ステージ ${this.currentLevelIdx + 1} クリア！</h1>
                     <p>能力を選択:</p>
                     <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center;">`;

            this.upgradeOptions.forEach((up, i) => {
                const isSelected = i === this.upgradeSelectionIndex;
                const border = isSelected ? '4px solid #fff' : '2px solid #0f0';
                const bg = isSelected ? '#333' : '#222';
                const transform = isSelected ? 'scale(1.1)' : 'scale(1.0)';

                html += `<button id="upg-${i}" style="padding: 10px 20px; font-size: 16px; background: ${bg}; border: ${border}; color: #fff; cursor: pointer; transform: ${transform}; transition: all 0.1s;">
                            <div style="font-weight:bold; color: #0f0;">${up.label}</div>
                            <div style="font-size: 12px; color: #aaa;">${up.description}</div>
                         </button>`;
            });
            html += `</div>`;

            ui.innerHTML = html;
            ui.style.display = 'flex';

            // Attach events
            this.upgradeOptions.forEach((_, i) => {
                const btn = document.getElementById(`upg-${i}`);
                if (btn) {
                    btn.onclick = () => this.selectUpgrade(i);
                }
            });
            return; // Return early so we don't overwrite with bottom logic

        } else if (this.gameState === 'victory') { // Battle Royale Win
            html += `<h1>優勝！</h1><p>最後の生存者だ！</p><p>[SPACE/ボタン] で戻る</p>`;
            ui.innerHTML = html;
            ui.style.display = 'flex';
        } else if (this.gameState === 'lose') {
            if (this.gameMode === 'battleroyale') {
                html += `<h1>敗北...</h1><p>次は頑張ろう！</p><p>[SPACE/ボタン] で戻る</p>`;
            } else {
                const stage = this.currentLevelIdx + 1;
                html += `<h1>ゲームオーバー</h1><p>到達ステージ: ${stage}</p><p>[SPACE/ボタン] でリトライ</p>`;
                this.renderRanking(ui, html);
            }
            ui.innerHTML = html;
            ui.style.display = 'flex';
        }
    }

    renderRanking(container: HTMLElement, baseHtml: string) {
        if (this.highScores.length === 0) {
            container.innerHTML = baseHtml;
            return;
        }
        let list = '<div style="margin-top:20px; text-align:left;"><h3>到達記録</h3><ol>';

        // Show Top 5
        const top5 = this.highScores.slice(0, 5);

        top5.forEach((s, index) => {
            const isMe = (index === this.lastRank && s.date === this.currentScoreDate);
            const style = isMe ? 'color: #f55; font-weight: bold;' : '';
            list += `<li style="${style}">ステージ ${s.stage}</li>`;
        });
        list += '</ol>';

        // If my rank is below Top 5, show it
        if (this.lastRank >= 5) {
            list += `<p style="color: #f55; font-weight: bold; margin-top: 5px;">あなたの順位: ${this.lastRank + 1}位</p>`;
        } else if (this.lastRank === -1 && this.gameState === 'lose' && this.gameMode === 'stage') {
            // Maybe game wasn't saved? Or > 100?
            // If > 100, we don't know exact rank if we sliced.
            // But we kept 100. If > 100, say "圏外" (Outside Rank)?
            // For now assume top 100 covers it.
        }

        list += '</div>';
        container.innerHTML = baseHtml + list;
    }

    checkBulletTankCollision(b: Bullet, t: Tank): boolean {
        // ... (Same collision) ...
        return (
            b.x > t.x - t.width / 2 &&
            b.x < t.x + t.width / 2 &&
            b.y > t.y - t.height / 2 &&
            b.y < t.y + t.height / 2
        );
    }

    draw() {
        // Clear with dark background
        this.ctx.fillStyle = '#050510'; // Deep blue-black
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();

        // Screen Shake
        if (this.shakeTime > 0) {
            const dx = (Math.random() - 0.5) * this.shakeIntensity;
            const dy = (Math.random() - 0.5) * this.shakeIntensity;
            this.ctx.translate(dx, dy);
        }

        // -- Cyber Grid Background --
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)'; // Faint Cyan
        this.ctx.shadowBlur = 0;

        const gridSize = 40;
        this.ctx.beginPath();
        // Vertical
        for (let x = 0; x <= this.canvas.width; x += gridSize) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
        }
        // Horizontal
        for (let y = 0; y <= this.canvas.height; y += gridSize) {
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
        }
        this.ctx.stroke();

        // Glowing Intersections (Optional Polish)
        this.ctx.fillStyle = 'rgba(0, 255, 255, 0.2)';
        for (let x = 0; x <= this.canvas.width; x += gridSize) {
            for (let y = 0; y <= this.canvas.height; y += gridSize) {
                this.ctx.fillRect(x - 1, y - 1, 2, 2);
            }
        }

        this.level.draw(this.ctx);

        // Draw Particles (Under tanks)
        for (const p of this.particles) {
            if (p.type === 'shockwave') p.draw(this.ctx);
        }

        if (this.player.hp > 0) {
            this.player.draw(this.ctx);

            // Player Start Indicator
            if (this.playerIndicatorTimer > 0) {
                this.ctx.save();
                this.ctx.translate(this.player.x, this.player.y);

                // Fade out effect
                const alpha = Math.min(1, this.playerIndicatorTimer); // Fade out in last second if < 1, or just clamp
                // Let's make it blink or pulse slightly
                const pulse = 1 + Math.sin(performance.now() / 100) * 0.1;

                this.ctx.globalAlpha = alpha;

                // Yellow Circle
                this.ctx.beginPath();
                this.ctx.arc(0, 0, 50 * pulse, 0, Math.PI * 2);
                this.ctx.strokeStyle = '#ffff00';
                this.ctx.lineWidth = 3;
                this.ctx.stroke();

                // "YOU" Text
                this.ctx.fillStyle = '#ffff00';
                this.ctx.font = 'bold 20px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText('YOU', 0, 70 * pulse);

                // Arrow
                this.ctx.beginPath();
                this.ctx.moveTo(0, -55 * pulse);
                this.ctx.lineTo(-10, -80 * pulse);
                this.ctx.lineTo(10, -80 * pulse);
                this.ctx.fill();

                this.ctx.restore();
            }
        }
        for (const enemy of this.enemies) {
            enemy.draw(this.ctx);
        }

        for (const b of this.bullets) {
            b.draw(this.ctx);
        }

        // Draw Particles (Over tanks)
        for (const p of this.particles) {
            if (p.type !== 'shockwave') p.draw(this.ctx);
        }

        if (this.countdownTimer > 0) {
            this.ctx.save();
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 80px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.shadowColor = 'black';
            this.ctx.shadowBlur = 10;
            const text = Math.ceil(this.countdownTimer).toString();
            this.ctx.fillText(text, this.canvas.width / 2, this.canvas.height / 2);
            this.ctx.restore();
        }

        this.ctx.restore();
    }

    initHelpUI() {
        const div = document.createElement('div');
        div.id = 'help-ui';
        div.style.position = 'absolute';
        div.style.bottom = '10px';
        div.style.left = '10px';
        div.style.color = 'rgba(255, 255, 255, 0.7)';
        div.style.fontFamily = '"Segoe UI", monospace';
        div.style.fontSize = '12px';
        div.style.pointerEvents = 'none';
        div.style.textShadow = '1px 1px 1px black';
        div.innerHTML = `
            <b>操作方法</b><br>
            移動: WASD / 矢印 / 左スティック / パッド長押し<br>
            照準: マウス / 右スティック<br>
            発射: スペース / ボタン / Rトリガー<br>
            [0] ヘルプ切替
        `;
        document.body.appendChild(div);
        this.helpUI = div;
    }

    toggleHelp() {
        if (this.helpUI) {
            this.helpUI.style.display = this.helpUI.style.display === 'none' ? 'block' : 'none';
        }
    }
}
