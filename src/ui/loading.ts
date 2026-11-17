import { create } from 'zustand';

/** „Wczytywanie”: a spinner over the view while a new model is being built (the build itself blocks the page). */
export const useLoading = create<{ on: boolean }>(() => ({ on: false }));

/**
 * Shows the spinner, lets it paint, then does the work (which builds the model), and hides the spinner once the
 * built model has been drawn. The spinner turns on the compositor, so it keeps turning while the build blocks.
 */
export function withLoading(work: () => void) {
  useLoading.setState({ on: true });
  window.setTimeout(() => {
    try {
      work();
    } finally {
      const off = () => useLoading.setState({ on: false });
      window.setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(off))), 0);
    }
  }, 40);
}
