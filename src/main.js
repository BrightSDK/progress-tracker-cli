// LICENSE_CODE ZON
'use strict';
const cliProgress = require('cli-progress');
const createProgressTrackerCore = require('brd-ono-util-progress-tracker-core');

/**
 * Creates a CLI progress tracker
 * @param {Object} options - Configuration options
 * @param {number} [options.updateInterval=100] - Update interval in milliseconds
 * @param {string} [options.format='{bar} {percentage}% | {etaDisplay}{status}'] - Progress bar format
 * @param {string} [options.name] - Optional name to store duration history across runs
 * @param {boolean} [options.debug] - Enable debug output for history loading and detailed summaries
 * @param {Object|boolean} [options.summary] - Summary configuration
 * @param {boolean} [options.summary.enabled=true] - Whether to show the summary
 * @param {boolean} [options.summary.detailed=false] - Whether to show detailed summary regardless of debug setting
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
        updateInterval,
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

    // Handle transitions for smooth progress bar updates
    let inTransition = false;
    let transitionStart = 0;
    let currentProgress = 0;
    let targetPercentage = 0;
    const transitionDuration = 500; // ms for smooth transition

    // Helper for smooth transitions
    const smoothTransition = (fromPercentage, toPercentage, nextStepInfo = null) => {
        inTransition = true;
        transitionStart = Date.now();
        currentProgress = fromPercentage;
        targetPercentage = toPercentage;

        // If there's a next step to set after transition
        if (nextStepInfo) {
            setTimeout(() => {
                inTransition = false;

                // Update status to new step after transition
                if (progressBar) {
                    progressBar.update(targetPercentage, {
                        status: nextStepInfo.status || nextStepInfo.name,
                        etaString: nextStepInfo.etaString || '',
                        etaDisplay: nextStepInfo.etaString ? `ETA: ${nextStepInfo.etaString} | ` : ''
                    });
                }
            }, transitionDuration);
        }
    };

    const updateProgress = () => {
        if (!progressBar) return;

        const now = Date.now();

        // Handle transitions between steps
        if (inTransition) {
            const elapsed = now - transitionStart;
            const progress = Math.min(elapsed / transitionDuration, 1);

            if (progress >= 1) {
                // Transition complete
                inTransition = false;
                currentProgress = targetPercentage;
                return;
            }

            // Calculate intermediate percentage using easing function
            const t = progress;
            const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // Smooth easing
            const newPercentage = Math.round(currentProgress + ease * (targetPercentage - currentProgress));

            // Keep displaying the current step's label - don't change anything
            progressBar.update(newPercentage);
            return;
        }

        // Regular progress updates
        const progressData = core.getProgress();
        currentProgress = progressData.progress;

        // Display ETA if we have any history data OR if a step has been completed
        if (progressData.hasHistoryData || progressData.etaString) {
            // Only update ETA periodically to prevent flicker
            if (now - lastETAUpdateTime >= etaUpdateInterval && progressData.etaString !== lastETAValue) {
                lastETAUpdateTime = now;
                lastETAValue = progressData.etaString;

                progressBar.update(currentProgress, {
                    status: progressData.status,
                    etaString: progressData.etaString,
                    etaDisplay: progressData.etaString ? `ETA: ${progressData.etaString} | ` : ''
                });
            } else {
                progressBar.update(currentProgress);
            }
        } else {
            // No history data, update without ETA
            progressBar.update(currentProgress, {
                status: progressData.status,
                etaString: '',
                etaDisplay: '' // Don't show the ETA section at all
            });
        }
    };

    return {
        start: () => {
            // Initialize the core tracker
            const startData = core.start();

            // Initialize the progress bar
            progressBar = multiBar.create(100, startData.progress, {
                status: startData.status,
                etaString: startData.etaString || '',
                etaDisplay: '' // Start with no ETA display
            });

            // Start the progress update interval
            progressUpdateInterval = setInterval(updateProgress, Math.min(updateInterval, 50)); // Faster updates for smooth transitions

            return progressBar;
        },

        updateStep: (step) => {
            // Ensure step has all required properties
            if (!step.from && step.from !== 0) {
                console.warn(`Step ${step.name} is missing 'from' property. Setting to 0.`);
                step.from = 0;
            }

            if (!step.to && step.to !== 0) {
                if (step.endPercentage) {
                    step.to = step.endPercentage;
                } else {
                    console.warn(`Step ${step.name} is missing 'to' property. Using default value.`);
                    step.to = 100;
                }
            }

            // Call the core updateStep function with the enhanced step object
            const stepData = core.updateStep(step);

            // Update to show the new step immediately
            if (progressBar) {
                progressBar.update(stepData.progress, {
                    status: stepData.status,
                    etaString: '',
                    etaDisplay: ''
                });

                // Create a smooth transition to the step's starting percentage
                smoothTransition(
                    stepData.previousProgress,
                    stepData.progress,
                    {
                        name: step.name,
                        status: stepData.status,
                        etaString: ''
                    }
                );
            }

            return stepData.timestamp;
        },

        completeStep: (stepName) => {
            // Wrap the core call in a try-catch to prevent errors from propagating
            let completionData;
            try {
                completionData = core.completeStep(stepName);
            } catch (error) {
                console.error(`Error completing step "${stepName}": ${error.message}`);
                // Create a minimal completion data object with safe defaults
                completionData = {
                    status: `${stepName} (completed)`,
                    progress: currentProgress,
                    previousProgress: currentProgress
                };
            }

            if (progressBar) {
                // Ensure we have valid values to work with
                const progress = completionData?.progress ?? currentProgress;
                const previousProgress = completionData?.previousProgress ?? currentProgress;
                const status = completionData?.status ?? `${stepName} (completed)`;

                // Smooth transition to completion
                smoothTransition(
                    previousProgress,
                    progress
                );

                // Update status after transition
                setTimeout(() => {
                    if (progressBar) {  // Re-check progressBar exists after timeout
                        progressBar.update(progress, {
                            status: status,
                            etaString: '', // Clear ETA on completion
                            etaDisplay: ''  // Clear ETA display on completion
                        });
                    }
                }, transitionDuration);
            }
        },

        summary: () => {
            // Stop the progress update interval
            if (progressUpdateInterval) {
                clearInterval(progressUpdateInterval);
                progressUpdateInterval = null;
            }

            // Stop the progress bar
            multiBar.stop();

            // Skip summary if disabled
            if (!summaryConfig.enabled) {
                return;
            }

            // Safely get summary data with error handling
            let summaryData;
            try {
                summaryData = core.summary();
            } catch (error) {
                console.error(`Error generating summary: ${error.message}`);
                return; // Exit if we can't get summary data
            }

            if (!summaryData || summaryData.steps.length === 0) return;

            console.log('\nProcess timing summary:');
            console.log(`Total time: ${(summaryData.totalTime || 0).toFixed(1)}s`);

            // Show basic step timing with safety checks
            summaryData.steps.forEach(step => {
                if (step && step.from !== undefined && step.to !== undefined && step.duration !== undefined) {
                    console.log(`${step.from} → ${step.to}: ${step.duration.toFixed(1)}s`);
                } else {
                    console.log(`Step data incomplete: ${JSON.stringify(step)}`);
                }
            });

            // Show detailed stats if debug mode is on or detailed summary is requested
            const showDetailed = debug || summaryConfig.detailed;
            if (showDetailed && summaryData.analysis && summaryData.analysis.length > 0) {
                // Safely get adjustment factor with fallback
                const adjustmentFactor = summaryData.adjustmentFactor !== undefined ?
                    summaryData.adjustmentFactor : 1.0;

                console.log(`\nProgress estimation adjustment factor: ${adjustmentFactor.toFixed(2)}x`);
                console.log('Step duration analysis:');

                summaryData.analysis.forEach(step => {
                    if (!step || !step.name) {
                        console.log('  Invalid step data in analysis');
                        return;
                    }

                    // Safely handle potential undefined values
                    const historyInfo = step.historyInfo
                        ? ` [history avg: ${step.historyInfo.historyAverage?.toFixed(1) || '?'}s, samples: ${step.historyInfo.samples || '?'}]`
                        : '';

                    const configuredStr = (step.configuredDuration !== null && step.configuredDuration !== undefined)
                        ? `configured ${step.configuredDuration.toFixed(1)}s, `
                        : '';

                    // Handle the case when estimatedDuration or actualDuration might be undefined
                    const estimatedStr = (step.estimatedDuration !== undefined)
                        ? `estimated ${step.estimatedDuration.toFixed(1)}s, `
                        : '';

                    const actualStr = (step.actualDuration !== undefined)
                        ? `actual ${step.actualDuration.toFixed(1)}s`
                        : '';

                    const ratioStr = (step.ratio !== undefined && step.ratio !== null)
                        ? ` (${step.ratio.toFixed(2)}x)`
                        : '';

                    console.log(`  ${step.name}: ${configuredStr}${estimatedStr}${actualStr}${ratioStr}${historyInfo}`);
                });

                if (summaryData.historyFilePath) {
                    console.log(`\nProgress history saved to: ${summaryData.historyFilePath}`);
                }
            }
        },

        // Pass through cleanHistory method from core
        cleanHistory: (appName) => {
            return core.cleanHistory ? core.cleanHistory(appName) : {
                success: false,
                message: "cleanHistory method is not available in the core tracker version"
            };
        },

        // Expose the core helper methods when needed
        dumpHistory: () => core.dumpHistory ? core.dumpHistory() : null
    };
}

module.exports = createProgressTrackerCLI;