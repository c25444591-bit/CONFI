import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Cargar variables de entorno basadas en el modo (development/production)
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // Esto "imprime" la clave API dentro del código cuando Vercel construye la página.
      // Es necesario para que funcione sin un servidor backend dedicado.
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    },
    server: {
      host: true // Permite probar en red local si lo corres en tu PC
    }
  };
});