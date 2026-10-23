// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    plugins: [{
      name: 'flowa-connectivity-client',
      enforce: 'pre',
      resolveId(source, importer) {
        if (source === './client' && importer?.replaceAll('\\', '/').endsWith('/integrations/supabase/auth-attacher.ts')) {
          return `${process.cwd()}/src/lib/supabase-connectivity.ts`;
        }
      },
    }],
    resolve: {
      // Keep the generated integration immutable; application imports share the
      // production connectivity wrapper. The plugin covers the attacher's
      // relative import without touching either generated file.
      alias: {
        '@/integrations/supabase/client': `${process.cwd()}/src/lib/supabase-connectivity.ts`,
      },
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
