const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      if (fs.existsSync(podfilePath)) {
        let contents = fs.readFileSync(podfilePath, 'utf8');
        if (!contents.includes('use_modular_headers!')) {
          contents = "use_modular_headers!\n" + contents;
          fs.writeFileSync(podfilePath, contents, 'utf8');
        }
      }
      return cfg;
    },
  ]);
}

module.exports = withModularHeaders;
