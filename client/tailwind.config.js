/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#132842',
          light: '#1a365d',
          dark: '#0c1b2b'
        },
        coral: {
          DEFAULT: '#C36044',
          light: '#d47a61',
          dark: '#a34d34'
        },
        gray: {
          DEFAULT: '#EEEEEE',
          light: '#FFFFFF',
          dark: '#DDDDDD'
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Inter', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 2px 4px rgba(19, 40, 66, 0.08), 0 4px 12px rgba(19, 40, 66, 0.08)',
        'card-hover': '0 4px 8px rgba(19, 40, 66, 0.12), 0 8px 24px rgba(19, 40, 66, 0.12)',
      }
    },
  },
  plugins: [],
}
