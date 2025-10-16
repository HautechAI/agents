// Explicit initialization of built-in ConfigViews to avoid side-effect imports
import './components/configViews/registerDefaults';

export function initConfigViewsRegistry(): null {
  // No-op function to make tree-shaking retain the registration module
  return null;
}

