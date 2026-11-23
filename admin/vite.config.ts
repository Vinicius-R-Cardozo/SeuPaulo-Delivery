import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const appConfig = defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { port: 5180, host: true },
});

export default defineConfig(({ mode }) => {
  const variables = loadEnv(mode, process.cwd(), 'VITE_SUPABASE_');
  for (const [name, value] of Object.entries(variables)) {
    const key = value.trim();
    const jwtPayload = key.split('.')[1];
    const legacySecret = jwtPayload &&
      /"role"\s*:\s*"service_role"/.test(Buffer.from(jwtPayload, 'base64url').toString('utf8'));
    if (key.startsWith('sb_secret_') || legacySecret) {
      throw new Error(`${name} contém uma chave secreta. Configure apenas a chave pública no frontend.`);
    }
  }
  return appConfig;
});
