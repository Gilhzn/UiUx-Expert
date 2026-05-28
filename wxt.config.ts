import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  publicDir: '../public',
  manifest: {
    name: 'AdaptiveUI AI',
    description: 'Tier 0 universal page adaptation — typography, contrast, declutter, focus mode.',
    version: '0.1.0',
    permissions: ['storage', 'activeTab'],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    action: {
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
      },
    },
  },
});
