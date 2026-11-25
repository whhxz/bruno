// Wrapper around the upstream electron-builder config, used by the manual
// desktop workflow (`build-desktop-manual.yml`). It is a separate file on
// purpose: upstream config updates merge cleanly, and this file only narrows
// the target arch list (default: x64, override with BRUNO_BUILD_ARCH=x64,arm64).
const path = require('path');

const base = require(path.join(__dirname, '..', 'packages/bruno-electron/electron-builder-config.js'));

const arch = (process.env.BRUNO_BUILD_ARCH || 'x64').split(',').map((entry) => entry.trim()).filter(Boolean);
const withArch = (targets) => targets.map((target) => ({ ...target, arch }));

const overrides = {};
for (const platform of ['win', 'linux', 'mac']) {
  const section = base[platform];
  if (section?.target) {
    overrides[platform] = { ...section, target: withArch(section.target) };
  }
}

module.exports = { ...base, ...overrides };
