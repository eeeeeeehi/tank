export class SoundManager {
    ctx: AudioContext;

    constructor() {
        // Init on first interaction usually, but here we construct it.
        // We'll resume it on user interaction if needed.
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    playShoot() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.1);

        osc.type = 'square';

        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    playExplosion() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.frequency.setValueAtTime(100, t);
        osc.frequency.exponentialRampToValueAtTime(1, t + 0.3);
        osc.type = 'sawtooth'; // Noisy-ish

        // modulation for noise
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 50;
        lfo.type = 'sawtooth';
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 500;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start();
        lfo.stop(t + 0.3);

        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(t + 0.3);
    }
}
