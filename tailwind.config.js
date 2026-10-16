/** @type {import('tailwindcss').Config} */
export default {
  // Classes are toggled from JS (e.g. 'text-emerald-400 font-bold'), so scan src too.
  content: ['./index.html', './src/**/*.js'],
  darkMode: 'class',
  theme: { extend: {} },
  plugins: [],
};
