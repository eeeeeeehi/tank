import { Entity } from './Entity';
import { Vector2, checkCircleRectCollision } from '../utils/MathUtils';
import { Level } from '../map/Level';

export class Bullet extends Entity {
    velocity: Vector2;
    radius: number = 3;
    bounces: number = 0;
    maxBounces: number = 1;
    active: boolean = true;
    speed: number;
    owner: Entity;
    color: string;
    damage: number;

    // Trail
    trail: { x: number, y: number }[] = [];
    maxTrailLength: number = 5;

    homingStrength: number = 0;

    constructor(x: number, y: number, angle: number, owner: Entity, color: string, speed: number = 200, damage: number = 1) {
        super(x, y);
        this.owner = owner;
        this.color = color;
        this.speed = speed;
        this.damage = damage;
        this.velocity = new Vector2(Math.cos(angle), Math.sin(angle)).scale(this.speed);
    }

    update(dt: number, level: Level, targets?: Entity[]): void {
        if (!this.active) return;

        // Homing Logic
        if (this.homingStrength > 0 && targets && targets.length > 0) {
            let closest: Entity | null = null;
            let minDstSq = Infinity;

            for (const t of targets) {
                if (t === this.owner || !t.active) continue; // Skip owner and dead/inactive
                const dx = t.x - this.x;
                const dy = t.y - this.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < minDstSq) {
                    minDstSq = d2;
                    closest = t;
                }
            }

            if (closest) {
                // Steer towards target
                const desired = new Vector2(closest.x - this.x, closest.y - this.y).normalize();
                const current = this.velocity.normalize();
                // Interpolate
                const steerFactor = this.homingStrength * dt * 5; // Tuning
                const newDir = current.add(desired.scale(steerFactor)).normalize();
                this.velocity = newDir.scale(this.speed);
            }
        }

        // Add to trail in front of movement to look connected or behind? Behind.
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > this.maxTrailLength) {
            this.trail.shift();
        }

        this.x += this.velocity.x * dt;
        this.y += this.velocity.y * dt;

        for (const wall of level.walls) {
            if (checkCircleRectCollision({ x: this.x, y: this.y, r: this.radius }, wall)) {
                this.reflect(wall);
                break;
            }
        }
    }

    reflect(wall: any) {
        if (this.bounces >= this.maxBounces) {
            this.active = false;
            return;
        }

        this.bounces++;

        const closestX = Math.max(wall.x, Math.min(this.x, wall.x + wall.w));
        const closestY = Math.max(wall.y, Math.min(this.y, wall.y + wall.h));

        const diffX = this.x - closestX;
        const diffY = this.y - closestY;

        let normal = new Vector2(diffX, diffY).normalize();

        if (diffX === 0 && diffY === 0) {
            this.velocity.x *= -1;
            this.velocity.y *= -1;
        } else {
            const dot = this.velocity.dot(normal);
            this.velocity = this.velocity.sub(normal.scale(2 * dot));
        }

        this.x = closestX + normal.x * (this.radius + 1);
        this.y = closestY + normal.y * (this.radius + 1);
    }

    draw(ctx: CanvasRenderingContext2D): void {
        if (!this.active) return;

        // Draw Trail
        if (this.trail.length > 1) {
            ctx.beginPath();
            ctx.moveTo(this.trail[0].x, this.trail[0].y);
            for (let i = 1; i < this.trail.length; i++) {
                ctx.lineTo(this.trail[i].x, this.trail[i].y);
            }
            ctx.lineTo(this.x, this.y); // Connect to current head
            ctx.strokeStyle = this.color;
            ctx.lineWidth = this.radius;
            ctx.globalAlpha = 0.5; // Transparent trail
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }

        ctx.beginPath();
        ctx.fillStyle = this.color;
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}
