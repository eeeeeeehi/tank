import { Entity } from './Entity';

export class Gem extends Entity {
    life: number = 30; // Seconds to live (longer than weapon drops)
    active: boolean = true;
    floatOffset: number = 0;
    value: number = 1;
    type: 'gem' | 'xp' = 'gem'; // New Type

    // Entity overrides
    width: number = 20;
    height: number = 20;

    constructor(x: number, y: number, value: number = 1, type: 'gem' | 'xp' = 'gem') {
        super(x, y);
        this.value = value;
        this.type = type;
        this.width = 20;
        this.height = 20;
    }

    update(dt: number) {
        this.life -= dt;
        if (this.life <= 0) this.active = false;
        this.floatOffset += dt * 3;
    }

    draw(ctx: CanvasRenderingContext2D) {
        if (!this.active) return;

        ctx.save();
        ctx.translate(this.x, this.y + Math.sin(this.floatOffset) * 3);

        const isXp = this.type === 'xp';
        const color = isXp ? '#ff0' : '#0ff'; // Yellow for XP

        // Glow
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;

        // Gem Shape (Rhombus)
        ctx.fillStyle = color;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(10, 0);
        ctx.lineTo(0, 10);
        ctx.lineTo(-10, 0);
        ctx.closePath();

        ctx.fill();
        ctx.stroke();

        // Shine
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(5, -5);
        ctx.lineTo(0, 0);
        ctx.lineTo(-5, -5);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }
}
