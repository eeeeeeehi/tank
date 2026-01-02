
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

        if (index === -1) {
            // Battle Royale: OPEN ARENA
            // Just the bounds, no obstacles. Max space for 10 tanks.
            return;
        }

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
        // Walls - Pseudo 3D Neon Style
        const depth = 10;

        for (const wall of this.walls) {
            // Draw Side (Darker height simulation)
            ctx.fillStyle = '#111'; // Dark side
            ctx.fillRect(wall.x, wall.y + wall.h, wall.w, depth); // Bottom face simulation?
            // Actually, top-down 3D usually shows the side facing the camera (bottom side)
            // Let's just do a simple block extrusion downwards
            ctx.fillStyle = '#080808';
            ctx.fillRect(wall.x, wall.y + depth, wall.w, wall.h);

            // Draw Main Top Face
            ctx.fillStyle = '#222'; // Dark body
            ctx.fillRect(wall.x, wall.y, wall.w, wall.h);

            // Neon Glow Border
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#0ff'; // Cyan Glow
            ctx.strokeStyle = '#0ff';
            ctx.lineWidth = 2;
            ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);
        }
        ctx.shadowBlur = 0; // Reset global shadow
    }
}
