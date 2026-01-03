import { Entity } from './Entity';

export class WeaponDrop extends Entity {
    role: 'normal' | 'standard' | 'sniper' | 'machinegun' | 'shotgun' | 'dasher' | 'armored' | 'heavy';
    life: number = 15; // Seconds to live
    active: boolean = true;
    floatOffset: number = 0;

    // Entity overrides
    width: number = 24;
    height: number = 24;

    constructor(x: number, y: number, role: any) {
        super(x, y);
        this.role = role;
        this.width = 24;
        this.height = 24;
    }

    update(dt: number) {
        this.life -= dt;
        if (this.life <= 0) this.active = false;
        this.floatOffset += dt * 5;
    }

    draw(ctx: CanvasRenderingContext2D) {
        if (!this.active) return;

        ctx.save();
        ctx.translate(this.x, this.y + Math.sin(this.floatOffset) * 3);

        // Glow
        ctx.shadowColor = '#ff0';
        ctx.shadowBlur = 10;

        // Box
        ctx.fillStyle = '#444';
        ctx.strokeStyle = '#ff0';
        ctx.lineWidth = 2;
        ctx.fillRect(-12, -12, 24, 24);
        ctx.strokeRect(-12, -12, 24, 24);

        // Icon inside
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 16px Arial';

        let label = '?';
        switch (this.role) {
            case 'sniper': label = 'S'; break;
            case 'shotgun': label = '3'; break; // 3-way
            case 'machinegun': label = 'M'; break;
            case 'dasher': label = 'D'; break;
            case 'armored': label = 'A'; break;
            case 'heavy': label = 'H'; break;
            case 'normal':
            case 'standard': label = 'N'; break;
        }
        ctx.fillText(label, 0, 1);

        ctx.restore();
    }
}
