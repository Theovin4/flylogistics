import { createClient } from "@supabase/supabase-js";
import { cleanEnv } from "@/lib/env";

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
      shipments: {
        Row: {
          id: number;
          tracking_id: string;
          status: string;
          driver_id: number | null;
          pickup_address: string;
          delivery_address: string;
          package_type: string;
          current_lat: number | null;
          current_lng: number | null;
          eta: string | null;
          updated_at?: string | null;
        };
        Insert: never;
        Update: {
          current_lat?: number | null;
          current_lng?: number | null;
          status?: string | null;
          driver_id?: number | null;
          updated_at?: string | null;
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
  const url = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!url || !anonKey) return null;

  if (!browserClient) {
    browserClient = createClient<FlyPublicDatabase>(url, anonKey);
  }

  return browserClient;
}
