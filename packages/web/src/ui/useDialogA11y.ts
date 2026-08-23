import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const DIALOG_SEL = '.db-modal, .hub-picker-dialog';

function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1,
  );
}

function isTopmostDialog(root: HTMLElement): boolean {
  const all = document.querySelectorAll(DIALOG_SEL);
  return all[all.length - 1] === root;
}

/**
 * Escape to close, Tab cycle, restore focus. Does not change markup.
 * Skip initial focus when a child already has it (e.g. CardPicker filter).
 */
export function useDialogA11y(
  open: boolean,
  onClose: () => void,
  containerRef: RefObject<HTMLElement | null>,
) {
  const restoreRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = containerRef.current;
    if (root && !root.contains(document.activeElement)) {
      focusableIn(root)[0]?.focus();
    }

    function onKey(e: KeyboardEvent) {
      if (!root || !isTopmostDialog(root)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = focusableIn(root);
      if (!nodes.length) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      restoreRef.current?.focus?.();
    };
  }, [open, containerRef]);
}
