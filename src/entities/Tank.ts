import { Entity } from './Entity';
import { Bullet } from './Bullet';
import { Input } from '../Input';
import { Level } from '../map/Level';
import type { Rect } from '../utils/MathUtils';
import { checkAABBCollision } from '../utils/MathUtils';

export class Tank extends Entity {
    rotation: number = 0;
    speed: number = 100;
    rotationSpeed: number = 10;
    width: number = 30;
    height: number = 30;

    shootTimer: number = 0;
    public isPlayer: boolean;
    color: string;
    bulletSpeed: number = 200;
    bulletDamage: number = 1;

    // New Properties
    hp: number = 1;
    maxHp: number = 1;
    fireRate: number = 0.5;
    weaponType: 'normal' | 'shotgun' = 'normal';

    role: 'standard' | 'sniper' | 'machinegun' | 'shotgun' | 'dasher' | 'armored' | 'heavy' = 'standard';

    // Upgrade Stats
    bulletRicochet: number = 0;
    bulletHoming: number = 0; // Strength
    vampire: boolean = false;

    constructor(
        x: number,
        y: number,
        isPlayer: boolean,
        color?: string,
        bulletSpeed: number = 200,
        bulletDamage: number = 1,
        hp: number = 1,
        weaponType: 'normal' | 'shotgun' = 'normal',
        fireRate: number = 0.5,
        role: 'standard' | 'sniper' | 'machinegun' | 'shotgun' | 'dasher' | 'armored' | 'heavy' = 'standard'
    ) {
        super(x, y);
        this.isPlayer = isPlayer;
        this.color = color ? color : (isPlayer ? '#0f0' : '#f00');
        this.bulletSpeed = bulletSpeed;
        this.bulletDamage = bulletDamage;
        this.hp = hp;
        this.maxHp = hp;
        this.weaponType = weaponType;
        this.fireRate = fireRate;
        this.role = role;

        if (!isPlayer) {
            this.rotation = Math.PI;
        }
    }

    takeDamage(amount: number): boolean {
        if (this.invincibleTimer > 0) return false;
        this.hp -= amount;
        return this.hp <= 0;
    }

    // AI State
    invincibleTimer: number = 0; // Invincibility logic
    aiTimer: number = 0;
    aiAction: 'idle' | 'moveBase' | 'rotateLeft' | 'rotateRight' | 'forward' | 'backward' = 'idle';
    aiShootTimer: number = 0;

    update(dt: number, input?: Input | null, level?: Level, bullets?: Bullet[], targets?: Tank[]) {
        if (this.invincibleTimer > 0) {
            this.invincibleTimer -= dt;
        }

        if (this.shootTimer > 0) {
            this.shootTimer -= dt;
        }

        // Handle optional args for Entity compatibility
        if (!input && !this.isPlayer) {
            // allow AI to run without input
        }

        // Player Control
        if (this.isPlayer && input && level && bullets) {
            // Keyboard Movement
            let dx = 0;
            let dy = 0;

            if (input.isDown('ArrowLeft') || input.isDown('KeyA')) dx -= 1;
            if (input.isDown('ArrowRight') || input.isDown('KeyD')) dx += 1;
            if (input.isDown('ArrowUp') || input.isDown('KeyW')) dy -= 1;
            if (input.isDown('ArrowDown') || input.isDown('KeyS')) dy += 1;

            // Mouse Movement (Hold Click to Move)
            if (input.mouseDown) {
                const dist = Math.sqrt((input.mouseX - this.x) ** 2 + (input.mouseY - this.y) ** 2);
                if (dist > 20) { // Deadzone
                    dx += (input.mouseX - this.x) / dist;
                    dy += (input.mouseY - this.y) / dist;
                }
            }

            // Mobile / Gamepad Movement
            if (input.axisLeft.x !== 0 || input.axisLeft.y !== 0) {
                dx += input.axisLeft.x;
                dy += input.axisLeft.y;
            }

            if (dx !== 0 || dy !== 0) {
                // Normalize input
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len > 1) { // Only normalize if > 1 to allow analog-like control? Or always normalize?
                    // Always normalize to cap speed
                    dx /= len;
                    dy /= len;
                }

                // Move
                this.move(dx * this.speed * dt, dy * this.speed * dt, level);
            }

            // Aiming Priority: Right Stick -> Left Stick (Move) -> Mouse -> Keyboard (Move)
            const rx = input.axisRight.x;
            const ry = input.axisRight.y;
            const rightStickActive = Math.abs(rx) > 0.1 || Math.abs(ry) > 0.1;
            const leftStickActive = Math.abs(input.axisLeft.x) > 0.1 || Math.abs(input.axisLeft.y) > 0.1;

            if (rightStickActive) {
                const targetRotation = Math.atan2(ry, rx);

                // Smooth rotation
                let current = this.rotation;
                while (current > Math.PI) current -= Math.PI * 2;
                while (current <= -Math.PI) current += Math.PI * 2;

                let diff = targetRotation - current;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff <= -Math.PI) diff += Math.PI * 2;

                const rotStep = this.rotationSpeed * dt;

                if (Math.abs(diff) < rotStep) {
                    this.rotation = targetRotation;
                } else {
                    this.rotation += Math.sign(diff) * rotStep;
                }
            } else if (leftStickActive) {
                // Left Stick Rotation (Face movement direction)
                const targetRotation = Math.atan2(dy, dx);

                // Smooth rotation
                let current = this.rotation;
                while (current > Math.PI) current -= Math.PI * 2;
                while (current <= -Math.PI) current += Math.PI * 2;

                let diff = targetRotation - current;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff <= -Math.PI) diff += Math.PI * 2;

                const rotStep = this.rotationSpeed * dt;

                if (Math.abs(diff) < rotStep) {
                    this.rotation = targetRotation;
                } else {
                    this.rotation += Math.sign(diff) * rotStep;
                }
            } else if (input.activeInputType === 'mouse') {
                // Mouse Aiming (Instant)
                this.rotation = Math.atan2(input.mouseY - this.y, input.mouseX - this.x);
            } else if (dx !== 0 || dy !== 0) {
                // Aim follows movement (Fallback for Keyboard)
                const targetRotation = Math.atan2(dy, dx);
                // Smooth rotation
                let current = this.rotation;
                while (current > Math.PI) current -= Math.PI * 2;
                while (current <= -Math.PI) current += Math.PI * 2;

                let diff = targetRotation - current;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff <= -Math.PI) diff += Math.PI * 2;

                const rotStep = this.rotationSpeed * dt;

                if (Math.abs(diff) < rotStep) {
                    this.rotation = targetRotation;
                } else {
                    this.rotation += Math.sign(diff) * rotStep;
                }
            }


            if (input.isDown('Space') || input.gamepadShoot || input.gamepadShoot) { // Duplicate check harmless
                this.shoot(bullets);
            }
        }
        // AI Control
        else if (level && bullets) {
            this.updateAI(dt, level, bullets, targets);
        }
    }

    updateAI(dt: number, level: Level, bullets: Bullet[], targets?: Tank[]) {
        this.aiTimer -= dt;

        // Targeting Logic (Battle Royale)
        let target: Tank | null = null;
        if (targets) {
            let minDist = 600; // Search radius (Increased)
            for (const t of targets) {
                if (t === this) continue; // Don't target self
                if (t.hp <= 0) continue; // Don't target dead

                const dist = Math.sqrt((t.x - this.x) ** 2 + (t.y - this.y) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    target = t;
                }
            }
        }

        if (this.aiTimer <= 0) {
            // Pick new action
            this.aiTimer = 1 + Math.random() * 2; // 1-3 seconds

            if (target) {
                // Tactical Move if target found
                const rand = Math.random();
                if (rand < 0.6) this.aiAction = 'forward'; // Chase
                else if (rand < 0.8) this.aiAction = 'rotateLeft';
                else this.aiAction = 'rotateRight';
            } else {
                // Random Wander
                const rand = Math.random();
                if (rand < 0.2) this.aiAction = 'idle';
                else if (rand < 0.4) this.aiAction = 'rotateLeft';
                else if (rand < 0.6) this.aiAction = 'rotateRight';
                else if (rand < 0.8) this.aiAction = 'forward';
                else this.aiAction = 'backward';
            }
        }

        // Rotate towards target if exists
        if (target) {
            const targetRotation = Math.atan2(target.y - this.y, target.x - this.x);

            // Smooth rotation logic
            let current = this.rotation;
            while (current > Math.PI) current -= Math.PI * 2;
            while (current <= -Math.PI) current += Math.PI * 2;

            let diff = targetRotation - current;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff <= -Math.PI) diff += Math.PI * 2;

            // Override random rotation
            if (Math.abs(diff) > 0.1) {
                this.rotation += Math.sign(diff) * this.rotationSpeed * dt;
            }
        } else {
            // Manual Rotation
            if (this.aiAction === 'rotateLeft') {
                this.rotation -= this.rotationSpeed * dt;
            } else if (this.aiAction === 'rotateRight') {
                this.rotation += this.rotationSpeed * dt;
            }
        }

        // Execute Move
        if (this.aiAction === 'forward') {
            const dx = Math.cos(this.rotation) * this.speed * dt;
            const dy = Math.sin(this.rotation) * this.speed * dt;
            this.move(dx, dy, level);
        } else if (this.aiAction === 'backward') {
            const dx = Math.cos(this.rotation) * -this.speed * dt;
            const dy = Math.sin(this.rotation) * -this.speed * dt;
            this.move(dx, dy, level);
        }

        // Shooting
        this.aiShootTimer -= dt;
        if (this.aiShootTimer <= 0) {
            // Only shoot if roughly facing target or random chance
            if (target) {
                const targetRotation = Math.atan2(target.y - this.y, target.x - this.x);
                let diff = targetRotation - this.rotation;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff <= -Math.PI) diff += Math.PI * 2;

                if (Math.abs(diff) < 0.5) {
                    this.shoot(bullets);
                    this.aiShootTimer = this.fireRate * (1 + Math.random()); // Fire rate variance
                } else {
                    this.aiShootTimer = 0.2; // Check again soon
                }
            } else {
                this.shoot(bullets);
                this.aiShootTimer = 2 + Math.random() * 3;
            }
        }
    }

    move(dx: number, dy: number, level: Level) {
        this.x += dx;
        if (this.checkCollision(level)) {
            this.x -= dx;
            // If AI hit wall, change action immediately
            if (!this.isPlayer) this.aiTimer = 0;
        }

        this.y += dy;
        if (this.checkCollision(level)) {
            this.y -= dy;
            if (!this.isPlayer) this.aiTimer = 0;
        }
    }

    shoot(bullets: Bullet[]) {
        if (this.shootTimer > 0) return;

        const bx = this.x + Math.cos(this.rotation) * 20;
        const by = this.y + Math.sin(this.rotation) * 20;

        // Determine bullet color
        let bColor = '#f80';
        if (this.isPlayer) bColor = '#ff0';
        else if (this.weaponType === 'shotgun') bColor = '#f80';
        else if (this.bulletDamage > 1) bColor = '#fff';
        else if (this.bulletSpeed > 300) bColor = '#f0f';

        if (this.weaponType === 'shotgun') {
            // 3-Way Spread
            for (let i = -1; i <= 1; i++) {
                const angle = this.rotation + i * 0.2;
                const sbx = this.x + Math.cos(angle) * 20;
                const sby = this.y + Math.sin(angle) * 20;
                const bullet = new Bullet(sbx, sby, angle, this, bColor, this.bulletSpeed, this.bulletDamage);
                bullet.maxBounces = 1 + this.bulletRicochet;
                bullet.homingStrength = this.bulletHoming;
                bullets.push(bullet);
            }
        } else {
            // Normal
            const bullet = new Bullet(bx, by, this.rotation, this, bColor, this.bulletSpeed, this.bulletDamage);
            bullet.maxBounces = 1 + this.bulletRicochet;
            bullet.homingStrength = this.bulletHoming;
            bullets.push(bullet);
        }

        this.shootTimer = this.fireRate;
    }

    checkCollision(level: Level): boolean {
        const r: Rect = {
            x: this.x - this.width / 2,
            y: this.y - this.height / 2,
            w: this.width,
            h: this.height
        };

        for (const wall of level.walls) {
            if (checkAABBCollision(r, wall)) return true;
        }
        return false;
    }

    draw(ctx: CanvasRenderingContext2D): void {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Blinking if invincible
        if (this.invincibleTimer > 0) {
            // Blink roughly 10 times a second
            if (Math.floor(Date.now() / 100) % 2 === 0) {
                ctx.globalAlpha = 0.5;
            }
        }

        ctx.rotate(this.rotation);

        // -- Visuals based on Role --

        // 1. Spoilers (Dasher) - drawn below body
        if (this.role === 'dasher') {
            ctx.fillStyle = '#d0f';
            ctx.fillRect(-this.width / 2 - 8, -this.height / 2, 8, this.height); // Rear wing extended
            ctx.fillStyle = '#90d';
            ctx.fillRect(-this.width / 2 - 4, -this.height / 2 + 5, 4, this.height - 10); // Struts
        }

        // Tracks with Animation
        // Animated using x position or timer? Use global time would be best, but we don't pass it easily.
        // We'll use a simple alternator based on world position to simulate tread movement.
        const treadPhase = Math.floor((this.x + this.y) / 5) % 2 === 0;

        ctx.fillStyle = '#222'; // Track Base
        ctx.fillRect(-this.width / 2 - 4, -this.height / 2 + 2, 8, this.height - 4); // Left Track
        ctx.fillRect(this.width / 2 - 4, -this.height / 2 + 2, 8, this.height - 4);  // Right Track

        // Tread Links
        ctx.fillStyle = treadPhase ? '#444' : '#111';
        for (let i = 0; i < 4; i++) {
            ctx.fillRect(-this.width / 2 - 4, -this.height / 2 + 2 + i * 8 + (treadPhase ? 0 : 4), 8, 4);
            ctx.fillRect(this.width / 2 - 4, -this.height / 2 + 2 + i * 8 + (treadPhase ? 0 : 4), 8, 4);
        }


        // Body Shadow / Glow
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10; // Glow effect

        // Metallic Body Gradient
        const grad = ctx.createLinearGradient(-this.width / 2, -this.height / 2, this.width / 2, this.height / 2);

        // Adjust colors for metallic feel
        // Simple lightening/darkening
        grad.addColorStop(0, this.color);
        grad.addColorStop(0.5, '#fff'); // Shine
        grad.addColorStop(1, this.color);

        ctx.fillStyle = grad;
        if (this.role === 'heavy') ctx.fillStyle = '#600'; // Dark matte red for heavy

        ctx.fillRect(-this.width / 2 + 4, -this.height / 2 + 4, this.width - 8, this.height - 8);
        ctx.shadowBlur = 0; // Reset shadow

        // Armor Plating (Armored)
        if (this.role === 'armored') {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.strokeRect(-this.width / 2 + 2, -this.height / 2 + 2, this.width - 4, this.height - 4);
            // Rivets
            ctx.fillStyle = '#000';
            ctx.fillRect(-12, -12, 4, 4);
            ctx.fillRect(8, -12, 4, 4);
            ctx.fillRect(-12, 8, 4, 4);
            ctx.fillRect(8, 8, 4, 4);
        }

        // -- Turret Types --

        ctx.fillStyle = '#bbb'; // Metallic turret
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;

        if (this.role === 'sniper') {
            // Long Barrel
            ctx.fillRect(0, -3, 45, 6);
            ctx.strokeRect(0, -3, 45, 6);
            // Scope
            ctx.fillStyle = '#000';
            ctx.fillRect(10, -6, 12, 12); // Bigger scope box
            ctx.fillStyle = '#f00'; // Lens
            ctx.beginPath(); ctx.arc(16, 0, 3, 0, Math.PI * 2); ctx.fill();
        } else if (this.role === 'shotgun') {
            // Triple Barrel
            // Center
            ctx.fillStyle = '#888';
            ctx.fillRect(0, -4, 25, 8);
            ctx.strokeRect(0, -4, 25, 8);
            // Sides
            ctx.save();
            ctx.rotate(0.25);
            ctx.fillRect(0, -3, 22, 6);
            ctx.strokeRect(0, -3, 22, 6);
            ctx.restore();
            ctx.save();
            ctx.rotate(-0.25);
            ctx.fillRect(0, -3, 22, 6);
            ctx.strokeRect(0, -3, 22, 6);
            ctx.restore();
        } else if (this.role === 'machinegun') {
            // Gatling
            ctx.fillStyle = '#666';
            ctx.fillRect(0, -8, 28, 16);
            ctx.strokeRect(0, -8, 28, 16);
            // Barrels
            ctx.fillStyle = '#222';
            ctx.fillRect(28, -7, 4, 4);
            ctx.fillRect(28, -2, 4, 4);
            ctx.fillRect(28, 3, 4, 4);
        } else {
            // Standard
            ctx.fillStyle = '#999';
            ctx.fillRect(0, -6, 30, 12);
            ctx.strokeRect(0, -6, 30, 12);
            // Muzzle detail
            ctx.fillStyle = '#222';
            ctx.fillRect(28, -5, 4, 10);
        }

        // Turret Base (Round)
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fillStyle = this.isPlayer ? '#afa' : (this.role === 'heavy' ? '#a55' : '#ccc');
        if (this.role === 'armored') ctx.fillStyle = '#eee';
        ctx.fill();
        ctx.stroke();

        // Hatch
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#444';
        ctx.fill();

        // Damage Smoke / Overlay if hurt
        if (this.hp < this.maxHp) {
            ctx.fillStyle = `rgba(0, 0, 0, ${0.5 * (1 - this.hp / this.maxHp)})`;
            ctx.fillRect(-15, -15, 30, 30);

            // Smoke particles could be here, but simpler to just darken for now
        }

        ctx.restore();
    }
}
