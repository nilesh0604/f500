const { composePlugins, withNx } = require('@nx/webpack');
const path = require('path');

module.exports = composePlugins(withNx(), config => {
  // Multi-entry: produces handlers/receiver.js + handlers/worker.js
  // Lambda handler paths: handlers/receiver.handler / handlers/worker.handler
  config.entry = {
    'handlers/receiver': path.resolve(__dirname, 'src/handlers/receiver.ts'),
    'handlers/worker': path.resolve(__dirname, 'src/handlers/worker.ts'),
  };

  config.output = {
    ...config.output,
    filename: '[name].js',
    libraryTarget: 'commonjs2',
  };

  config.target = 'node';
  config.mode =
    process.env.NODE_ENV === 'production' ? 'production' : 'development';

  // All @aws-sdk/* packages are provided by the Lambda Node.js 22 runtime
  config.externals = ['aws-sdk', '@aws-sdk/*'];

  return config;
});
