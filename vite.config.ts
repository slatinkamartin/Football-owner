import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    include: ['engine/**/*.test.ts'],
    // Simulace celých sezón trvají s novinkami déle; výchozích 5 s je na hraně.
    testTimeout: 30000,
  },
});
