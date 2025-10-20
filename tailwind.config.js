/**
 * tailwind.config.js
 *
 * BATCH 8 MODIFICATION:
 * - Removed hard-coded 'primary' color.
 * - Extended the 'colors' object to use CSS variables
 * from /renderer/styles/theme.css (Spec 7.2).
 * - This enables classes like 'bg-primary', 'bg-panel', 'text-error'.
 * - Added 'JetBrains Mono' to the 'mono' font stack (Spec 7.3).
 * - Updated 'content' to scan all dashboard components.
 */

export default {
  darkMode: "class", // Uses 'class' (e.g., <html class="dark">)
  content: [
    "./renderer/index.html",
    "./renderer/main.tsx",
    "./renderer/dashboard/**/*.{js,ts,jsx,tsx}",
    "./renderer/context/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // [NEW] Map theme colors to the CSS variables
      colors: {
        primary: 'var(--tw-color-primary)',
        accent: 'var(--tw-color-accent)',
        bg: 'var(--tw-color-bg)',
        panel: 'var(--tw-color-panel)',
        // A secondary panel, slightly darker/lighter
        'panel-secondary': 'var(--tw-color-bg)', 
        border: 'var(--tw-color-border)',
        'text-main': 'var(--tw-color-text-main)',
        'text-muted': 'var(--tw-color-text-muted)',
        error: 'var(--tw-color-error)',
        success: 'var(--tw-color-success)',
        warning: 'var(--tw-color-warning)',
      },
      fontFamily: {
        // [CHANGED] Use Inter and JetBrains Mono per Spec 7.3
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: [
          'JetBrains Mono',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      // [NEW] Add transitions from Spec 7.6
      transitionTimingFunction: {
        'in-out': 'ease-in-out',
      },
      transitionDuration: {
        '150': '150ms',
        '200': '200ms',
        '250': '250ms',
      },
    },
  },
  plugins: [],
};