import './style.css'
import { Game } from './Game'

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

// Set canvas size (e.g., 800x600 or window size)
canvas.width = 800;
canvas.height = 600;

const game = new Game(canvas);
game.start();
