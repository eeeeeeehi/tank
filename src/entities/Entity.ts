export abstract class Entity {
    public x: number;

    public y: number;
    public active: boolean = true;


    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    abstract update(dt: number, ...args: any[]): void;
    abstract draw(ctx: CanvasRenderingContext2D): void;
}
