export class CapacityGate {
  private active = 0;

  constructor(readonly limit: number) {}

  tryAcquire(reservedSlots = 0): (() => void) | null {
    if (this.active >= Math.max(0, this.limit - reservedSlots)) return null;
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active = Math.max(0, this.active - 1);
    };
  }
}

export const voteCapacity = new CapacityGate(48);
export const sessionCapacity = new CapacityGate(16);
export const telemetryCapacity = new CapacityGate(12);
export const shareCreateCapacity = new CapacityGate(4);
export const shareResolveCapacity = new CapacityGate(16);
export const shareImageCapacity = new CapacityGate(8);
const databaseCapacity = new CapacityGate(64);
export const CRITICAL_DATABASE_RESERVE = 16;

export function tryAcquireDatabase(
  category?: CapacityGate,
  reservedGlobalSlots = 0,
): (() => void) | null {
  const releaseDatabase = databaseCapacity.tryAcquire(reservedGlobalSlots);
  if (!releaseDatabase) return null;

  const releaseCategory = category?.tryAcquire() ?? null;
  if (category && !releaseCategory) {
    releaseDatabase();
    return null;
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseCategory?.();
    releaseDatabase();
  };
}

export function deadline(milliseconds: number): AbortSignal {
  return AbortSignal.timeout(milliseconds);
}
