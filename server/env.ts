// Loads a local .env file (when present) before any other module reads process.env.
// On Vercel the variables are injected by the platform.
try {
  process.loadEnvFile();
} catch {
  /* no .env file */
}
