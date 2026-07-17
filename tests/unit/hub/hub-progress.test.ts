import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HubProgress } from '../../../packages/web/src/lib/hub-progress.ts';
import { resetHubModules } from '../helpers/hubHarness.ts';

beforeEach(() => {
  resetHubModules();
  document.body.innerHTML = '<div id="progress-host"></div>';
});

afterEach(() => {
  resetHubModules();
  document.body.innerHTML = '';
});

describe('HubProgress', () => {
  it('mount creates hidden bar in host', () => {
    const host = document.getElementById('progress-host')!;
    const controller = HubProgress.mount(host);
    const bar = host.querySelector('.hub-progress-bar') as HTMLElement;
    expect(bar).toBeTruthy();
    expect(bar.hidden).toBe(true);
    expect(controller.isActive()).toBe(false);
  });

  it('start shows bar with label', () => {
    const controller = HubProgress.mount(document.getElementById('progress-host')!);
    controller.start({ label: 'Loading…' });
    const bar = document.querySelector('.hub-progress-bar') as HTMLElement;
    expect(bar.hidden).toBe(false);
    expect(document.querySelector('.hub-progress-bar-label')!.textContent).toBe('Loading…');
    expect(controller.isActive()).toBe(true);
    expect((document.querySelector('.hub-progress-dismiss') as HTMLElement).hidden).toBe(true);
  });

  it('update sets fill width from current/total', () => {
    const controller = HubProgress.mount(document.getElementById('progress-host')!);
    controller.update({ current: 2, total: 4, label: 'Step 2 of 4' });
    const fill = document.querySelector('.hub-progress-bar-fill') as HTMLElement;
    expect(fill.style.width).toBe('50%');
    expect(document.querySelector('.hub-progress-bar-label')!.textContent).toBe('Step 2 of 4');
  });

  it('finish shows dismiss and success variant', () => {
    const controller = HubProgress.mount(document.getElementById('progress-host')!);
    controller.start({ label: 'Working…' });
    controller.finish({ label: 'Done', variant: 'success' });
    const bar = document.querySelector('.hub-progress-bar') as HTMLElement;
    expect(bar.classList.contains('hub-progress-success')).toBe(true);
    expect((document.querySelector('.hub-progress-dismiss') as HTMLElement).hidden).toBe(false);
    expect(controller.isActive()).toBe(false);
    expect(controller.isFinished()).toBe(true);
  });

  it('dismiss hides bar and resets state', () => {
    const controller = HubProgress.mount(document.getElementById('progress-host')!);
    controller.finish({ label: 'Complete' });
    controller.dismiss();
    const bar = document.querySelector('.hub-progress-bar') as HTMLElement;
    expect(bar.hidden).toBe(true);
    expect(controller.isFinished()).toBe(false);
  });

  it('finish with error applies error variant', () => {
    const controller = HubProgress.mount(document.getElementById('progress-host')!);
    controller.finish({ label: 'Failed', variant: 'error' });
    const bar = document.querySelector('.hub-progress-bar') as HTMLElement;
    expect(bar.classList.contains('hub-progress-error')).toBe(true);
  });

  it('start with indeterminate applies indeterminate variant', () => {
    const controller = HubProgress.mount(document.getElementById('progress-host')!);
    controller.start({ label: 'Waiting…', indeterminate: true });
    const bar = document.querySelector('.hub-progress-bar') as HTMLElement;
    expect(bar.classList.contains('hub-progress-indeterminate')).toBe(true);
  });

  it('update without prior start auto-starts and shows count label', () => {
    const controller = HubProgress.mount(document.getElementById('progress-host')!);
    controller.update({ current: 1, total: 3 });
    expect(controller.isActive()).toBe(true);
    expect(document.querySelector('.hub-progress-bar-label')!.textContent).toBe('1/3…');
  });

  it('finish uses default labels when label omitted', () => {
    const controller = HubProgress.mount(document.getElementById('progress-host')!);
    controller.finish({});
    expect(document.querySelector('.hub-progress-bar-label')!.textContent).toBe('Complete');
    controller.start({});
    controller.finish({ variant: 'error' });
    expect(document.querySelector('.hub-progress-bar-label')!.textContent).toBe('Failed');
  });

  it('dismiss button hides bar', () => {
    const controller = HubProgress.mount(document.getElementById('progress-host')!);
    controller.start({ label: 'Working…' });
    const dismiss = document.querySelector('.hub-progress-dismiss') as HTMLButtonElement;
    dismiss.click();
    expect((document.querySelector('.hub-progress-bar') as HTMLElement).hidden).toBe(true);
    expect(controller.isActive()).toBe(false);
  });
});
