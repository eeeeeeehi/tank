export class Input {
    keys: { [key: string]: boolean } = {};
    mouseX: number = 0;
    mouseY: number = 0;
    mouseDown: boolean = false;
    mouseMoved: boolean = false;

    // Gamepad State
    axisLeft = { x: 0, y: 0 };
    axisRight = { x: 0, y: 0 };
    gamepadShoot: boolean = false;

    // Input Source Tracking
    activeInputType: 'mouse' | 'gamepad' = 'mouse';

    constructor(element?: HTMLElement) {
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            // Optionally set to mouse/keyboard mode?
            // Usually keyboard implies mouse aim, so we can leave it or set 'mouse'
            // For now, let's leave it. If user touches mouse, it switches.
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        if (element) {
            element.addEventListener('mousemove', (e) => {
                const rect = element.getBoundingClientRect();
                this.mouseX = e.clientX - rect.left;
                this.mouseY = e.clientY - rect.top;
                this.mouseMoved = true;
                this.activeInputType = 'mouse';
            });

            element.addEventListener('mousedown', () => {
                this.mouseDown = true;
                this.mouseMoved = true;
                this.activeInputType = 'mouse';
            });

            element.addEventListener('mouseup', () => {
                this.mouseDown = false;
            });

            element.addEventListener('contextmenu', (e) => {
                e.preventDefault();
            });
        }
    }

    isDown(code: string): boolean {
        return !!this.keys[code];
    }

    update() {
        const gamepads = navigator.getGamepads();
        // Use the first connected gamepad
        for (const gp of gamepads) {
            if (gp) {
                const dz = 0.15; // Deadzone

                // Left Stick (Movement)
                const lx = Math.abs(gp.axes[0]) > dz ? gp.axes[0] : 0;
                const ly = Math.abs(gp.axes[1]) > dz ? gp.axes[1] : 0;
                this.axisLeft.x = lx;
                this.axisLeft.y = ly;

                // Right Stick (Aiming)
                const rx = Math.abs(gp.axes[2]) > dz ? gp.axes[2] : 0;
                const ry = Math.abs(gp.axes[3]) > dz ? gp.axes[3] : 0;
                this.axisRight.x = rx;
                this.axisRight.y = ry;

                // Buttons
                const rt = gp.buttons[7];
                const isRtPressed = rt ? (typeof rt === 'object' ? rt.pressed : rt > 0.5) : false;

                // Check Button Activity
                const anyButton = gp.buttons.some(b => b.pressed);
                // Check Stick Activity
                const stickActive = lx !== 0 || ly !== 0 || rx !== 0 || ry !== 0;

                if (anyButton || stickActive) {
                    this.activeInputType = 'gamepad';
                }

                this.gamepadShoot = gp.buttons[0].pressed || gp.buttons[1].pressed || gp.buttons[2].pressed || gp.buttons[3].pressed || gp.buttons[5].pressed || isRtPressed;
                break; // Only use first one
            }
        }
    }
}
