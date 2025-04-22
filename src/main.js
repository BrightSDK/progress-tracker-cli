// LICENSE_CODE ZON
'use strict';
const cliProgress = require('cli-progress');
const createProgressTrackerCore = require('brd-ono-util-progress-tracker-core');

/**
 * Creates a CLI progress tracker with simplified workflow
 * @param {Object} options - Configuration options
 * @param {number} [options.updateInterval=100] - Update interval in milliseconds
 * @param {string} [options.format='{bar} {percentage}% | {etaDisplay}{status}'] - Progress bar format
 * @param {string} [options.name] - Optional name to store duration history across runs
 * @param {boolean} [options.debug] - Enable debug output for history loading and detailed summaries
 * @param {Object|boolean} [options.summary] - Summary configuration
 * @returns {Object} - Progress tracker instance with CLI representation
 */
function createProgressTrackerCLI(options = {}) {
    const {
        updateInterval = 100,
        format = '{bar} {percentage}% | {etaDisplay}{status}',
        name = 'app',
        debug = false,
        summary = { enabled: true, detailed: false }
    } = options;

    // Normalize the summary option
    const summaryConfig = typeof summary === 'boolean'
        ? { enabled: summary, detailed: debug }
        : { enabled: true, detailed: debug, ...summary };

    // Create the core tracker
    const core = createProgressTrackerCore({
        name,
        debug,
    });

    // Create CLI specific elements
    const multiBar = new cliProgress.MultiBar({
        clearOnComplete: false,
        hideCursor: true,
        format: format
    }, cliProgress.Presets.shades_classic);

    let progressBar = null;
    let progressUpdateInterval = null;
    let lastETAUpdateTime = 0;
    let lastETAValue = '';
    const etaUpdateInterval = 1000; // Update ETA display once per second to avoid flicker

    // Current progress state
    let currentProgress = 0;

    /**
     * Updates the progress display based on core tracker state
     */
    const updateProgress = () => {
        if (!progressBar) return;

        try {
            const now = Date.now();
            const progressData = core.getProgress();

            // Handle case when progressData is null or undefined
            if (!progressData) {
                return;
            }

            // Update current progress - ensure we have a valid number
            if (typeof progressData.progress === 'number') {
                currentProgress = progressData.progress;
            }

            // Check if we should update the ETA display to avoid flickering
            const shouldUpdateETA = now - lastETAUpdateTime >= etaUpdateInterval &&
                                  progressData.etaString !== lastETAValue;

            // Ensure progress is within valid range for cli-progress (0-100)
            const safeProgress = Math.max(0, Math.min(100, currentProgress));

            if (shouldUpdateETA) {
                lastETAUpdateTime = now;
                lastETAValue = progressData.etaString || '';

                // Full update with status and ETA
                progressBar.update(safeProgress, {
                    status: progressData.status || 'Processing...',
                    etaString: progressData.etaString || '',
                    etaDisplay: progressData.etaString ? `ETA: ${progressData.etaString} | ` : ''
                });
            } else {
                // Just update progress without changing text to reduce flickering
                progressBar.update(safeProgress);
            }
        } catch (err) {
            if (debug) {
                console.error('Error updating progress:', err.message);
            }
        }
    };

    // Create the tracker object
    const tracker = {
        /**
         * Start the progress tracker
         * @returns {Object} Progress bar instance
         */
        start: () => {
            try {
                // Initialize the core tracker
                const startData = core.start();

                // Reset progress tracking variables
                currentProgress = 0;
                lastETAUpdateTime = 0;
                lastETAValue = '';

                // Stop any existing intervals
                if (progressUpdateInterval) {
                    clearInterval(progressUpdateInterval);
                    progressUpdateInterval = null;
                }

                // Create a new progress bar
                if (progressBar) {
                    // If we already have a bar, update it with new state
                    progressBar.update(0, {
                        status: (startData && startData.status) || 'Starting...',
                        etaString: '',
                        etaDisplay: ''
                    });
                } else {
                    // Create a new progress bar if one doesn't exist
                    progressBar = multiBar.create(100, 0, {
                        status: (startData && startData.status) || 'Starting...',
                        etaString: '',
                        etaDisplay: ''
                    });
                }

                // Start the progress update interval
                progressUpdateInterval = setInterval(updateProgress, updateInterval);

                return progressBar;
            } catch (err) {
                if (debug) {
                    console.error('Error starting progress tracker:', err.message);
                }

                // Create a fallback progress bar if something went wrong
                if (!progressBar) {
                    progressBar = multiBar.create(100, 0, {
                        status: 'Starting...',
                        etaString: '',
                        etaDisplay: ''
                    });
                }
                return progressBar;
            }
        },

        /**
         * Update the current step
         * @param {Object} stepConfig - Step configuration
         * @param {string} stepConfig.name - Step name
         * @param {string} [stepConfig.label] - Human-readable label
         * @param {number} stepConfig.endPercentage - Maximum percentage this step can reach
         * @returns {Object} Updated progress data
         */
        updateStep: (stepConfig) => {
            // For backward compatibility, if someone used 'to' instead of 'endPercentage'
            if (stepConfig.to !== undefined && stepConfig.endPercentage === undefined) {
                stepConfig.endPercentage = stepConfig.to;
                // Log a deprecation warning if debug is enabled
                if (debug) {
                    console.warn("Warning: 'to' property is deprecated, use 'endPercentage' instead");
                }
            }

            // Call the core updateStep function
            const stepData = core.updateStep(stepConfig);

            // Update the progress bar immediately to show the step change
            if (progressBar) {
                progressBar.update(stepData.progress, {
                    status: stepData.status || stepConfig.label || stepConfig.name,
                    etaString: stepData.etaString || '',
                    etaDisplay: stepData.etaString ? `ETA: ${stepData.etaString} | ` : ''
                });
            }

            return stepData;
        },

        /**
         * Get the current progress
         * @returns {Object} Current progress data
         */
        getProgress: () => {
            try {
                return core.getProgress() || { progress: currentProgress };
            } catch (err) {
                if (debug) {
                    console.error('Error getting progress:', err.message);
                }
                return { progress: currentProgress };
            }
        },

        /**
         * Finish the tracking and ensure progress is at 100%
         * @param {Object} [options] - Options for finishing
         * @param {string} [options.message='Complete'] - Final message to display
         * @param {boolean} [options.showSummary=false] - Whether to automatically show summary
         * @returns {Object} Final progress state
         */
        finish: (options = {}) => {
            try {
                const message = options.message || 'Complete';
                const showSummary = !!options.showSummary;

                // Call core finish to properly complete current step and update history
                const finalData = core.finish({
                    status: message
                });

                // Use the result from core.finish() which already has progress=100%
                currentProgress = finalData.progress; // This should be 100%

                // Update the progress bar with the final data from core
                if (progressBar) {
                    progressBar.update(finalData.progress, {
                        status: finalData.status || message,
                        etaString: '',
                        etaDisplay: ''
                    });
                }

                // Clean up the interval
                if (progressUpdateInterval) {
                    clearInterval(progressUpdateInterval);
                    progressUpdateInterval = null;
                }

                // Show summary if requested - FIX: use tracker.summary instead of this.summary
                if (showSummary) {
                    setTimeout(() => {
                        tracker.summary();
                    }, 100);
                }

                return finalData;
            } catch (err) {
                if (debug) {
                    console.error('Error in finish:', err.message);
                }
                return { progress: currentProgress };
            }
        },

        /**
         * Generate and display summary
         */
        summary: () => {
            try {
                // Stop the progress update interval
                if (progressUpdateInterval) {
                    clearInterval(progressUpdateInterval);
                    progressUpdateInterval = null;
                }

                // Stop the progress bar
                if (multiBar) {
                    multiBar.stop();
                }

                // Skip summary if disabled
                if (!summaryConfig.enabled) {
                    return;
                }

                // Get summary data from core
                const summaryData = core.summary();

                if (!summaryData || Object.keys(summaryData).length === 0) return;

                console.log('\nProcess timing summary:');
                console.log(`Total time: ${(summaryData.totalTime || 0).toFixed(1)}s`);

                // Show step timing
                if (summaryData.steps && Array.isArray(summaryData.steps)) {
                    summaryData.steps.forEach(step => {
                        if (step && step.name) {
                            const duration = step.actualDuration !== undefined ?
                                step.actualDuration.toFixed(1) : '?';
                            const startPct = step.startPercentage !== undefined ?
                                step.startPercentage : '?';
                            const endPct = step.endPercentage !== undefined ?
                                step.endPercentage : '?';

                            console.log(`${step.name}: ${startPct}% → ${endPct}%: ${duration}s`);
                        }
                    });
                }

                // Show history file path if available
                if (summaryData.historyFilePath) {
                    console.log(`\nProgress history saved to: ${summaryData.historyFilePath}`);
                }
            } catch (err) {
                if (debug) {
                    console.error('Error generating summary:', err.message);
                }
            }
        },

        /**
         * Clean history data
         * @param {string} [appName] - Optional app name to clean
         * @returns {Object} Result with success status
         */
        cleanHistory: (appName) => {
            try {
                return core.cleanHistory ? core.cleanHistory(appName) : {
                    success: false,
                    message: "cleanHistory method is not available in the core tracker"
                };
            } catch (err) {
                if (debug) {
                    console.error('Error cleaning history:', err.message);
                }
                return {
                    success: false,
                    message: `Error cleaning history: ${err.message}`
                };
            }
        },

        /**
         * Get history information
         * @returns {Object} History information
         */
        getHistoryInfo: () => {
            try {
                return core.getHistoryInfo ? core.getHistoryInfo() : null;
            } catch (err) {
                if (debug) {
                    console.error('Error getting history info:', err.message);
                }
                return null;
            }
        },

        /**
         * Stop and clean up resources
         */
        stop: () => {
            try {
                // Clean up interval if it exists
                if (progressUpdateInterval) {
                    clearInterval(progressUpdateInterval);
                    progressUpdateInterval = null;
                }

                // Stop progress bar
                if (multiBar) {
                    multiBar.stop();
                }
            } catch (err) {
                // Always log errors when stopping, regardless of debug flag
                console.error('Error stopping progress tracker:', err.message);
            }
        }
    };

    return tracker;
}

module.exports = createProgressTrackerCLI;
