import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: import("clsx").ClassValue[]): string {
  return twMerge(clsx(inputs))
}
