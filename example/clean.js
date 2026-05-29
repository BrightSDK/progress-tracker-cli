// LICENSE_CODE ZON
'use strict';
const createProgressTracker = require('../index');

/**
 * Script to clean history for the example app
 */

// Create a tracker instance
const tracker = createProgressTracker();

// Get app name from command line argument or use default
const appName = process.argv[2] || 'example-app';

// Check if cleanHistory is available
if (typeof tracker.cleanHistory !== 'function') {
  console.error(
    'Error: cleanHistory method is not available in this version of the tracker',
  );
  process.exit(1);
}

// Clean history for the specified app
const result = tracker.cleanHistory(appName);

// Display the result
if (result.success) {
  console.log(`✓ ${result.message}`);
} else {
  console.error(`✗ ${result.message}`);
  process.exit(1);
}
