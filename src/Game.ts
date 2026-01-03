import { Input } from './Input';
import { Level } from './map/Level';
import { Tank } from './entities/Tank';
import { Bullet } from './entities/Bullet';
import { Particle } from './entities/Particle';
import { SoundManager } from './utils/SoundManager';
import { checkCircleRectCollision } from './utils/MathUtils';
import { WeaponDrop } from './entities/WeaponDrop';
import { Gem } from './entities/Gem';


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
    drops: (WeaponDrop | Gem)[] = [];
    starField: { x: number, y: number, size: number, alpha: number }[] = [];


    gameState: 'start' | 'playing' | 'win' | 'lose' | 'victory' | 'levelup' = 'start';
    gameMode: 'stage' | 'battleroyale' | 'survival' = 'stage';

    // Survival Mode Props
    playerLevel: number = 1;
    playerXp: number = 0;
    nextLevelXp: number = 100;
    survivalTime: number = 0;
    survivalBossTimer: number = 0;

    spawnBoss(stage: number) {
        const p = this.getSafeSpawnPosition(60);
        if (!p) return;

        const bossCount = Math.floor(stage / 5); // 1, 2, 3...

        // Boss Stats Scaling
        // Boss Stats Scaling (Nerfed)
        // 1st Boss: 1200 HP (was 1500)
        const bossHp = 800 + bossCount * 400;

        const boss = new Tank(p.x, p.y, false, '#333', 250, 40, bossHp, 'shotgun', 3.0, 'boss');
        boss.width = 80;
        boss.height = 80;

        // 1st Boss: Lv2 (5-way), Others: Lv3 (7-way)
        boss.weaponLevel = bossCount >= 2 ? 3 : 2;

        // Damage Scaling (Buffed)
        boss.bulletDamage = 25 + bossCount * 5;

        boss.speed = 40 + (bossCount * 5); // Slightly faster each time

        this.enemies.push(boss);

        // Minions Scaling
        const minionCount = Math.min(2 + (bossCount - 1), 5);
        for (let i = 0; i < minionCount; i++) {
            this.spawnEnemy(stage);
        }
    }
    currentLevelIdx: number = 0;
    // playerLives removed in favor of this.player.hp
    // Score removed as per request

    // Ranking (Stores Stage Reached & Date)
    highScores: { stage: number, date: number }[] = [];
    lastRank: number = -1;
    currentScoreDate: number = 0; // To identify current run

    acquiredSkills: string[] = []; // Track upgrades
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
        // Let's keep Top 100 to prevent infinite growth, effectively "Not Ranked" if < 100.
        if (this.highScores.length > 100) {
            this.highScores = this.highScores.slice(0, 100);
        }

        if (this.gameMode === 'stage') {
            localStorage.setItem('tank_ranking_stage', JSON.stringify(this.highScores));
        }
    }



    // Roulette Props
    upgradeSelectionIndex: number = 0;
    menuSelectionIndex: number = 0; // 0: Campaign, 1: BR, 2: Survival
    rouletteState: 'idle' | 'spinning' | 'result' | 'manual' = 'idle';
    rouletteTimer: number = 0;
    rouletteDelay: number = 0.05;
    rouletteSteps: number = 0;

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
        this.player.invincibleTimer = 1.5;

        // Spawn Enemies based on Level
        this.enemies = [];

        if (this.gameMode === 'stage') {
            const stageNum = this.currentLevelIdx + 1;
            if (stageNum % 5 === 0 && stageNum > 0) {
                // BOSS BATTLE
                this.spawnFloatingText(this.player.x, this.player.y - 100, 'WARNING: BOSS APPROACHING!', '#f00');
                this.spawnBoss(stageNum);
            } else {
                // Normal Stage
                const count = 1 + this.currentLevelIdx;
                for (let i = 0; i < count; i++) {
                    this.spawnEnemy(stageNum);
                }
            }
        }

        this.updateUI();
    }

    spawnEnemy(difficultyLevel: number) {
        const playerX = 100;
        const playerY = 300;
        let ex = 0, ey = 0;
        let attempts = 0;
        let safe = false;

        do {
            ex = 50 + Math.random() * (this.canvas.width - 100);
            ey = 50 + Math.random() * (this.canvas.height - 100);

            // Check Wall Collision
            const wallCollision = this.level.walls.some((w: any) =>
                ex > w.x - 40 && ex < w.x + w.w + 40 &&
                ey > w.y - 40 && ey < w.y + w.h + 40
            );

            // Check Player Distance (Avoid Spawn Camping)
            const dist = Math.sqrt((ex - playerX) ** 2 + (ey - playerY) ** 2);
            safe = !wallCollision && dist > 300;

            attempts++;
        } while (!safe && attempts < 50);

        // Random Enemy Type
        const rand = Math.random();
        let enemy: Tank;

        if (this.gameMode === 'battleroyale') {
            // Random mix for BR - Buffed HP for long fights (~100-200)
            // Color, speed, damage, HP, role, cooldown, role
            if (rand < 0.1) enemy = new Tank(ex, ey, false, '#ccc', 200, 10, 200, 'normal', 3.0, 'armored');
            else if (rand < 0.2) enemy = new Tank(ex, ey, false, '#f80', 200, 15, 100, 'shotgun', 2.0, 'shotgun');
            else if (rand < 0.3) enemy = new Tank(ex, ey, false, '#ff0', 250, 5, 100, 'normal', 0.5, 'machinegun');
            else if (rand < 0.4) enemy = new Tank(ex, ey, false, '#0ff', 400, 20, 100, 'normal', 3.0, 'sniper');
            else if (rand < 0.5) enemy = new Tank(ex, ey, false, '#800', 150, 15, 150, 'normal', 2.5, 'heavy');
            else if (rand < 0.6) enemy = new Tank(ex, ey, false, '#a0f', 300, 10, 100, 'normal', 1.5, 'dasher');
            else enemy = new Tank(ex, ey, false, '#f00', 200, 10, 100, 'normal', 2.0, undefined); // Standard
        } else {
            // Stage Progression Logic
            if (difficultyLevel >= 5 && rand < 0.15) {
                // Armored (Silver): 30 HP (2 hits), Very Slow
                enemy = new Tank(ex, ey, false, '#ccc', 150, 5, 30, 'normal', 3.0, 'armored');
                enemy.speed = 50;
            } else if (difficultyLevel >= 4 && rand < 0.3) {
                // Shotgun (Orange): 15 HP (1 hit), Slow Fire
                enemy = new Tank(ex, ey, false, '#f80', 200, 5, 15, 'shotgun', 3.0, 'shotgun');
            } else if (difficultyLevel >= 3 && rand < 0.45) {
                // Machine Gunner (Yellow): 15 HP (1 hit), 1.0s cooldown
                enemy = new Tank(ex, ey, false, '#ff0', 250, 2, 15, 'normal', 1.0, 'machinegun');
            } else if (difficultyLevel >= 2 && rand < 0.6) {
                // Sniper (Cyan): 15 HP (1 hit), Very Slow reload (4s)
                enemy = new Tank(ex, ey, false, '#0ff', 400, 15, 15, 'normal', 4.0, 'sniper');
            } else if (difficultyLevel >= 2 && rand < 0.75) {
                // Heavy (Dark Red): 25 HP, Slow reload (3s)
                enemy = new Tank(ex, ey, false, '#800', 150, 10, 25, 'normal', 3.0, 'heavy');
            } else if (difficultyLevel >= 2 && rand < 0.9) {
                // Speedster (Purple): 15 HP (1 hit)
                enemy = new Tank(ex, ey, false, '#a0f', 300, 5, 15, 'normal', 2.0, 'dasher');
                enemy.speed = 130;
            } else {
                // Standard (Red): 15 HP, Default Fire Rate (3.0s set in Tank.ts)
                enemy = new Tank(ex, ey, false, undefined, 180, 5, 15);
            }
        }

        this.enemies.push(enemy);
    }

    start() {
        this.lastTime = performance.now();
        requestAnimationFrame((time) => this.loop(time));
    }

    getLevelForXp(level: number) {
        // Simple exponential curve: 100, 120, 144...
        return Math.floor(100 * Math.pow(1.2, level - 1));
    }

    gainXp(amount: number) {
        this.playerXp += amount;
        // Check Level Up
        if (this.gameMode === 'survival' && this.playerXp >= this.nextLevelXp) {
            this.playerLevel++;
            this.playerXp -= this.nextLevelXp;
            // Steeper curve: 1.5 multiplier
            this.nextLevelXp = Math.floor(this.nextLevelXp * 1.5);

            this.gameState = 'levelup'; // Pauses game, preserves enemies
            this.soundManager.playExplosion(); // Celebration sound?
            this.generateUpgrades();
            this.updateUI();
        }
        this.updateHUD();
    }

    loop(time: number) {
        const deltaTime = (time - this.lastTime) / 1000;
        this.lastTime = time;

        this.update(deltaTime);
        this.draw();

        // Draw Barrels (after entities?)
        // Let's draw inside draw() actually, wait. 
        // draw() calls various things.
        // It's not in draw() method here, draw() function is separate.
        // Let's modify draw() method.

        requestAnimationFrame((time) => this.loop(time));
    }

    update(dt: number) {
        this.input.update(); // Poll Gamepads

        if (this.countdownTimer > 0) {
            this.countdownTimer -= dt;
            if (this.countdownTimer <= 0) {
                this.countdownTimer = 0;
                this.soundManager.playShoot(); // GO!
            } else {
                return; // Freeze game during countdown
            }
        }

        // Update Drops
        for (let i = this.drops.length - 1; i >= 0; i--) {
            const drop = this.drops[i];
            drop.update(dt);
            if (!drop.active) {
                this.drops.splice(i, 1);
                continue;
            }

            // Check Collision with Player
            // Hit detection (Player)
            if (this.player.hp > 0 && Math.abs(this.player.x - drop.x) < 30 && Math.abs(this.player.y - drop.y) < 30) {
                if (drop instanceof Gem) {
                    if (drop.type === 'xp') {
                        this.gainXp(drop.value);
                        this.spawnFloatingText(this.player.x, this.player.y - 40, `+${drop.value} XP`, '#ff0');
                    } else {
                        // Power Gem (BR)
                        this.player.collectGem(drop.value);
                        this.spawnFloatingText(this.player.x, this.player.y - 40, `POWER UP! (+${drop.value})`, '#0ff');
                    }
                } else if (drop instanceof WeaponDrop) {
                    this.applyWeaponUpgrade(drop.role, this.player);
                }
                this.soundManager.playShoot(); // Pickup sound
                drop.active = false;
                this.drops.splice(i, 1);
                this.updateHUD(); // Update Gem UI
                continue;
            }

            // Enemey Pickups (BR)
            if (this.gameMode === 'battleroyale') {
                for (const enemy of this.enemies) {
                    if (enemy.hp > 0 && Math.abs(enemy.x - drop.x) < 30 && Math.abs(enemy.y - drop.y) < 30) {
                        if (drop instanceof Gem) {
                            if (drop.type === 'xp') {
                                // Enemies don't collect XP? Or do they level up too?
                                // Let's disable enemy XP pickup for now to keep it simple, or let them steal it?
                                // User: "picked up ... experience" -> typically player only.
                            } else {
                                enemy.collectGem(drop.value);
                            }
                            // Visual prompt?
                        } else if (drop instanceof WeaponDrop) {
                            this.applyWeaponUpgrade(drop.role, enemy);
                        }
                        this.soundManager.playShoot();
                        drop.active = false;
                        this.drops.splice(i, 1);
                        break;
                    }
                }
            }
        }

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
                // Pass all tanks as targets (FFA) and obstacles
                enemy.update(dt, null, this.level, this.bullets, demoTanks, demoTanks);
            }

            // Update Bullets
            for (let i = this.bullets.length - 1; i >= 0; i--) {
                const b = this.bullets[i];
                b.update(dt, this.level, demoTanks);
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
            // Input to Start (Blocked for short time after return)
            if (this.inputBlockTimer <= 0) {
                const isUp = this.input.isDown('ArrowUp') || this.input.axisLeft.y < -0.5 || this.input.isDown('KeyW');
                const isDown = this.input.isDown('ArrowDown') || this.input.axisLeft.y > 0.5 || this.input.isDown('KeyS');
                const isConfirm = this.input.isDown('Space') || this.input.isDown('Enter') || this.input.gamepadShoot || this.input.isDown('KeyZ') || this.input.isDown('KeyX');

                if (isUp) {
                    this.menuSelectionIndex = (this.menuSelectionIndex - 1 + 3) % 3;
                    this.inputBlockTimer = 0.2;
                    this.updateUI();
                } else if (isDown) {
                    this.menuSelectionIndex = (this.menuSelectionIndex + 1) % 3;
                    this.inputBlockTimer = 0.2;
                    this.updateUI();
                } else if (isConfirm) {
                    if (this.menuSelectionIndex === 0) this.startGame('stage');
                    else if (this.menuSelectionIndex === 1) this.startGame('battleroyale');
                    else if (this.menuSelectionIndex === 2) this.startGame('survival');
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

            // Roulette & Manual Logic
            const isLeft = this.input.isDown('ArrowLeft') || this.input.axisLeft.x < -0.5;
            const isRight = this.input.isDown('ArrowRight') || this.input.axisLeft.x > 0.5;
            const isConfirm = this.input.isDown('Space') || this.input.isDown('Enter') || this.input.gamepadShoot;

            if (this.gameState === 'win') {
                if (this.rouletteState === 'manual') {
                    // Manual Selection (Boss Reward)
                    if (isLeft && this.inputBlockTimer <= 0) {
                        this.upgradeSelectionIndex = (this.upgradeSelectionIndex - 1 + this.upgradeOptions.length) % this.upgradeOptions.length;
                        this.inputBlockTimer = 0.2;
                        this.updateUI();
                    }
                    if (isRight && this.inputBlockTimer <= 0) {
                        this.upgradeSelectionIndex = (this.upgradeSelectionIndex + 1) % this.upgradeOptions.length;
                        this.inputBlockTimer = 0.2;
                        this.updateUI();
                    }
                    if (isConfirm && this.inputBlockTimer <= 0) {
                        this.selectUpgrade(this.upgradeSelectionIndex);
                    }
                } else if (this.rouletteState === 'idle') {
                    if (isConfirm && this.inputBlockTimer <= 0) {
                        this.rouletteState = 'spinning';
                        this.rouletteDelay = 0.05; // Fast start
                        this.rouletteSteps = 20 + Math.floor(Math.random() * 10); // Random stops
                        this.rouletteTimer = 0;
                        this.soundManager.playShoot(); // Start sound
                        this.updateUI();
                    }
                } else if (this.rouletteState === 'spinning') {
                    this.rouletteTimer += dt;
                    if (this.rouletteTimer >= this.rouletteDelay) {
                        this.rouletteTimer = 0;
                        this.upgradeSelectionIndex = (this.upgradeSelectionIndex + 1) % this.upgradeOptions.length;
                        this.rouletteSteps--;

                        // Play tick sound (reuse shoot low pitch?)
                        // this.soundManager.playShoot(); 

                        // Slow down
                        if (this.rouletteSteps < 10) {
                            this.rouletteDelay *= 1.2; // Exponential slow down
                        }

                        if (this.rouletteSteps <= 0) {
                            this.rouletteState = 'result';
                            this.soundManager.playExplosion(); // Win sound (boom!)

                            // Auto-select after short delay
                            setTimeout(() => {
                                this.selectUpgrade(this.upgradeSelectionIndex);
                            }, 1500);
                        }
                        this.updateUI();
                    }
                }
            } else if (isConfirm && this.inputBlockTimer <= 0) {
                // Classic Victory/Lose confirm
                if (this.gameState === 'victory' || this.gameState === 'lose') {
                    this.firstNameScreen();
                }
            }

            // Level Up Selection
            if (this.gameState === 'levelup') {
                if (isLeft && this.inputBlockTimer <= 0) {
                    this.upgradeSelectionIndex = (this.upgradeSelectionIndex - 1 + this.upgradeOptions.length) % this.upgradeOptions.length;
                    this.inputBlockTimer = 0.2;
                    this.updateUI();
                }
                if (isRight && this.inputBlockTimer <= 0) {
                    this.upgradeSelectionIndex = (this.upgradeSelectionIndex + 1) % this.upgradeOptions.length;
                    this.inputBlockTimer = 0.2;
                    this.updateUI();
                }
                if (isConfirm && this.inputBlockTimer <= 0) {
                    this.selectUpgrade(this.upgradeSelectionIndex);
                    // Resume game
                    this.gameState = 'playing';
                    this.inputBlockTimer = 0.5;
                }
            }
            return;
        }

        // Survival Mode Logic
        if (this.gameMode === 'survival' && this.gameState === 'playing') {
            this.survivalTime += dt;
            this.survivalBossTimer += dt;

            // Boss Every 1 minute (60s)
            if (this.survivalBossTimer >= 60) {
                this.survivalBossTimer = 0;
                this.spawnSurvivalBoss();
                this.spawnFloatingText(this.player.x, this.player.y - 100, 'WARNING: BOSS!', '#f00');
            }

            // Infinite Enemy Spawning
            // Horde Mode: Start fast (1.0s), ramp to swarm (0.05s) over 3 mins (180s)
            // Even Faster
            const spawnRate = Math.max(0.05, 0.5 - (this.survivalTime / 180) * 0.45);

            if (Math.random() < dt / spawnRate) {
                // High Cap for Horde Feel (200)
                if (this.enemies.length < 200) {
                    this.spawnSurvivalEnemy();
                }
            }
        }

        // Periodic Gem Spawn in BR
        if (this.gameMode === 'battleroyale' && this.gameState === 'playing') {
            // Spawn 1 gem every 3 seconds roughly
            if (Math.random() < dt / 3.0) {
                const dropPos = this.getSafeSpawnPosition(30);
                if (dropPos) {
                    this.drops.push(new Gem(dropPos.x, dropPos.y));
                }
            }
        }

        // Check for shots
        const originalBulletCount = this.bullets.length;

        // Player vs Enemy Bullet Collision
        this.checkBulletBulletCollisions();

        // Update Player
        // Block input briefly at start to prevent accidental shots
        const playerInput = this.inputBlockTimer > 0 ? undefined : this.input;
        const allTanks = [this.player, ...this.enemies]; // All potential obstacles

        this.player.update(dt, playerInput, this.level, this.bullets, undefined, allTanks, this.drops);

        // Update Enemies
        for (const enemy of this.enemies) {
            enemy.update(dt, null, this.level, this.bullets, this.gameMode === 'battleroyale' ? allTanks : [this.player], allTanks, this.drops);
        }

        // Sound check for New Bullets
        if (this.bullets.length > originalBulletCount) {
            this.soundManager.playShoot();
        }

        // Update Bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.update(dt, this.level, allTanks);
            if (!b.active) {
                this.bullets.splice(i, 1);
            }
        }

        // Check for Return to Home
        if (this.input.isDown('Escape') || (this.input.activeInputType === 'gamepad' && navigator.getGamepads()[0]?.buttons[8].pressed)) {
            this.goToTitle();
            return;
        }

        // Remove inactive bullets post-collision
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            if (!this.bullets[i].active) this.bullets.splice(i, 1);
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
                if (this.player.invincibleTimer <= 0) {
                    this.spawnFloatingText(this.player.x, this.player.y - 20, `-${b.damage}`, '#f00');
                }
                const dead = this.player.takeDamage(b.damage);
                this.updateHUD();

                if (dead) {
                    if (this.gameMode === 'stage') this.saveRanking();
                    this.gameState = 'lose';
                    this.updateUI();
                } else {
                    // Hit Stun / Invincibility
                    this.player.invincibleTimer = 1.0;
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
                    // this.spawnFloatingText(enemy.x, enemy.y - 20, `-${b.damage}`, '#fff'); // Removed as per user request (Use Gauge)
                    const dead = enemy.takeDamage(b.damage);

                    // Drain
                    const owner = b.owner as Tank;
                    if (owner && owner.drain > 0 && owner.hp > 0 && owner.hp < owner.maxHp) {
                        const amount = Math.min(owner.maxHp - owner.hp, b.damage * owner.drain);
                        if (amount > 0.01) {
                            owner.hp += amount;
                            this.spawnFloatingText(owner.x, owner.y - 30, `+${amount.toFixed(1)}`, '#0f0');
                        }
                    }

                    if (dead) {
                        this.spawnExplosion(enemy.x, enemy.y, enemy.color, 50, true);
                        this.triggerShake(0.3, 5);

                        // Drop Gems (Base 1 + Held Gems)
                        if (this.gameMode === 'battleroyale') {
                            const totalGems = 1 + enemy.gemCount;
                            // Scatter them slightly
                            for (let k = 0; k < totalGems; k++) {
                                const gx = enemy.x + (Math.random() - 0.5) * 40;
                                const gy = enemy.y + (Math.random() - 0.5) * 40;
                                this.drops.push(new Gem(gx, gy, 1)); // 1 value gems
                            }
                        }

                        this.enemies.splice(j, 1);

                        // Win Check
                        if (this.enemies.length === 0) {
                            if (this.gameMode === 'battleroyale') {
                                this.gameState = 'victory';
                            } else {
                                this.gameState = 'win';
                                this.generateUpgrades(); // Generate options
                                this.inputBlockTimer = 1.0; // Block input for 1 second to prevent accidental skip
                            }
                            this.updateUI();
                        }
                    } else {
                        // Hit effect but not dead
                        this.spawnExplosion(enemy.x, enemy.y, '#fff', 10, false);
                    }

                    if (dead && this.gameMode === 'survival') {
                        // XP Drop (Physical item now)
                        // Fast Leveling: Base 30
                        const xpVal = 30 + Math.floor(this.survivalTime / 30);
                        // Drop XP Gem
                        const drop = new Gem(enemy.x, enemy.y, xpVal);
                        drop.type = 'xp'; // Need to add type to Gem or just handle by mode
                        this.drops.push(drop);
                    }

                    this.updateHUD();
                    break;
                }
            }
        }
    }

    firstNameScreen() {
        this.goToTitle();
    }

    goToTitle() {
        this.gameState = 'start';
        this.enemies = []; // Clear enemies
        this.bullets = [];
        this.particles = [];
        this.canvas.width = 800; // Reset Canvas
        this.canvas.height = 600;
        this.menuSelectionIndex = 0;
        this.inputBlockTimer = 0.5;
        this.updateUI();
        this.updateHUD(); // Reset HUD
    }

    updateHUD() {
        const hudHpBar = document.getElementById('hud-hp-bar');
        const hudStage = document.getElementById('hud-stage');

        if (hudHpBar) {
            const pct = Math.max(0, Math.min(100, (this.player.hp / this.player.maxHp) * 100));
            hudHpBar.style.width = `${pct}%`;

            if (pct > 50) hudHpBar.style.backgroundColor = '#0f0';
            else if (pct > 25) hudHpBar.style.backgroundColor = '#ff0';
            else hudHpBar.style.backgroundColor = '#f00';
        }

        if (hudStage) {
            if (this.gameMode === 'battleroyale') {
                hudStage.innerText = `生存数: ${this.enemies.length + (this.player.hp > 0 ? 1 : 0)}`;
            } else if (this.gameMode === 'survival') {
                // Time format MM:SS
                const m = Math.floor(this.survivalTime / 60);
                const s = Math.floor(this.survivalTime % 60);
                hudStage.innerText = `Time: ${m}:${s.toString().padStart(2, '0')}`;
            } else {
                hudStage.innerText = `ステージ: ${this.currentLevelIdx + 1}`;
            }
        }

        // Show Player Gems in BR
        if (this.gameMode === 'battleroyale' && hudHpBar) {
            // Create or update Gem Counter overlay
            let gemUI = document.getElementById('hud-gem-counter');
            if (!gemUI) {
                gemUI = document.createElement('div');
                gemUI.id = 'hud-gem-counter';
                gemUI.style.position = 'absolute';
                gemUI.style.top = '10px';
                gemUI.style.left = '320px'; // Right of HP bar
                gemUI.style.color = '#0ff';
                gemUI.style.fontWeight = 'bold';
                gemUI.style.fontSize = '20px';
                gemUI.style.textShadow = '2px 2px 2px #000';
                document.body.appendChild(gemUI);
            }
            gemUI.style.display = 'block';
            gemUI.innerText = `♦ ${this.player.gemCount}`;
        } else {
            const gemUI = document.getElementById('hud-gem-counter');
            if (gemUI) gemUI.style.display = 'none';
        }

        const hudXpContainer = document.getElementById('hud-xp-container');
        const hudXpBar = document.getElementById('hud-xp-bar');
        const hudLevel = document.getElementById('hud-level');

        if (hudXpContainer && hudXpBar && hudLevel) {
            if (this.gameMode === 'survival') {
                hudXpContainer.style.display = 'block';
                const xpPct = Math.min(100, (this.playerXp / this.nextLevelXp) * 100);
                hudXpBar.style.width = `${xpPct}%`;
                hudLevel.innerText = `LV. ${this.playerLevel}`;
            } else {
                hudXpContainer.style.display = 'none';
            }
        }

        const hudSkills = document.getElementById('hud-skills');
        if (hudSkills) {
            if (this.acquiredSkills.length === 0) {
                hudSkills.innerText = 'スキル: なし';
            } else {
                const counts: { [key: string]: number } = {};
                this.acquiredSkills.forEach(s => counts[s] = (counts[s] || 0) + 1);
                const text = Object.keys(counts).map(k => counts[k] > 1 ? `${k} x${counts[k]}` : k).join(', ');
                hudSkills.innerText = `スキル: ${text}`;
            }
        }
    }

    getSafeSpawnPosition(radius: number, avoidEntities: { x: number, y: number }[] = []): { x: number, y: number } {
        const w = this.level ? this.level.width : this.canvas.width;
        const h = this.level ? this.level.height : this.canvas.height;
        // Try up to 100 times to find a spot not overlapping walls
        for (let i = 0; i < 100; i++) {
            const x = 50 + Math.random() * (w - 100);
            const y = 50 + Math.random() * (h - 100);

            let safe = true;
            // Check Walls
            if (this.level) {
                for (const wall of this.level.walls) {
                    if (checkCircleRectCollision({ x, y, r: radius + 5 }, wall)) {
                        safe = false;
                        break;
                    }
                }
            }

            // Check Entity Avoidance (Min distance)
            if (safe && avoidEntities.length > 0) {
                for (const e of avoidEntities) {
                    const dist = Math.sqrt((e.x - x) ** 2 + (e.y - y) ** 2);
                    if (dist < 300) { // Keep 300px away
                        safe = false;
                        break;
                    }
                }
            }

            if (safe) return { x, y };
        }
        return { x: w / 2, y: h / 2 }; // Fallback
    }

    spawnSurvivalEnemy() {
        // Avoid Player (Spawn closer for action, but offscreen-ish)
        // Spawn ring: 500 to 900
        const p = this.getSafeSpawnPosition(30);
        const dist = Math.sqrt((p.x - this.player.x) ** 2 + (p.y - this.player.y) ** 2);

        // Enforce Ring
        if (dist < 400 || dist > 900) {
            // Too close or too far
            return;
        }

        // Scale difficulty with time
        // Every 60s, tier increases?
        const tier = Math.floor(this.survivalTime / 60) + 1;

        let enemy: Tank;
        // removed unused 'r'

        // Random types based on tier
        // Random types based on tier
        // Scaling Logic
        const baseSpeed = 100 + tier * 10; // Faster over time
        const baseDamage = 5 + tier * 2; // Harder hits
        const baseFireRate = Math.max(0.5, 3.0 - tier * 0.2); // Shoot faster

        if (Math.random() < 0.1 * tier) {
            // Harder enemies appear more often
            enemy = new Tank(p.x, p.y, false, '#f0f', baseSpeed * 1.5, baseDamage * 2, 30 + tier * 5, 'shotgun', baseFireRate, 'shotgun');
        } else {
            const hp = 15 + tier * 2;
            enemy = new Tank(p.x, p.y, false, '#f00', baseSpeed, baseDamage, hp, 'normal', baseFireRate);
        }
        this.enemies.push(enemy);
    }

    spawnSurvivalBoss() {
        const p = this.getSafeSpawnPosition(60);
        const types = ['tank', 'speed', 'spread'] as const;
        const type = types[Math.floor(Math.random() * types.length)];

        const tier = Math.floor(this.survivalTime / 120) + 1;
        const hp = 1000 + tier * 500;

        let boss: Tank;

        if (type === 'tank') {
            boss = new Tank(p.x, p.y, false, '#500', 100, 30, hp * 1.5, 'heavy', 3.0, 'heavy');
            boss.width = 100; boss.height = 100;
        } else if (type === 'speed') {
            boss = new Tank(p.x, p.y, false, '#90f', 300, 15, hp * 0.8, 'machinegun', 1.0, 'dasher');
            boss.width = 60; boss.height = 60;
        } else {
            boss = new Tank(p.x, p.y, false, '#fa0', 200, 20, hp, 'shotgun', 2.0, 'shotgun');
            boss.width = 80; boss.height = 80;
        }
        this.enemies.push(boss);
    }

    startGame(mode: 'stage' | 'battleroyale' | 'survival') {
        this.gameMode = mode;
        this.gameState = 'playing';
        this.drops = [];
        this.player.drain = 0.05;

        // Reset Player Traits (Clear Upgrades)
        // x, y, isPlayer, color, bulletSpeed, bulletDamage, hp
        this.player = new Tank(0, 0, true, undefined, 200, 20, 100);
        this.acquiredSkills = [];

        if (mode === 'battleroyale') {
            this.canvas.width = 800; // Small Viewport
            this.canvas.height = 600;

            this.player.maxHp = 100; // Same as Campaign
            this.player.hp = 100;
            this.player.invincibleTimer = 1.5;

            this.currentLevelIdx = 0;
            // Load Level -1 for BR Arena (Much Larger)
            this.level = new Level(-1, 2000, 1500);

            this.countdownTimer = 3; // Start Countdown

            this.bullets = [];
            this.particles = [];
            this.drops = [];

            // Spawn Player Safe
            const pSpawn = this.getSafeSpawnPosition(15);
            this.player.x = pSpawn.x;
            this.player.y = pSpawn.y;
            // hp already set

            // Spawn 9 Enemies Safe (Avoid Player and each other)
            this.enemies = [];
            for (let i = 0; i < 9; i++) {
                // Gather existing entities to avoid from
                const existing = [this.player, ...this.enemies];
                // Modified spawnEnemy to use getSafeSpawnPosition with avoidance
                // But spawnEnemy calls getSafeSpawnPosition internally without args in current implementation.
                // We need to refactor spawnEnemy or manually spawn here.
                // Converting spawnEnemy to take override position or just manual here.
                // Manual spawn for BR init to ensure distribution.

                const pos = this.getSafeSpawnPosition(15, existing);

                // Random Enemy
                let enemy: Tank;
                // Random Tier logic from spawnEnemy?
                // BR Logic: Random loadouts
                const randRole = Math.random();
                let role: any = 'standard';
                if (randRole < 0.2) role = 'sniper';
                else if (randRole < 0.4) role = 'shotgun';
                else if (randRole < 0.6) role = 'machinegun';
                else if (randRole < 0.8) role = 'dasher';

                enemy = new Tank(pos.x, pos.y, false, undefined, 150, 5, 100, role === 'shotgun' ? 'shotgun' : 'normal', 0.5, role);
                // Random Color
                const hue = Math.floor(Math.random() * 360);
                enemy.color = `hsl(${hue}, 70%, 50%)`;

                this.enemies.push(enemy);
            }

            // Spawn Random Gems
            const gemCount = 10;
            for (let i = 0; i < gemCount; i++) {
                const dropPos = this.getSafeSpawnPosition(30);
                if (dropPos) {
                    this.drops.push(new Gem(dropPos.x, dropPos.y));
                }
            }

            this.playerIndicatorTimer = 3.0;
        } else if (mode === 'survival') {
            this.canvas.width = 800; // Viewport
            this.canvas.height = 600; // Viewport
            this.level = new Level(-1, 3000, 2000); // Huge Arena, no obstacles

            this.player.maxHp = 100;
            this.player.hp = 100;
            this.playerLevel = 1;
            this.playerXp = 0;
            this.nextLevelXp = 50; // Start fast
            this.survivalTime = 0;
            this.survivalBossTimer = 0;

            // Generate Star Field for Parallax/Movement sense
            this.starField = [];
            for (let i = 0; i < 300; i++) {
                this.starField.push({
                    x: Math.random() * 3000,
                    y: Math.random() * 2000,
                    size: Math.random() * 3 + 1,
                    alpha: Math.random() * 0.5 + 0.1
                });
            }

            // Spawn Player Center
            this.player.x = 1500;
            this.player.y = 1000;

            this.enemies = []; // Start empty, spawn gradually

            // Grant 1 Starter Skill
            this.generateUpgrades(); // Generate
            // Auto-pick random or let user pick? User request says "One skill".
            // Let's open the selection screen immediately?
            // "一番最初に一つだけスキル獲得できる" -> "Can acquire one skill at the very beginning".
            // So we transition to 'levelup' state immediately.
            this.gameState = 'levelup';
            this.inputBlockTimer = 0.5;
        } else {
            this.player.maxHp = 100; // Scaled HP
            this.player.hp = 100;
            this.player.invincibleTimer = 1.5;

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




    // ... items ...

    generateUpgrades() {
        const stage = this.currentLevelIdx + 1;

        // 5の倍数ステージ（ボス戦後）ならマニュアル選択、それ以外はルーレット
        // Survival Mode is always manual selection (XP level up)
        if (this.gameMode === 'survival' || (stage % 5 === 0 && this.gameMode === 'stage')) {
            this.rouletteState = 'manual';
        } else {
            this.rouletteState = 'idle';
        }

        this.inputBlockTimer = 0.5; // Prevent instant spin/select
        const potentialUpgrades = [
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
                id: 'shrink',
                label: '小型化モジュール',
                description: 'サイズ -20% (回避率UP)',
                apply: (t: Tank) => { t.width *= 0.8; t.height *= 0.8; }
            }
        ];

        // Removed HP Upgrade as requested

        // Weapon Options (Buffs)
        const weaponRoles = [
            { id: 'shotgun', label: '拡散弾モジュール', desc: '発射数 +2', role: 'shotgun' },
            { id: 'sniper', label: '精密射撃モジュール', desc: '弾速UP・威力UP', role: 'sniper' },
            { id: 'machinegun', label: 'ラピッドファイア', desc: '連射速度UP・威力微減', role: 'machinegun' },
            { id: 'heavy', label: '重砲身モジュール', desc: '威力大幅UP・連射ダウン', role: 'heavy' }
        ];

        weaponRoles.forEach(w => {
            potentialUpgrades.push({
                id: w.id,
                label: w.label,
                description: w.desc,
                apply: () => this.applyWeaponUpgrade(w.role)
            });
        });

        // New Upgrades
        potentialUpgrades.push({
            id: 'ricochet',
            label: '反射弾',
            description: '壁の反射回数 +1',
            apply: (t: Tank) => { t.bulletRicochet++; }
        });

        if (this.player.drain < 0.1) { // Cap at some point? Or prevent dupes
            potentialUpgrades.push({
                id: 'vampire',
                label: 'ドレイン装甲',
                description: '与ダメージの5%を回復',
                apply: (t: Tank) => { t.drain += 0.05; }
            });
        }

        // Shuffle and pick 3
        const shuffled = potentialUpgrades.sort(() => 0.5 - Math.random());
        this.upgradeOptions = shuffled.slice(0, 3);
        this.upgradeSelectionIndex = 1; // Default to center option
    }

    selectUpgrade(index: number) {
        if (this.inputBlockTimer > 0) return; // Prevent selection if blocked

        if (this.upgradeOptions[index]) {
            const up = this.upgradeOptions[index];
            up.apply(this.player);
            this.acquiredSkills.push(up.label);

            // Apply healing on clear regardless? Or just maintain HP?
            // Let's heal 1 HP for free on clear
            if (this.player.hp < this.player.maxHp) this.player.hp++;

            // Next level
            // Next level logic
            if (this.gameMode === 'survival') {
                // Survival: Just resume
                this.gameState = 'playing';
            } else {
                // Stage Mode: Next Level
                this.currentLevelIdx++;
                this.initLevel();
                this.gameState = 'playing';
            }
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
            html += '<h1>タンクバトル</h1>';

            const modes = [
                { label: 'ステージモード', desc: '無限ステージ (5面毎にボス)' },
                { label: 'バトルロイヤル', desc: '最後の1人になるまで戦え' },
                { label: 'サバイバル', desc: '無限に湧く敵と戦い強化せよ' }
            ];

            modes.forEach((m, i) => {
                const isSelected = i === this.menuSelectionIndex;
                const color = isSelected ? '#0f0' : '#888';
                const cursor = isSelected ? '▶ ' : '&nbsp;&nbsp;';
                const bg = isSelected ? 'rgba(0, 255, 0, 0.1)' : 'transparent';

                html += `<div style="padding: 10px; margin: 5px; background: ${bg}; border-radius: 5px; color: ${color};">
                            <span style="font-size: 1.2em; font-weight: bold;">${cursor}${m.label}</span><br>
                            <span style="font-size: 0.8em; margin-left: 20px;">${m.desc}</span>
                         </div>`;
            });

            html += '<p style="margin-top:20px; color:#aaa; font-size:0.8em;">[↑↓] 選択  [SPACE/ボタン] 決定</p>';

            this.renderRanking(ui, html); // Helper to append Ranking
            ui.style.display = 'flex';
        } else if (this.gameState === 'playing') {
            ui.style.display = 'none';
        } else if (this.gameState === 'win' || this.gameState === 'levelup') {
            if (this.gameState === 'win') {
                html += `<h1>ステージ ${this.currentLevelIdx + 1} クリア！</h1>`;
            } else {
                html += `<h1>LEVEL UP! (LV.${this.playerLevel})</h1>`;
            }

            // Shared Upgrade Selection UI
            if (this.rouletteState === 'manual' || this.gameState === 'levelup') {
                // MANUAL MODE (Boss Reward / Level Up) - Classic Button Grid
                html += `<p style="color: #0ff; margin-bottom: 20px;">CHOOSE YOUR UPGRADE!</p>
                         <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center;">`;

                this.upgradeOptions.forEach((up, i) => {
                    const isSelected = i === this.upgradeSelectionIndex;
                    const border = isSelected ? '4px solid #fff' : '2px solid #0f0';
                    const bg = isSelected ? '#555' : '#222';
                    const transform = isSelected ? 'scale(1.1)' : 'scale(1.0)';

                    html += `<button id="upg-${i}" style="pointer-events: auto; padding: 15px 25px; font-size: 16px; background: ${bg}; border: ${border}; color: #fff; cursor: pointer; transform: ${transform}; transition: all 0.1s; border-radius: 8px;">
                                <div style="font-weight:bold; color: #0f0;">${up.label}</div>
                                <div style="font-size: 12px; color: #aaa;">${up.description}</div>
                             </button>`;
                });
                html += `</div>`;

            } else {
                // ROULETTE MODE - Vertical Slot Style
                // Show a single large box that changes content
                const currentItem = this.upgradeOptions[this.upgradeSelectionIndex];

                // Visual determination
                let borderColor = '#0f0';
                let labelColor = '#fff';
                let animClass = '';

                if (this.rouletteState === 'result') {
                    borderColor = '#ff0';
                    labelColor = '#ff0';
                    animClass = 'animation: pulse 0.2s infinite;'; // Excite on win
                } else if (this.rouletteState === 'spinning') {
                    // Blur effect or just rapid switch
                }

                html += `<div style="margin-top: 20px; display: flex; flex-direction: column; align-items: center;">
                            <div style="width: 300px; height: 150px; background: #000; border: 10px solid ${borderColor}; border-radius: 15px; display: flex; flex-direction: column; justify-content: center; align-items: center; box-shadow: 0 0 20px ${borderColor}; ${animClass}">
                                <div style="font-size: 32px; font-weight: bold; color: ${labelColor}; margin-bottom: 10px;">${currentItem.label}</div>
                                <div style="font-size: 18px; color: #ccc;">${currentItem.description}</div>
                            </div>
                         </div>`;

                if (this.rouletteState === 'idle') {
                    html += `<p style="margin-top: 30px; color: #0f0; font-size: 24px; animation: flash 1s infinite;">PRESS SPACE TO SPIN!</p>`;
                } else if (this.rouletteState === 'result') {
                    html += `<p style="margin-top: 30px; color: #ff0; font-size: 32px; font-weight: bold;">GET!</p>`;
                }
            }

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
            } else if (this.gameMode === 'survival') {
                const m = Math.floor(this.survivalTime / 60);
                const s = Math.floor(this.survivalTime % 60);
                html += `<h1>GAME OVER</h1><p>生存時間: ${m}分 ${s}秒</p><p>Level: ${this.playerLevel}</p><p>[SPACE/ボタン] でリトライ</p>`;
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

    checkBulletBulletCollisions() {
        for (let i = 0; i < this.bullets.length; i++) {
            for (let j = i + 1; j < this.bullets.length; j++) {
                const b1 = this.bullets[i];
                const b2 = this.bullets[j];

                if (!b1.active || !b2.active) continue;

                // Check ownership: strictly Player vs Enemy or Enemy vs Player
                const b1IsPlayer = b1.owner === this.player;
                const b2IsPlayer = b2.owner === this.player;

                if (b1IsPlayer !== b2IsPlayer) {
                    const dx = b1.x - b2.x;
                    const dy = b1.y - b2.y;
                    const distSq = dx * dx + dy * dy;

                    // Refine collision distance
                    const r1 = (b1.owner && (b1.owner as any).role === 'boss') ? 10 : b1.radius;
                    const r2 = (b2.owner && (b2.owner as any).role === 'boss') ? 10 : b2.radius;

                    if (distSq < (r1 + r2) * (r1 + r2)) {
                        // Boss Bullet Dominance
                        const b1IsBoss = (b1.owner && (b1.owner as any).role === 'boss');
                        const b2IsBoss = (b2.owner && (b2.owner as any).role === 'boss');

                        if (b1IsBoss && !b2IsBoss) {
                            b2.active = false; // Destroy player bullet
                            this.spawnExplosion(b2.x, b2.y, '#fff', 5, false);
                        } else if (b2IsBoss && !b1IsBoss) {
                            b1.active = false; // Destroy player bullet
                            this.spawnExplosion(b1.x, b1.y, '#fff', 5, false);
                        } else {
                            // Standard cancellation
                            b1.active = false;
                            b2.active = false;
                            this.spawnExplosion((b1.x + b2.x) / 2, (b1.y + b2.y) / 2, '#fff', 5, false);
                        }
                    }
                }
            }
        }
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
        // Clear with dark background
        if (this.gameMode === 'survival') {
            this.ctx.fillStyle = '#100020'; // Deep Space Purple
        } else {
            this.ctx.fillStyle = '#050510'; // Deep Blue-Black
        }
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();

        // Screen Shake
        if (this.shakeTime > 0) {
            const dx = (Math.random() - 0.5) * this.shakeIntensity;
            const dy = (Math.random() - 0.5) * this.shakeIntensity;
            this.ctx.translate(dx, dy);
        }

        // -- Star Field (Survival) --
        if (this.gameMode === 'survival') {
            this.ctx.fillStyle = '#fff';
            for (const s of this.starField) {
                this.ctx.globalAlpha = s.alpha;
                this.ctx.fillRect(s.x, s.y, s.size, s.size);
            }
            this.ctx.globalAlpha = 1.0;
        }

        // -- Cyber Grid Background --
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)'; // Faint Cyan
        this.ctx.shadowBlur = 0;

        const gridSize = 40;

        // Offset Grid by Camera
        // If NO Camera (Survival/Stage), we are centered or fixed.
        // Wait, current logic:
        // BR/Survival: Camera logic translates CTX.
        // Stage: No camera.

        // ISSUE: If CTX is translated, drawing Grid at 0,0 is wrong because it moves with camera.
        // We want grid to cover the WORLD.
        // OR better: Draw Grid relative to camera using modulo to simulate infinite scrolling floor?
        // But Survival is now FIXED CAMERA (1200x800) again? Or did we keep camera 3000x2000?
        // Last step we changed Survival to 3000x2000 with camera.
        // So standard world drawing works if we draw world-sized grid?

        // But for "feeling of movement", a static grid on a static floor is fine IF the camera moves.
        // But the user says " doesn't feel like moving". Maybe the floor is too plain?
        // Let's draw the grid covering the ENTIRE world area.

        const worldW = (this.gameMode === 'survival') ? 3000 : (this.gameMode === 'battleroyale' ? 2000 : this.canvas.width);
        const worldH = (this.gameMode === 'survival') ? 2000 : (this.gameMode === 'battleroyale' ? 1500 : this.canvas.height);

        this.ctx.beginPath();
        // Vertical
        for (let x = 0; x <= worldW; x += gridSize) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, worldH);
        }
        // Horizontal
        for (let y = 0; y <= worldH; y += gridSize) {
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(worldW, y);
        }
        this.ctx.stroke();

        // Glowing Intersections (Optional Polish)
        // Too heavy for huge world? Skip for perf?
        // this.ctx.fillStyle = 'rgba(0, 255, 255, 0.2)';
        // ...

        // Camera Logic
        let camX = 0;
        let camY = 0;

        if (this.gameMode === 'battleroyale' || this.gameMode === 'survival') {
            // Center on player
            camX = this.player.x - this.canvas.width / 2;
            camY = this.player.y - this.canvas.height / 2;

            // Clamp to world
            const worldW = this.gameMode === 'survival' ? 3000 : 2000;
            const worldH = this.gameMode === 'survival' ? 2000 : 1500;
            camX = Math.max(0, Math.min(camX, worldW - this.canvas.width));
            camY = Math.max(0, Math.min(camY, worldH - this.canvas.height));

            this.ctx.translate(-camX, -camY);
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

        for (const drop of this.drops) {
            drop.draw(this.ctx);
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

        // Minimap (After restore, screen space)
        if (this.gameMode === 'battleroyale' || this.gameMode === 'survival') {
            this.drawMinimap();
        }
    }

    drawMinimap() {
        // Settings
        const mapW = 200;
        const mapH = 133; // 1200x800 aspect
        const margin = 10;
        const x = this.canvas.width - mapW - margin;
        const y = this.canvas.height - mapH - margin;

        const worldW = this.gameMode === 'survival' ? 3000 : 2000;
        const worldH = this.gameMode === 'survival' ? 2000 : 1500;
        const scale = mapW / worldW;

        this.ctx.save();
        this.ctx.translate(x, y);

        // BG
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(0, 0, mapW, mapH);
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(0, 0, mapW, mapH);

        // Walls (Static usually, but we have random ones)
        this.ctx.fillStyle = '#555';
        for (const w of this.level.walls) {
            // Don't draw bounds (too confusing)
            if (w.w >= worldW || w.h >= worldH) continue;
            this.ctx.fillRect(w.x * scale, w.y * scale, Math.max(1, w.w * scale), Math.max(1, w.h * scale));
        }

        // Gems
        this.ctx.fillStyle = '#0ff';
        for (const d of this.drops) {
            if (!d.active) continue;
            // Only Gems? No, drops array has gems.
            // Gem size
            this.ctx.fillRect(d.x * scale - 1, d.y * scale - 1, 3, 3);
        }

        // Enemies
        this.ctx.fillStyle = '#f00';
        for (const e of this.enemies) {
            if (e.hp <= 0) continue;
            this.ctx.fillRect(e.x * scale - 1.5, e.y * scale - 1.5, 3, 3);
        }

        // Player
        if (this.player.hp > 0) {
            this.ctx.fillStyle = '#0f0';
            this.ctx.fillRect(this.player.x * scale - 2, this.player.y * scale - 2, 4, 4);
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

    spawnFloatingText(x: number, y: number, text: string, color: string) {
        this.particles.push(new Particle(x, y, color, 0, 'text', text));
    }

    applyWeaponUpgrade(role: string, target?: Tank) {
        // Additive Upgrades - No Resetting!
        const t = target || this.player;

        if (role === 'sniper') {
            t.bulletSpeed *= 1.3;
            t.bulletDamage += 10;
            t.fireRate *= 1.1; // Slightly slower
        } else if (role === 'machinegun') {
            t.fireRate *= 0.7; // 30% faster
            t.bulletDamage *= 0.8; // Reduced damage per shot
        } else if (role === 'shotgun') {
            t.shotSpread += 1; // Add 2 bullets (1 per side)
            t.fireRate *= 1.1; // Slightly slower
        } else if (role === 'heavy') {
            t.bulletDamage += 20;
            t.fireRate *= 1.2; // Slower
        } else if (role === 'dasher') {
            t.speed *= 1.2;
        }

        this.spawnFloatingText(t.x, t.y - 60, `UPGRADE!`, '#ff0');

        // Visuals: just update role if it's new, but don't reset
        t.role = role as any;
    }
}
