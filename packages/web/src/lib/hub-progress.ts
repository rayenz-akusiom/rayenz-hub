export type HubProgressStartOptions = {
  label?: string;
  indeterminate?: boolean;
};

export type HubProgressUpdateOptions = {
  current?: number;
  total?: number;
  label?: string;
};

export type HubProgressFinishOptions = {
  label?: string;
  variant?: string;
};

export type HubProgressController = {
  start: (options?: HubProgressStartOptions) => void;
  update: (options?: HubProgressUpdateOptions) => void;
  finish: (options?: HubProgressFinishOptions) => void;
  dismiss: () => void;
  isActive: () => boolean;
  isFinished: () => boolean;
};

export function mountHubProgress(hostEl: HTMLElement): HubProgressController {
  hostEl.classList.add('hub-progress-host');
  hostEl.innerHTML =
    '<div class="hub-progress-bar" hidden>' +
    '<div class="hub-progress-bar-track">' +
    '<div class="hub-progress-bar-fill"></div>' +
    '</div>' +
    '<div class="hub-progress-bar-row">' +
    '<div class="hub-progress-bar-label"></div>' +
    '<button type="button" class="hub-progress-dismiss" hidden aria-label="Dismiss">×</button>' +
    '</div>' +
    '</div>';

  const barEl = hostEl.querySelector('.hub-progress-bar') as HTMLElement | null;
  const fillEl = hostEl.querySelector('.hub-progress-bar-fill') as HTMLElement | null;
  const labelEl = hostEl.querySelector('.hub-progress-bar-label') as HTMLElement | null;
  const dismissEl = hostEl.querySelector('.hub-progress-dismiss') as HTMLButtonElement | null;
  let active = false;
  let finished = false;

  function setFillPercent(pct: number): void {
    if (!fillEl) {
      return;
    }
    fillEl.style.width = Math.max(0, Math.min(100, pct)) + '%';
  }

  function setVariant(variant: string | null): void {
    if (!barEl) {
      return;
    }
    barEl.classList.remove(
      'hub-progress-success',
      'hub-progress-error',
      'hub-progress-indeterminate',
    );
    if (variant === 'success') {
      barEl.classList.add('hub-progress-success');
    } else if (variant === 'error') {
      barEl.classList.add('hub-progress-error');
    } else if (variant === 'indeterminate') {
      barEl.classList.add('hub-progress-indeterminate');
    }
  }

  function showBar(): void {
    if (barEl) {
      barEl.hidden = false;
    }
  }

  const controller: HubProgressController = {
    start(options = {}) {
      active = true;
      finished = false;
      showBar();
      setVariant(options.indeterminate ? 'indeterminate' : null);
      setFillPercent(0);
      if (labelEl) {
        labelEl.textContent = options.label || '';
      }
      if (dismissEl) {
        dismissEl.hidden = true;
      }
    },

    update(options = {}) {
      if (!active) {
        controller.start({ label: options.label });
      }
      showBar();
      setVariant(null);
      const total = options.total || 0;
      const current = options.current || 0;
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;
      setFillPercent(pct);
      if (labelEl && options.label != null) {
        labelEl.textContent = options.label;
      } else if (labelEl && total > 0) {
        labelEl.textContent = current + '/' + total + '…';
      }
      if (dismissEl) {
        dismissEl.hidden = true;
      }
    },

    finish(options = {}) {
      active = false;
      finished = true;
      showBar();
      const variant = options.variant === 'error' ? 'error' : 'success';
      setVariant(variant);
      setFillPercent(100);
      if (labelEl) {
        labelEl.textContent = options.label || (variant === 'error' ? 'Failed' : 'Complete');
      }
      if (dismissEl) {
        dismissEl.hidden = false;
      }
    },

    dismiss() {
      active = false;
      finished = false;
      if (barEl) {
        barEl.hidden = true;
        barEl.classList.remove(
          'hub-progress-success',
          'hub-progress-error',
          'hub-progress-indeterminate',
        );
      }
      setFillPercent(0);
      if (labelEl) {
        labelEl.textContent = '';
      }
      if (dismissEl) {
        dismissEl.hidden = true;
      }
    },

    isActive() {
      return active;
    },

    isFinished() {
      return finished;
    },
  };

  dismissEl?.addEventListener('click', () => {
    controller.dismiss();
  });

  return controller;
}

export const HubProgress = {
  mount: mountHubProgress,
};
