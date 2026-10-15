import { useEffect, useState } from 'preact/hooks';

/** Subscribe to immutable controller snapshots and close the render/effect gap. */
export function useSnapshot<T>(controller: { getSnapshot(): T; subscribe(listener: () => void): () => void }): T {
  const [snapshot, setSnapshot] = useState(() => controller.getSnapshot());
  useEffect(() => {
    const changed = (): void => setSnapshot(controller.getSnapshot());
    const unsubscribe = controller.subscribe(changed);
    changed();
    return unsubscribe;
  }, [controller]);
  return snapshot;
}
