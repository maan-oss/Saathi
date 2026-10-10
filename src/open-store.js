import { Store } from './store.js';
import { SupabaseStore } from './supastore.js';

// The one place that decides where data lives. Production sets SUPABASE_URL; the file store is for local work and tests.
export function openStore(config) {
  if (config.supabaseUrl) {
    if (!config.supabaseKey) {
      throw new Error('SUPABASE_URL is set but SUPABASE_SECRET_KEY is not. Add the secret key from Supabase (Project Settings, API Keys) to your host environment. Refusing to start without it.');
    }
    return new SupabaseStore({ url: config.supabaseUrl, key: config.supabaseKey });
  }
  return new Store(config.dataDir);
}
