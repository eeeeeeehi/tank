import { Input } from './Input';
import { Level } from './map/Level';
import { Tank } from './entities/Tank';
import { Bullet } from './entities/Bullet';
import { Particle } from './entities/Particle';
import { SoundManager } from './utils/SoundManager';

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

    gameState: 'start' | 'playing' | 'win' | 'lose' = 'start';
    currentLevelIdx: number = 0;
    playerLives: number = 5;
    // Score removed as per request

    // Ranking (Stores Stage Reached)
    highScores: number[] = []; // Stores stage numbers
    soundManager: SoundManager;

    // Screen Shake
    shakeTime: number = 0;
    shakeIntensity: number = 0;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.input = new Input();

        this.soundManager = new SoundManager();
        this.loadRanking();

        this.level = new Level();
        this.player = new Tank(100, 300, true);
        this.initLevel(); // Initial setup
        this.updateHUD(); // Initial HUD
    }

    loadRanking() {
        const saved = localStorage.getItem('tank_ranking_stage');
        if (saved) {
            this.highScores = JSON.parse(saved);
        } else {
            this.highScores = []; // Start empty (User Request)
        }
    }

    saveRanking() {
        const stage = this.currentLevelIdx + 1;
        this.highScores.push(stage);
        this.highScores.sort((a, b) => b - a);
        this.highScores = this.highScores.slice(0, 5); // Keep top 5
        localStorage.setItem('tank_ranking_stage', JSON.stringify(this.highScores));
    }

    // Called when moving to next level
    initLevel() {
        this.bullets = [];
        this.particles = [];
        this.shakeTime = 0;

        // Load Level Layout
        this.level = new Level(this.currentLevelIdx);

        // Keep Player
        this.player.x = 100;
        this.player.y = 300;
        this.player.rotation = 0;

        // Spawn Enemies based on Level
        this.enemies = [];
        const count = 1 + this.currentLevelIdx;
        for (let i = 0; i < count; i++) {
            let ex = 0, ey = 0;
            let attempts = 0;
            do {
                ex = 400 + Math.random() * 300;
                ey = 100 + Math.random() * 400;
                attempts++;
            } while (this.level.walls.some((w: any) =>
                ex > w.x - 20 && ex < w.x + w.w + 20 &&
                ey > w.y - 20 && ey < w.y + w.h + 20
            ) && attempts < 10);

            // Random Enemy Type
            const rand = Math.random();
            const level = this.currentLevelIdx + 1;
            let enemy: Tank;

            if (level >= 5 && rand < 0.15) {
                // Armored (Silver): 3 HP, Slow, Normal Gun
                enemy = new Tank(ex, ey, false, '#ccc', 200, 1, 3, 'normal', 1.0, 'armored');
                enemy.speed = 60; // Slow
            } else if (level >= 4 && rand < 0.3) {
                // Shotgun (Orange): 1 HP, Spread
                enemy = new Tank(ex, ey, false, '#f80', 200, 1, 1, 'shotgun', 1.5, 'shotgun');
            } else if (level >= 3 && rand < 0.45) {
                // Machine Gunner (Yellow): Fast Fire, Low Damage (1), but Rapid
                enemy = new Tank(ex, ey, false, '#ff0', 250, 1, 1, 'normal', 0.2, 'machinegun');
            } else if (level >= 2 && rand < 0.6) {
                // Sniper (Cyan): Fast Bullet (500), Slow Reload (2s)
                enemy = new Tank(ex, ey, false, '#0ff', 500, 1, 1, 'normal', 2.0, 'sniper');
            } else if (level >= 2 && rand < 0.75) {
                // Heavy (Dark Red): 2 Damage
                enemy = new Tank(ex, ey, false, '#800', 200, 2, 1, 'normal', 1.0, 'heavy');
            } else if (level >= 2 && rand < 0.9) {
                // Speedster (Purple): Fast Bullet, Fast Move
                enemy = new Tank(ex, ey, false, '#a0f', 400, 1, 1, 'normal', 0.5, 'dasher');
                enemy.speed = 150;
            } else {
                // Standard (Red)
                enemy = new Tank(ex, ey, false); // Default params
            }

            this.enemies.push(enemy);
        }

        this.updateUI();
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
        // Shake Update
        if (this.shakeTime > 0) {
            this.shakeTime -= dt;
            if (this.shakeTime < 0) this.shakeTime = 0;
        }

        // Game State Logic
        if (this.gameState === 'start') {
            if (this.input.isDown('Space')) {
                this.startGame();
            }
            return;
        }
        if (this.gameState !== 'playing') {
            if (this.input.isDown('Space') && (this.gameState === 'win' || this.gameState === 'lose')) {
                if (this.gameState === 'win') {
                    // Next level
                    this.currentLevelIdx++;
                    this.initLevel();
                } else {
                    // Game Over - Restart
                    this.startGame();
                }
                this.gameState = 'playing';
                this.updateUI();
                this.updateHUD();
            }
            return;
        }

        // Check for shots
        const originalBulletCount = this.bullets.length;

        // Update Player
        this.player.update(dt, this.input, this.level, this.bullets);

        // Update Enemies
        for (const enemy of this.enemies) {
            enemy.update(dt, null, this.level, this.bullets);
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
                this.playerLives -= b.damage; // Use bullet damage
                this.updateHUD();

                if (this.playerLives <= 0) {
                    this.saveRanking();
                    this.gameState = 'lose';
                    this.updateUI();
                } else {
                    // Respawn
                    this.player.x = 100;
                    this.player.y = 300;
                    this.player.rotation = 0;
                    // Optional: clear enemy bullets to avoid spawn kill?
                }
                break;
            }

            // Check Enemies
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const enemy = this.enemies[j];
                if (b.owner !== enemy && this.checkBulletTankCollision(b, enemy)) {
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
                            this.gameState = 'win';
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

    startGame() {
        this.gameState = 'playing';
        this.playerLives = 5; // Reset lives on new game
        this.currentLevelIdx = 0;
        this.initLevel();
        this.updateUI();
        this.updateHUD();
    }

    triggerShake(duration: number, intensity: number) {
        this.shakeTime = duration;
        this.shakeIntensity = intensity;
    }

    spawnExplosion(x: number, y: number, color: string, count: number, big: boolean) {
        // Sparks
        for (let i = 0; i < count; i++) {
            this.particles.push(new Particle(x, y, color, big ? 150 : 50));
        }
        if (big) {
            // Shockwave
            this.particles.push(new Particle(x, y, color, 0, 'shockwave'));

            // Fire (MORE!)
            for (let i = 0; i < 20; i++) {
                this.particles.push(new Particle(x + (Math.random() - 0.5) * 15, y + (Math.random() - 0.5) * 15, '#fa0', 60, 'fire'));
            }

            // Smoke
            for (let i = 0; i < 10; i++) {
                this.particles.push(new Particle(x, y, '#555', 40, 'smoke'));
            }

            // Debris
            for (let i = 0; i < 8; i++) {
                this.particles.push(new Particle(x, y, color, 150, 'debris'));
            }
        }
    }

    updateUI() {
        const ui = document.getElementById('game-ui');
        if (!ui) return;

        // Hide HUD in menu? Maybe keep it.

        let html = '';
        if (this.gameState === 'start') {
            html += '<h1>TANK BATTLE</h1><p>Press SPACE to Start</p>';
            this.renderRanking(ui, html); // Helper to append Ranking
            ui.style.display = 'flex';
        } else if (this.gameState === 'playing') {
            ui.style.display = 'none';
        } else if (this.gameState === 'win') {
            html += `<h1>VICTORY!</h1><p>Stage ${this.currentLevelIdx} Cleared!</p><p>Press SPACE for Next Level</p>`;
            ui.innerHTML = html;
            ui.style.display = 'flex';
        } else if (this.gameState === 'lose') {
            const stage = this.currentLevelIdx + 1;
            html += `<h1>GAME OVER</h1><p>You reached Stage ${stage}</p><p>Press SPACE to Try Again</p>`;
            this.renderRanking(ui, html);
            ui.style.display = 'flex';
        }
    }

    renderRanking(container: HTMLElement, baseHtml: string) {
        let list = '<div style="margin-top:20px; text-align:left;"><h3>Stages Reached</h3><ol>';
        this.highScores.forEach(s => list += `<li>Stage ${s}</li>`);
        list += '</ol></div>';
        container.innerHTML = baseHtml + list;
    }

    updateHUD() {
        const hudLives = document.getElementById('hud-lives');
        const hudStage = document.getElementById('hud-stage');
        // const hudScore = document.getElementById('hud-score'); // Removed

        if (hudLives) {
            // Convert lives to hearts
            const hearts = '❤'.repeat(Math.max(0, this.playerLives));
            hudLives.innerText = `Lives: ${hearts}`;
            // Optional: Change color if low?
            hudLives.style.color = this.playerLives <= 1 ? '#f55' : 'white';
        }

        if (hudStage) {
            hudStage.innerText = `Stage: ${this.currentLevelIdx + 1}`;
        }
    }

    checkBulletTankCollision(b: Bullet, t: Tank): boolean {
        // Simple Circle-Rect
        return (
            b.x > t.x - t.width / 2 &&
            b.x < t.x + t.width / 2 &&
            b.y > t.y - t.height / 2 &&
            b.y < t.y + t.height / 2
        );
    }

    resetGame() {
        this.bullets = [];
        this.player = new Tank(100, 300, true);
        this.enemies = [
            new Tank(600, 100, false),
            new Tank(600, 500, false),
            new Tank(400, 300, false)
        ];
    }

    draw() {
        this.ctx.fillStyle = '#222';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();

        // Screen Shake
        if (this.shakeTime > 0) {
            const dx = (Math.random() - 0.5) * this.shakeIntensity;
            const dy = (Math.random() - 0.5) * this.shakeIntensity;
            this.ctx.translate(dx, dy);
        }

        this.level.draw(this.ctx);

        // Draw Particles (Under tanks)
        for (const p of this.particles) {
            if (p.type === 'shockwave') p.draw(this.ctx); // Draw shockwaves below
        }

        this.player.draw(this.ctx);
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

        this.ctx.restore();
    }
}
