import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['**/*.test.ts'],
        // '.claude/worktrees' holds throwaway git worktrees with duplicate test
        // copies — exclude so they don't double-count or mask a regression.
        exclude: ['node_modules', '.next', '**/.claude/**'],
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './'),
        },
    },
});
