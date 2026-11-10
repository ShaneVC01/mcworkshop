/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL, for example https://xckqgweflvfstbvppmsy.supabase.co */
  readonly VITE_SUPABASE_URL?: string
  /**
   * Our Edge Function API key (matches the EDGE_API_KEY secret).
   * Prototype only: anything in a VITE_ variable ends up in the built JavaScript.
   * Browser calls move to Supabase Auth before the app is published.
   */
  readonly VITE_EDGE_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
