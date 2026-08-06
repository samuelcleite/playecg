import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      // Default on: o app usa @/functions/* e @/entities/* (resolvidos pelo compat shim do
      // Base44). O build Linux do Base44 seta BASE44_LEGACY_SDK_IMPORTS=true; local no Windows
      // não seta, então ligamos por padrão. Setar '=false' ainda desliga.
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS !== 'false'
    }),
    react(),
  ]
});