import type { SubmissionProvider } from '@foxindex/types';
import type { IndexingProvider } from './types';

export class ProviderNotRegisteredError extends Error {
  constructor(public readonly providerName: SubmissionProvider) {
    super(`No provider registered for "${providerName}"`);
    this.name = 'ProviderNotRegisteredError';
  }
}

/**
 * Resolves a provider by name so callers (the submission worker) never hard-code
 * a specific provider class — adding Google Search Console in Phase 2 is
 * `providerRouter.register(new GoogleSearchConsoleProvider(...))` plus a new
 * SubmissionProvider enum value, with zero changes to the worker itself.
 */
export class ProviderRouter {
  private readonly providers = new Map<SubmissionProvider, IndexingProvider>();

  register(provider: IndexingProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: SubmissionProvider): IndexingProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new ProviderNotRegisteredError(name);
    }
    return provider;
  }

  has(name: SubmissionProvider): boolean {
    return this.providers.has(name);
  }
}
