export type ParticleType = 'spark' | 'shockwave' | 'smoke' | 'fire' | 'debris' | 'text';

import { Entity } from './Entity';
import { Vector2 } from '../utils/MathUtils';

export class Particle extends Entity {
    velocity: Vector2;
    life: number = 1.0;
    maxLife: number = 1.0;
    color: string;
    size: number;
    type: ParticleType;
    rotation: number = 0;
    rotSpeed: number = 0;
    text: string = '';

    constructor(x: number, y: number, color: string, speed: number, type: ParticleType = 'spark', text: string = '') {
        super(x, y);
        this.color = color;
        this.type = type;
        this.text = text;

        if (type === 'shockwave') {
            this.size = 5;
            this.velocity = new Vector2(0, 0); // No movement, just expands
            this.maxLife = 0.5;
        } else if (type === 'smoke') {
            this.size = 10 + Math.random() * 10;
            const angle = Math.random() * Math.PI * 2;
            this.velocity = new Vector2(Math.cos(angle), Math.sin(angle)).scale(speed * 0.3);
            this.maxLife = 1.0;
        } else if (type === 'fire') {
            this.size = 12 + Math.random() * 10; // Bigger!
            const angle = Math.random() * Math.PI * 2;
            this.velocity = new Vector2(Math.cos(angle), Math.sin(angle)).scale(speed * 0.5);
            this.maxLife = 0.6 + Math.random() * 0.4; // Longer!
        } else if (type === 'debris') {
            this.size = 3 + Math.random() * 4;
            const angle = Math.random() * Math.PI * 2;
            this.velocity = new Vector2(Math.cos(angle), Math.sin(angle)).scale(speed * (0.8 + Math.random()));
            this.maxLife = 0.8 + Math.random() * 0.5;
            this.rotSpeed = (Math.random() - 0.5) * 10;
        } else if (type === 'text') {
            this.size = 20;
            this.velocity = new Vector2(0, -50); // Float Up
            this.maxLife = 1.0;
        } else {
            // Spark
            this.size = 2 + Math.random() * 3;
            const angle = Math.random() * Math.PI * 2;
            this.velocity = new Vector2(Math.cos(angle), Math.sin(angle)).scale(speed * (0.5 + Math.random()));
            this.maxLife = 0.3 + Math.random() * 0.4;
        }
        this.life = this.maxLife;
    }

    update(dt: number): void {
        this.life -= dt;
        this.x += this.velocity.x * dt;
        this.y += this.velocity.y * dt;

        if (this.type === 'shockwave') {
            this.size += 150 * dt; // Expand
            this.life -= dt * 2; // Fade fast
        } else if (this.type === 'debris') {
            this.rotation += this.rotSpeed * dt;
            this.velocity.scale(0.95); // Friction
        } else if (this.type === 'fire') {
            this.size -= 10 * dt; // Shrink
            this.y -= 10 * dt; // Rise slightly
        }
    }

    draw(ctx: CanvasRenderingContext2D): void {
        const alpha = Math.max(0, this.life / this.maxLife);
        ctx.globalAlpha = alpha;

        if (this.type === 'shockwave') {
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.stroke();
        } else if (this.type === 'smoke') {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'fire') {
            ctx.fillStyle = `rgba(255, ${Math.floor(Math.random() * 200)}, 0, ${alpha})`; // Flickering orange/yellow
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'debris') {
            ctx.fillStyle = this.color;
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
            ctx.restore();
        } else if (this.type === 'text') {
            ctx.fillStyle = this.color;
            ctx.font = `bold ${this.size}px Arial`;
            ctx.textAlign = 'center';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 3;
            ctx.strokeText(this.text, this.x, this.y);
            ctx.fillText(this.text, this.x, this.y);
        } else {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.rect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;
    }
}
