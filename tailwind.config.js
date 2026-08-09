/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          DEFAULT: '#0d9488',
          soft: '#ccfbf1',
          ink: '#134e4a',
        },
        surface: {
          DEFAULT: '#f8faf9',
          card: '#ffffff',
          line: '#e2e8f0',
        },
      },
    },
  },
  plugins: [],
};
