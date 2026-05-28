import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'AdaptiveUI AI',
    description: 'Tier 0 universal page adaptation — typography, contrast, declutter, focus mode.',
    version: '0.1.0',
    permissions: ['storage', 'activeTab'],
  },
});
