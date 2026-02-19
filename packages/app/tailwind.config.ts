import type { Config } from 'tailwindcss'

export default <Config>{
  content: [
    './app.vue',
    './pages/**/*.vue',
    './components/**/*.vue',
  ],
  theme: {
    extend: {
      colors: {
        postgis: '#3b82f6',
        mssql: '#ef4444',
      }
    }
  }
}
