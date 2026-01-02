import { Entity } from './Entity';
import { Bullet } from './Bullet';
import { Input } from '../Input';
import { Level } from '../map/Level';
import type { Rect } from '../utils/MathUtils';
import { checkAABBCollision } from '../utils/MathUtils';

export class Tank extends Entity {
    rotation: number = 0;
    speed: number = 100;
    rotationSpeed: number = 3;
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
        this.hp -= amount;
        return this.hp <= 0;
    }

    // AI State
    aiTimer: number = 0;
    aiAction: 'idle' | 'moveBase' | 'rotateLeft' | 'rotateRight' | 'forward' | 'backward' = 'idle';
    aiShootTimer: number = 0;

    update(dt: number, input?: Input | null, level?: Level, bullets?: Bullet[]) {
        if (this.shootTimer > 0) {
            this.shootTimer -= dt;
        }

        // Handle optional args for Entity compatibility
        if (!input && !this.isPlayer) {
            // allow AI to run without input
        }

        // Player Control
        if (this.isPlayer && input && level && bullets) {
            let dx = 0;
            let dy = 0;

            if (input.isDown('ArrowLeft')) dx -= 1;
            if (input.isDown('ArrowRight')) dx += 1;
            if (input.isDown('ArrowUp')) dy -= 1;
            if (input.isDown('ArrowDown')) dy += 1;

            if (dx !== 0 || dy !== 0) {
                // Normalize input
                const len = Math.sqrt(dx * dx + dy * dy);
                dx /= len;
                dy /= len;

                // Move
                this.move(dx * this.speed * dt, dy * this.speed * dt, level);

                // Rotate towards movement direction
                const targetRotation = Math.atan2(dy, dx);

                // Smooth rotation
                // Normalize current rotation to -PI to PI
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

            if (input.isDown('Space')) {
                this.shoot(bullets);
            }
        }
        // AI Control
        else if (level && bullets) {
            this.updateAI(dt, level, bullets);
        }
    }

    updateAI(dt: number, level: Level, bullets: Bullet[]) {
        this.aiTimer -= dt;
        if (this.aiTimer <= 0) {
            // Pick new action
            this.aiTimer = 1 + Math.random() * 2; // 1-3 seconds
            const rand = Math.random();
            if (rand < 0.2) this.aiAction = 'idle';
            else if (rand < 0.4) this.aiAction = 'rotateLeft';
            else if (rand < 0.6) this.aiAction = 'rotateRight';
            else if (rand < 0.8) this.aiAction = 'forward';
            else this.aiAction = 'backward';
        }

        // Execute Move/Rotate
        if (this.aiAction === 'rotateLeft') {
            this.rotation -= this.rotationSpeed * dt;
        } else if (this.aiAction === 'rotateRight') {
            this.rotation += this.rotationSpeed * dt;
        } else if (this.aiAction === 'forward') {
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
            this.shoot(bullets);
            this.aiShootTimer = 2 + Math.random() * 3; // 2-5 seconds
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
                bullets.push(bullet);
            }
        } else {
            // Normal
            const bullet = new Bullet(bx, by, this.rotation, this, bColor, this.bulletSpeed, this.bulletDamage);
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
        ctx.rotate(this.rotation);

        // -- Visuals based on Role --

        // 1. Spoilers (Dasher) - drawn below body
        if (this.role === 'dasher') {
            ctx.fillStyle = '#a0f'; // Match body
            ctx.fillRect(-this.width / 2 - 5, -this.height / 2, 5, this.height); // Rear wing
            ctx.fillStyle = '#508';
            ctx.fillRect(-this.width / 2 - 2, -this.height / 2 + 5, 2, this.height - 10); // Struts
        }

        // Tracks
        ctx.fillStyle = '#333';
        ctx.fillRect(-this.width / 2 - 2, -this.height / 2 + 2, 8, this.height - 4); // Left Track
        ctx.fillRect(this.width / 2 - 6, -this.height / 2 + 2, 8, this.height - 4);  // Right Track

        // Body Shadow
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 5;

        // Body
        ctx.fillStyle = this.color;
        if (this.role === 'heavy') ctx.fillStyle = '#800'; // Enforce dark red

        ctx.fillRect(-this.width / 2 + 4, -this.height / 2 + 4, this.width - 8, this.height - 8);
        ctx.shadowBlur = 0; // Reset shadow

        // Armor Plating (Armored)
        if (this.role === 'armored') {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(-this.width / 2 + 2, -this.height / 2 + 2, this.width - 4, this.height - 4);
            // Rivets
            ctx.fillStyle = '#555';
            ctx.fillRect(-10, -10, 2, 2);
            ctx.fillRect(10, -10, 2, 2);
            ctx.fillRect(-10, 10, 2, 2);
            ctx.fillRect(10, 10, 2, 2);
        }

        // -- Turret Types --

        ctx.fillStyle = '#ccc';
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;

        if (this.role === 'sniper') {
            // Long Barrel
            ctx.fillRect(0, -3, 45, 6);
            ctx.strokeRect(0, -3, 45, 6);
            // Scope
            ctx.fillStyle = '#000';
            ctx.fillRect(10, -6, 10, 3);
        } else if (this.role === 'shotgun') {
            // Triple Barrel
            // Center
            ctx.fillStyle = '#ccc';
            ctx.fillRect(0, -4, 25, 8);
            ctx.strokeRect(0, -4, 25, 8);
            // Sides
            ctx.save();
            ctx.rotate(0.2);
            ctx.fillRect(0, -3, 22, 6);
            ctx.strokeRect(0, -3, 22, 6);
            ctx.restore();
            ctx.save();
            ctx.rotate(-0.2);
            ctx.fillRect(0, -3, 22, 6);
            ctx.strokeRect(0, -3, 22, 6);
            ctx.restore();
        } else if (this.role === 'machinegun') {
            // Gatling / Thick Barrel
            ctx.fillStyle = '#888';
            ctx.fillRect(0, -8, 26, 16);
            ctx.strokeRect(0, -8, 26, 16);
            // Multiple holes hint
            ctx.fillStyle = '#000';
            ctx.fillRect(26, -6, 2, 4);
            ctx.fillRect(26, 2, 2, 4);
        } else {
            // Standard
            ctx.fillStyle = '#ccc';
            ctx.fillRect(0, -6, 28, 12);
            ctx.strokeRect(0, -6, 28, 12);
        }

        // Turret Base (Round)
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fillStyle = this.isPlayer ? '#6d6' : this.role === 'heavy' ? '#a44' : '#e66';
        if (this.role === 'armored') ctx.fillStyle = '#999';
        ctx.fill();
        ctx.stroke();

        // Hatch
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#333';
        ctx.fill();

        // Damage Smoke / Overlay if hurt
        if (this.hp < this.maxHp) {
            ctx.fillStyle = `rgba(0, 0, 0, ${0.5 * (1 - this.hp / this.maxHp)})`;
            ctx.fillRect(-15, -15, 30, 30);
        }

        ctx.restore();
    }
}
