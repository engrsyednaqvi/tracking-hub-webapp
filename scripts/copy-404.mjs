import { copyFileSync } from 'node:fs';

// GitHub Pages SPA fallback: unknown routes serve index.html
copyFileSync('dist/index.html', 'dist/404.html');
