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

    constructor(x: number, y: number, angle: number, owner: Entity, color: string, speed: number = 200, damage: number = 1) {
        super(x, y);
        this.owner = owner;
        this.color = color;
        this.speed = speed;
        this.damage = damage;
        this.velocity = new Vector2(Math.cos(angle), Math.sin(angle)).scale(this.speed);
    }

    update(dt: number, level: Level): void {
        if (!this.active) return;

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
        ctx.beginPath();
        ctx.fillStyle = this.color;
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}
