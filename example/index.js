// LICENSE_CODE ZON
'use strict';
const createProgressTracker = require('../index');

/**
 * Example usage of the CLI progress tracker
 * This demo shows 5 steps with allocations: 10%, 20%, 40%, 10%, 20%
 */
async function runExample() {
  // Create a new progress tracker with a name to save history
  const tracker = createProgressTracker({
    name: 'example-app',
    // Enable detailed debugging
    debug: process.env.DEBUG,

    // Control summary display
    summary: {
      enabled: true,     // Set to false to disable the summary completely
      detailed: true,    // Set to true to show detailed stats even without debug mode
    }
  });

  // Start the tracker
  tracker.start();

  // Define our steps with their percentage allocations and proper from/to values
  const steps = [
    { name: 'initialize', from: 0, to: 10, endPercentage: 10 },
    { name: 'load-resources', from: 10, to: 30, endPercentage: 30 },
    { name: 'process-data', from: 30, to: 70, endPercentage: 70 },
    { name: 'validate', from: 70, to: 80, endPercentage: 80 },
    { name: 'finalize', from: 80, to: 100, endPercentage: 100 }
  ];

  try {
    // Execute each step with simulated work
    for (const step of steps) {
      // Update the tracker to the current step
      tracker.updateStep({
        name: step.name,
        from: step.from,
        to: step.to,
        endPercentage: step.endPercentage
      });

      // Simulate work for this step - duration varies to match the step complexity
      const simulatedDuration = getSimulatedDurationForStep(step);
      await simulateWork(simulatedDuration);

      // Mark the step as complete
      tracker.completeStep(step.name);
    }

    // Add a small delay to ensure all transitions are complete
    await new Promise(resolve => setTimeout(resolve, 600));

    // Show the summary of all steps
    tracker.summary();
  } catch (error) {
    console.error('Error during example execution:', error);
  }
}

/**
 * Get a simulated duration proportional to the step's percentage range
 * @param {Object} step - Step configuration
 * @returns {number} - Duration in seconds
 */
function getSimulatedDurationForStep(step) {
  // Calculate percentage range using from/to values
  const percentRange = step.to - step.from;

  // Use percentage range to determine duration (roughly 1 second per 10%)
  return Math.max(1, Math.round(percentRange / 10 * 1.5));
}

/**
 * Simulate async work for a specified number of seconds
 * @param {number} seconds - Duration in seconds
 * @returns {Promise} - Resolves after the specified duration
 */
function simulateWork(seconds) {
  return new Promise(resolve => {
    const ms = seconds * 1000;
    setTimeout(resolve, ms);
  });
}

// Run the example
runExample().catch(error => {
  console.error('Error in example:', error);
  process.exit(1);
});
