import { describe, it, expect, beforeEach } from 'vitest';
import { installDefaultConfigViews } from '@/components/configViews/registerDefaults';
import { clearRegistry, getConfigView, registerConfigView } from '@/components/configViews/registry';

describe('registerDefaults workspace alias', () => {
  beforeEach(() => clearRegistry());

  it('registers ContainerProviderConfigView under workspace alias', () => {
    installDefaultConfigViews(registerConfigView);
    const comp = getConfigView('workspace', 'static');
    expect(comp).toBeTypeOf('function');
  });
});

