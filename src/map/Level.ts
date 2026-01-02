
import type { Rect } from '../utils/MathUtils';

export class Level {
    walls: Rect[] = [];

    constructor(layoutIndex: number = 0) {
        // Defines levels
        // In a real app, maybe load JSON. Here, hardcode arrays.
        this.loadLevel(layoutIndex);
    }

    loadLevel(index: number) {
        this.walls = [];

        // Bounds
        this.walls.push({ x: 0, y: 0, w: 800, h: 20 });
        this.walls.push({ x: 0, y: 580, w: 800, h: 20 });
        this.walls.push({ x: 0, y: 0, w: 20, h: 600 });
        this.walls.push({ x: 780, y: 0, w: 20, h: 600 });

        if (index === 0) {
            // Level 1: Simple Cross
            this.walls.push({ x: 300, y: 200, w: 200, h: 20 });
            this.walls.push({ x: 390, y: 100, w: 20, h: 400 });
        } else if (index === 1) {
            // Level 2: Pillars
            this.walls.push({ x: 200, y: 200, w: 50, h: 50 });
            this.walls.push({ x: 550, y: 200, w: 50, h: 50 });
            this.walls.push({ x: 200, y: 350, w: 50, h: 50 });
            this.walls.push({ x: 550, y: 350, w: 50, h: 50 });
            this.walls.push({ x: 350, y: 275, w: 100, h: 50 });
        } else {
            // Level 3+: Random Mix
            this.walls.push({ x: 150 + Math.random() * 500, y: 150 + Math.random() * 300, w: 100, h: 20 });
            this.walls.push({ x: 150 + Math.random() * 500, y: 150 + Math.random() * 300, w: 20, h: 100 });
        }
    }

    draw(ctx: CanvasRenderingContext2D) {
        // Grid
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= 800; x += 40) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, 600);
        }
        for (let y = 0; y <= 600; y += 40) {
            ctx.moveTo(0, y);
            ctx.lineTo(800, y);
        }
        ctx.stroke();

        // Walls
        ctx.fillStyle = '#888';

        // Shadow offset
        const shadowOffset = 5;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        for (const wall of this.walls) {
            ctx.fillRect(wall.x + shadowOffset, wall.y + shadowOffset, wall.w, wall.h);
        }

        // Actual Walls
        for (const wall of this.walls) {
            // Top face
            ctx.fillStyle = '#bbb';
            ctx.fillRect(wall.x, wall.y, wall.w, wall.h);

            // Side (Fake 3D) - simple border for now
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 2;
            ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);

            // Inner detail
            ctx.fillStyle = '#999';
            ctx.fillRect(wall.x + 5, wall.y + 5, wall.w - 10, wall.h - 10);
        }
    }
}
