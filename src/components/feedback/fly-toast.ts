"use client";

import { toast } from "sonner";

export function flySuccess(message: string, description?: string) {
  toast.success(message, {
    description,
    duration: 5200
  });
}

export function flyError(message: string, description?: string) {
  toast.error(message, {
    description,
    duration: 7200
  });
}

export function flyInfo(message: string, description?: string) {
  toast(message, {
    description,
    duration: 5200
  });
}
