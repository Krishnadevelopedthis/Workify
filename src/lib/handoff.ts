"use client";

// Holds a result file while the user moves to another tool ("Continue to…").
// Lives in memory, so it survives client-side navigation but not a reload.
let pending: File[] | null = null;

export function handOff(files: File[]) {
  pending = files;
}

/** Reads without clearing, so it is safe inside a state initializer. */
export function peekHandOff(): File[] | null {
  return pending;
}

export function clearHandOff() {
  pending = null;
}
