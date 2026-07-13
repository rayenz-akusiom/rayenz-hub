import { createContainer, getProductionContainer, resetProductionContainer, type ContainerOverrides } from './composition-root.js';
import { resolveAppServices, type AppServices } from './app-services.js';

export type { AppServices, ContainerOverrides };
export { createContainer, resolveAppServices, getProductionContainer, resetProductionContainer };
export { TYPES } from './types.js';

let cachedServices: AppServices | undefined;

export function getAppServices(): AppServices {
  if (!cachedServices) {
    cachedServices = resolveAppServices(getProductionContainer());
  }
  return cachedServices;
}

export function resetAppServices(): void {
  cachedServices = undefined;
  resetProductionContainer();
}

export function createAppServices(overrides: ContainerOverrides = {}): AppServices {
  return resolveAppServices(createContainer(overrides));
}
