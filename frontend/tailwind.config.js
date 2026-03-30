/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        syne: ['Syne', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#eef5ff',
          100: '#d9e6ff',
          200: '#b0c8ff',
          300: '#86a9ff',
          400: '#5c8bff',
          500: '#336dff',
          600: '#2153db',
          700: '#163ca5',
          800: '#0d276e',
          900: '#051438',
        },
        slate: {
          950: '#020617',
        },
      },
      boxShadow: {
        soft: '0 18px 45px rgba(15, 23, 42, 0.06)',
      },
      borderRadius: {
        xl: '1rem',
      },
    },
  },
  plugins: [],
};

