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
    width: number = 22;
    height: number = 22;

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

    role: 'standard' | 'sniper' | 'machinegun' | 'shotgun' | 'dasher' | 'armored' | 'heavy' | 'boss' | 'normal' = 'standard';

    // Upgrade Stats
    bulletRicochet: number = 0;
    bulletHoming: number = 0; // Strength
    bulletPenetrate: number = 0; // NEW: Penetration Power
    vampire: boolean = false;
    drain: number = 0; // % of damage dealt returned as HP

    // Battle Royale Gems
    gemCount: number = 0;

    weaponLevel: number = 1;

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
        role: 'standard' | 'sniper' | 'machinegun' | 'shotgun' | 'dasher' | 'armored' | 'heavy' | 'boss' | 'normal' = 'standard'
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
            // Nerf Enemy Fire Rate if using default
            if (fireRate === 0.5) {
                this.fireRate = 3.0; // Much slower default (was 1.5)
            }
            // Delay first shot
            this.aiShootTimer = 1 + Math.random() * 2;
        }
    }

    takeDamage(amount: number): boolean {
        if (this.invincibleTimer > 0) return false;
        this.hp -= amount;
        return this.hp <= 0;
    }

    collectGem(amount: number = 1) {
        this.gemCount += amount;

        // Stat Boosts per Gem
        this.maxHp += 10 * amount;
        this.hp = Math.min(this.hp + 20 * amount, this.maxHp); // Heal
        this.bulletDamage += 2 * amount;
        this.speed *= (1 + 0.01 * amount); // 1% speed up

        // Visual feedback handled by caller or Game
    }

    // AI State
    invincibleTimer: number = 0; // Invincibility logic
    aiTimer: number = 0;
    aiAction: 'idle' | 'moveBase' | 'rotateLeft' | 'rotateRight' | 'forward' | 'backward' = 'idle';
    aiShootTimer: number = 0;

    update(dt: number, input?: Input | null, level?: Level, bullets?: Bullet[], targets?: Tank[], obstacles?: Tank[], drops?: any[]) {
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
                this.move(dx * this.speed * dt, dy * this.speed * dt, level, obstacles);
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
            this.updateAI(dt, level, bullets, targets, obstacles, drops);
        }
    }

    updateAI(dt: number, level: Level, bullets: Bullet[], targets?: Tank[], obstacles?: Tank[], drops?: any[]) {
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

        // Gem Hunting Logic (High Priority)
        let gemTarget: any = null;
        if (drops && drops.length > 0) {
            let minGemDist = 200; // Look for gems within range
            for (const d of drops) {
                if (!d.active) continue;
                // Ignore XP gems (Survival Mode) - Only collect Power Gems (BR)
                if ((d as any).type === 'xp') continue;

                const dist = Math.sqrt((d.x - this.x) ** 2 + (d.y - this.y) ** 2);
                if (dist < minGemDist) {
                    minGemDist = dist;
                    gemTarget = d;
                }
            }
        }

        if (this.aiTimer <= 0) {
            // Pick new action
            this.aiTimer = 0.5 + Math.random() * 1.5; // Faster reactions (0.5-2.0s)

            if (gemTarget) {
                // Move towards Gem
                // Tank AI moves by 'forward' and 'rotate'.
                // Tank AI moves by 'forward' and 'rotate'.
                // We need to rotate towards it.
                // We'll set rotation target and move forward.
                // But aiAction only sets "forward", rotation is handled separately below.
                // So here we should set target to gem for rotation logic?
                // Let's override 'target' variable? No, keep enemy target for shooting.
                // We'll just force move forward and rely on rotation logic below.
                this.aiAction = 'forward';
            } else if (target) {
                // Distance Check
                const dist = Math.sqrt((target.x - this.x) ** 2 + (target.y - this.y) ** 2);
                let safeDist = 250; // Default keep away distance
                if (this.role === 'sniper') safeDist = 450;
                if (this.role === 'shotgun') safeDist = 150;
                if (this.role === 'dasher') safeDist = 0; // Rush

                // Aggressive override: If idle, just chase
                // We want them to actively hunt.

                const rand = Math.random();

                if (dist < safeDist) {
                    // Too close: Retreat
                    if (rand < 0.6) this.aiAction = 'backward';
                    else if (rand < 0.8) this.aiAction = 'rotateLeft';
                    else this.aiAction = 'rotateRight';
                } else if (dist > safeDist * 1.5) {
                    // Too far: Chase (Primary behavior)
                    if (rand < 0.8) this.aiAction = 'forward'; // Higher chance to move forward
                    else if (rand < 0.9) this.aiAction = 'rotateLeft';
                    else this.aiAction = 'rotateRight';
                } else {
                    // Optimal Range: Strafe / Maintain
                    if (rand < 0.3) this.aiAction = 'forward';
                    else if (rand < 0.6) this.aiAction = 'backward';
                    else if (rand < 0.8) this.aiAction = 'rotateLeft';
                    else this.aiAction = 'rotateRight';
                }
            } else {
                // No target? Wander?
                // In generic AI, if no target, finding one should be priority.
                // But updateAI sets targets.
                // If we are here, we have a target (checked above) or we are wandering.
                // If target is null, we can do random.
                const rand = Math.random();
                if (rand < 0.2) this.aiAction = 'idle';
                else if (rand < 0.4) this.aiAction = 'rotateLeft';
                else if (rand < 0.6) this.aiAction = 'rotateRight';
                else if (rand < 0.8) this.aiAction = 'forward';
                else this.aiAction = 'backward';
            }
        }

        // Rotate towards target (or GEM) if exists
        let rotateTarget = target;
        if (gemTarget) rotateTarget = gemTarget; // Prioritize looking at Gem to move to it? 
        // Actually, if we look at Gem, we might shoot at Gem. 
        // Better to rotate towards Gem for movement, but shoot at enemy?
        // Tank moves in direction of rotation. So we MUST face Gem to move to it.
        // So yes, rotateTarget = gemTarget.

        if (rotateTarget) {
            const targetRotation = Math.atan2(rotateTarget.y - this.y, rotateTarget.x - this.x);

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
            this.move(dx, dy, level, obstacles);
        } else if (this.aiAction === 'backward') {
            const dx = Math.cos(this.rotation) * -this.speed * dt;
            const dy = Math.sin(this.rotation) * -this.speed * dt;
            this.move(dx, dy, level, obstacles);
        }

        // Shooting
        this.aiShootTimer -= dt;
        if (this.aiShootTimer <= 0) {
            // Only shoot if facing target
            if (target) {
                // Predictive Aiming
                // Estimate target velocity (simple difference since last frame? No, we don't have prev pos handy easily without adding state).
                // Or just assume they are moving?
                // Flanking logic handled by movement.
                // A wrapper for aim:

                // Let's assume target is moving 50% of time and add a lead offset?
                // Better: Just use current pos for now but with TIGHTER accuracy.
                // User said "smarter".
                // Smart AI = Lead shots.
                // If I can't look up velocity, I can cheat and peek input? No.
                // I'll stick to tighter accuracy first.

                const targetRotation = Math.atan2(target.y - this.y, target.x - this.x);
                let diff = targetRotation - this.rotation;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff <= -Math.PI) diff += Math.PI * 2;

                // Shoots only if aim is accurate (Strict ~23 degrees)
                if (Math.abs(diff) < 0.3) {
                    // Small Accuracy Error (Reduces with tier? No access to tier here easily)
                    // Reduced default error from 0.35 to 0.15 (Much sharper)
                    const error = (Math.random() - 0.5) * 0.15;
                    this.rotation += error;

                    this.shoot(bullets);

                    this.rotation -= error; // Reset rotation so they don't jitter visibly

                    this.aiShootTimer = this.fireRate * (0.8 + Math.random() * 0.4); // Less variance, faster checks
                } else {
                    this.aiShootTimer = 0.1; // Check again soon
                }
            } else {
                // ceased random firing
                // this.shoot(bullets);
                // this.aiShootTimer = 2 + Math.random() * 3;
            }
        }
    }

    move(dx: number, dy: number, level: Level, obstacles?: Tank[]) {
        this.x += dx;

        let collision = this.checkCollision(level);
        if (!collision && obstacles) collision = this.checkTankCollisions(obstacles);

        if (collision) {
            this.x -= dx;
            // If AI hit wall, change action immediately
            if (!this.isPlayer) this.aiTimer = 0;
        }

        this.y += dy;
        collision = this.checkCollision(level);
        if (!collision && obstacles) collision = this.checkTankCollisions(obstacles);

        if (collision) {
            this.y -= dy;
            if (!this.isPlayer) this.aiTimer = 0;
        }
    }

    checkTankCollisions(obstacles: Tank[]): boolean {
        // Simple Circle Collision
        const rSelf = this.width / 2; // Approx radius
        for (const other of obstacles) {
            if (other === this) continue;
            if (other.hp <= 0) continue; // Ignore dead tanks

            const distSq = (this.x - other.x) ** 2 + (this.y - other.y) ** 2;
            const minDist = rSelf + other.width / 2;

            if (distSq < minDist * minDist) return true;
        }
        return false;
    }

    // Modifiers
    shotSpread: number = 0; // 0 = 1 bullet, 1 = 3 bullets, etc.

    shoot(bullets: Bullet[]) {
        if (this.shootTimer > 0) return;

        // Bullet Color
        let bColor = '#f80'; // Default Enemy

        if (this.isPlayer) {
            bColor = '#0f0'; // Player Always Green
        } else {
            // Enemy Role Colors
            if (this.role === 'sniper') bColor = '#fff';
            if (this.role === 'heavy') bColor = '#f0f';
            if (this.shotSpread > 0 || this.role === 'shotgun') bColor = '#fc0';
        }

        const count = this.shotSpread; // 0 -> 1 bullet, 1 -> 3 bullets

        // Spread Angle Calculation
        // If count is high, increase max spread?
        // Fixed spread per bullet index
        const spreadStep = 0.15;

        for (let i = -count; i <= count; i++) {
            const angle = this.rotation + i * spreadStep;

            // Offset spawn point
            const bx = this.x + Math.cos(angle) * 20;
            const by = this.y + Math.sin(angle) * 20;

            const bullet = new Bullet(bx, by, angle, this, bColor, this.bulletSpeed, this.bulletDamage, this.bulletPenetrate);
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
        if (this.role === 'boss') {
            // Boss Styling: Dark Steel with Red Pulses
            ctx.fillStyle = '#111';
            // Glowing Core
            ctx.save();
            ctx.fillStyle = '#f00';
            ctx.shadowColor = '#f00';
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(0, 0, this.width / 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

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

        // HP Gauge (Enemy Only)
        if (!this.isPlayer && this.hp > 0) {
            const barW = 40;
            const barH = 5;
            const yOff = -this.height / 2 - 12;

            // Background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(this.x - barW / 2, this.y + yOff, barW, barH);

            // Fill
            const ratio = Math.max(0, this.hp / this.maxHp);
            ctx.fillStyle = ratio > 0.5 ? '#0f0' : (ratio > 0.2 ? '#ff0' : '#f00');
            ctx.fillRect(this.x - barW / 2, this.y + yOff, barW * ratio, barH);

            // Border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(this.x - barW / 2, this.y + yOff, barW, barH);

            // Gem Count Display (Enemy)
            if (this.gemCount > 0) {
                ctx.fillStyle = '#0ff';
                ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'right';
                // Draw diamond shape? Or just text. Text is clearer.
                ctx.fillText(`♦${this.gemCount}`, this.x + barW / 2 + 20, this.y + yOff + 6);
            }
        }
    }
}
