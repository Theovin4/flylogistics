import { createClient } from "@supabase/supabase-js";

type FlyPublicDatabase = {
  public: {
    Tables: {
      drivers: {
        Row: {
          id: number;
          name: string;
          status: string | null;
          phone: string | null;
          latitude: number | null;
          longitude: number | null;
          photo_url: string | null;
          created_at?: string | null;
        };
        Insert: {
          name: string;
          status?: string | null;
          phone?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          photo_url?: string | null;
        };
        Update: {
          name?: string;
          status?: string | null;
          phone?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          photo_url?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

let browserClient: ReturnType<typeof createClient<FlyPublicDatabase>> | null = null;

export function getSupabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  if (!browserClient) {
    browserClient = createClient<FlyPublicDatabase>(url, anonKey);
  }

  return browserClient;
}
