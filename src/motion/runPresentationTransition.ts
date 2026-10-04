import { flushSync } from 'react-dom';

type TransitionKind = 'modal' | 'page';

type ViewTransitionLike = {
  finished: Promise<unknown>;
  ready?: Promise<unknown>;
  updateCallbackDone?: Promise<unknown>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => ViewTransitionLike;
};

type PresentationTransitionOptions = {
  cameraSafe?: boolean;
  kind?: TransitionKind;
};

let transitionSequence = 0;
let activeTransition: ViewTransitionLike | null = null;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Applies state immediately and lets supporting browsers animate the old UI
 * snapshot away. Unsupported browsers use the shared CSS enter animation.
 */
export function runPresentationTransition(
  update: () => void,
  { cameraSafe = false, kind = 'page' }: PresentationTransitionOptions = {},
): void {
  if (typeof document === 'undefined' || prefersReducedMotion()) {
    update();
    return;
  }

  const transitionDocument = document as ViewTransitionDocument;
  if (typeof transitionDocument.startViewTransition !== 'function') {
    update();
    return;
  }

  // A rapid second click should still navigate immediately, but starting a
  // competing native transition makes Chromium reject the first transition.
  if (activeTransition) {
    update();
    return;
  }

  const transitionId = ++transitionSequence;
  const root = document.documentElement;
  root.dataset.viewTransitionSupported = 'true';
  root.dataset.viewTransition = 'active';
  root.dataset.motionKind = kind;
  root.dataset.motionMode = cameraSafe ? 'camera-safe' : 'default';

  let updateStarted = false;
  const clearTransitionState = () => {
    if (transitionId !== transitionSequence) return;
    delete root.dataset.viewTransition;
    delete root.dataset.motionKind;
    delete root.dataset.motionMode;
    activeTransition = null;
  };

  try {
    const transition = transitionDocument.startViewTransition(() => {
      updateStarted = true;
      flushSync(update);
    });
    activeTransition = transition;
    void transition.ready?.catch(() => undefined);
    void transition.updateCallbackDone?.catch(() => undefined);
    void transition.finished.then(clearTransitionState, clearTransitionState);
  } catch {
    clearTransitionState();
    // Support for the API does not guarantee that every invocation succeeds
    // (for example, a duplicate transition name can make Chromium reject it).
    // Let the mounted page use its CSS fallback for this navigation instead of
    // permanently treating the document as native-transition-only.
    delete root.dataset.viewTransitionSupported;
    if (!updateStarted) update();
  }
}
