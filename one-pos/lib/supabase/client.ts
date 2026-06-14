import { createBrowserClient } from '@supabase/ssr'

export function createClient() {// sementara, buat ngecek
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}
