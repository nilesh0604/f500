const { composePlugins, withNx } = require('@nx/webpack');
const path = require('path');

// Nx plugins for webpack.
module.exports = composePlugins(withNx(), config => {
  // Update the webpack config as needed here.
  // e.g. `config.plugins.push(new MyPlugin())
  config.output = {
    ...config.output,
    libraryTarget: 'commonjs2',
  };
  config.target = 'node';
  config.mode =
    process.env.NODE_ENV === 'production' ? 'production' : 'development';

  // Exclude aws-sdk from bundle (provided by Lambda runtime)
  config.externals = ['aws-sdk', '@aws-sdk/*'];

  return config;
});
