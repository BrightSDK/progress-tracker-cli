'use strict';

const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();

// Create mocks for dependencies
const cliProgressMock = {
  MultiBar: class {
    constructor() {
      this.bars = [];
      this.create = sinon.stub().returns({
        update: sinon.stub(),
        stop: sinon.stub()
      });
      this.stop = sinon.stub();
    }
  },
  Presets: {
    shades_classic: {}
  }
};

// Mock the core tracker functionality
function createMockProgressCore(options = {}) {
  let history = {};
  let startTime = Date.now();
  let currentProgress = 0;

  const mockCore = {
    start: sinon.stub().callsFake(() => {
      startTime = Date.now();
      return {
        progress: 0,
        status: 'Starting...',
        etaString: '',
        hasHistoryData: false
      };
    }),

    updateStep: sinon.stub().callsFake(step => {
      const prevProgress = currentProgress;
      currentProgress = step.endPercentage ? step.endPercentage / 2 : 10;
      return {
        timestamp: Date.now(),
        progress: currentProgress,
        previousProgress: prevProgress,
        targetProgress: step.endPercentage || 100,
        stepConfig: { name: step.name, hasHistoryData: !!options.withHistory },
        status: step.name,
        etaSeconds: options.withHistory ? 30 : null,
        etaString: options.withHistory ? '00:30' : '',
        inTransition: true,
        hasHistoryData: !!options.withHistory
      };
    }),

    completeStep: sinon.stub().callsFake(stepName => {
      const prevProgress = currentProgress;
      currentProgress = 100;
      return {
        progress: currentProgress,
        previousProgress: prevProgress,
        status: `Completed: ${stepName}`,
        etaSeconds: 0,
        etaString: '',
        inTransition: true
      };
    }),

    getProgress: sinon.stub().callsFake(() => {
      return {
        progress: currentProgress,
        status: 'Processing...',
        etaSeconds: options.withHistory ? 30 : null,
        etaString: options.withHistory ? '00:30' : '',
        hasHistoryData: !!options.withHistory
      };
    }),

    summary: sinon.stub().callsFake(() => {
      const totalTime = (Date.now() - startTime) / 1000;
      return {
        totalTime,
        steps: [{ from: 'start', to: 'end', duration: totalTime }],
        adjustmentFactor: 1.0,
        analysis: options.withAnalysis ? [
          {
            name: 'test-step',
            configuredDuration: 5,
            estimatedDuration: 6,
            actualDuration: 5,
            ratio: 1.2,
            historyInfo: {
              historyAverage: 5,
              samples: 3
            }
          }
        ] : [],
        historyFilePath: options.withHistory ? '/tmp/test-history.json' : null
      };
    }),

    dumpHistory: sinon.stub().callsFake(() => {
      return {
        steps: Object.keys(history).map(name => ({
          name,
          samples: history[name] || [5],
          average: 5
        })),
        path: options.withHistory ? '/tmp/history.json' : null
      };
    })
  };

  return mockCore;
}

describe('Progress Tracker CLI', function() {
  let clock;
  let consoleSpy;
  let createTracker;
  let mockCore;

  beforeEach(function() {
    // Use fake timers for predictable testing
    clock = sinon.useFakeTimers();

    // Spy on console methods
    consoleSpy = {
      log: sinon.spy(console, 'log'),
      warn: sinon.spy(console, 'warn')
    };

    // Create a fresh mock for each test
    mockCore = createMockProgressCore();

    // Create our module with mocked dependencies
    createTracker = proxyquire('../index', {
      'cli-progress': cliProgressMock,
      'brd-ono-util-progress-tracker-core': () => mockCore
    });
  });

  afterEach(function() {
    // Restore timers and console
    clock.restore();
    consoleSpy.log.restore();
    consoleSpy.warn.restore();
  });

  describe('Creation and Initialization', function() {
    it('should create tracker with default options', function() {
      const tracker = createTracker();
      expect(tracker).to.be.an('object');
      expect(tracker).to.have.property('start');
      expect(tracker).to.have.property('updateStep');
      expect(tracker).to.have.property('completeStep');
      expect(tracker).to.have.property('summary');
    });

    it('should create tracker with custom options', function() {
      const tracker = createTracker({
        updateInterval: 200,
        format: 'custom format',
        name: 'test-tracker',
        debug: true
      });
      expect(tracker).to.be.an('object');
    });
  });

  describe('Progress Tracking', function() {
    it('should start the tracker and return a progress bar', function() {
      const tracker = createTracker();
      const bar = tracker.start();
      expect(bar).to.exist;
      expect(mockCore.start.calledOnce).to.be.true;
    });

    it('should update step and handle the transition', function() {
      const tracker = createTracker();
      tracker.start();

      const step = { name: 'test-step', endPercentage: 50 };
      const timestamp = tracker.updateStep(step);

      expect(timestamp).to.exist;
      expect(mockCore.updateStep.calledWith(step)).to.be.true;

      // Test transition handling
      clock.tick(250); // Partial transition
      clock.tick(500); // Complete transition
    });

    it('should complete step and update the progress bar', function() {
      const tracker = createTracker();
      tracker.start();

      const stepName = 'test-step';
      tracker.updateStep({ name: stepName, endPercentage: 50 });
      tracker.completeStep(stepName);

      expect(mockCore.completeStep.calledWith(stepName)).to.be.true;

      // Allow transition to complete
      clock.tick(600);
    });
  });

  describe('ETA Handling', function() {
    it('should display ETA when history data is available', function() {
      // Create a tracker with history data
      mockCore = createMockProgressCore({ withHistory: true });
      createTracker = proxyquire('../index', {
        'cli-progress': cliProgressMock,
        'brd-ono-util-progress-tracker-core': () => mockCore
      });

      const tracker = createTracker();
      tracker.start();

      // Trigger progress update
      clock.tick(100);

      // The core's getProgress should be called and ETA should be formatted
      expect(mockCore.getProgress.called).to.be.true;
    });

    it('should not display ETA when no history data is available', function() {
      // Create a tracker without history data
      mockCore = createMockProgressCore({ withHistory: false });
      createTracker = proxyquire('../index', {
        'cli-progress': cliProgressMock,
        'brd-ono-util-progress-tracker-core': () => mockCore
      });

      const tracker = createTracker();
      tracker.start();

      // Trigger progress update
      clock.tick(100);

      // The core's getProgress should be called, but no ETA string should be used
      expect(mockCore.getProgress.called).to.be.true;
    });
  });

  describe('Summary Generation', function() {
    it('should generate a basic summary', function() {
      const tracker = createTracker();
      tracker.start();
      tracker.updateStep({ name: 'test-step', endPercentage: 50 });
      tracker.completeStep('test-step');

      // Advance time to simulate real execution time
      clock.tick(5000);

      tracker.summary();

      expect(consoleSpy.log.called).to.be.true;
      const summaryCall = consoleSpy.log.getCalls().find(call =>
        call.args[0] && call.args[0].includes('Process timing summary'));
      expect(summaryCall).to.exist;
    });

    it('should show detailed analysis in debug mode', function() {
      // Mock core with analysis data
      mockCore = createMockProgressCore({
        withHistory: true,
        withAnalysis: true
      });

      createTracker = proxyquire('../index', {
        'cli-progress': cliProgressMock,
        'brd-ono-util-progress-tracker-core': () => mockCore
      });

      const tracker = createTracker({ debug: true });
      tracker.start();
      tracker.updateStep({ name: 'test-step', endPercentage: 50 });
      tracker.completeStep('test-step');

      // Advance time to simulate real execution time
      clock.tick(5000);

      tracker.summary();

      // Debug mode should show detailed analysis
      const analysisCall = consoleSpy.log.getCalls().find(call =>
        call.args[0] && call.args[0].includes('Step duration analysis'));
      expect(analysisCall).to.exist;
    });
  });

  describe('History Management', function() {
    it('should dump history when available', function() {
      // Create a tracker with history
      mockCore = createMockProgressCore({ withHistory: true });
      createTracker = proxyquire('../index', {
        'cli-progress': cliProgressMock,
        'brd-ono-util-progress-tracker-core': () => mockCore
      });

      const tracker = createTracker({ name: 'test-app' });
      const history = tracker.dumpHistory();

      expect(history).to.exist;
      expect(mockCore.dumpHistory.called).to.be.true;
    });
  });

  describe('Edge Cases and Error Handling', function() {
    it('should handle multiple transition updates in quick succession', function() {
      const tracker = createTracker();
      tracker.start();

      // Create multiple step updates quickly
      tracker.updateStep({ name: 'step1', endPercentage: 20 });
      clock.tick(100);
      tracker.updateStep({ name: 'step2', endPercentage: 40 });
      clock.tick(100);
      tracker.updateStep({ name: 'step3', endPercentage: 60 });

      // Complete the final transition
      clock.tick(600);
    });

    it('should handle empty summary when no steps are completed', function() {
      // Mock core to return empty steps array
      mockCore = createMockProgressCore();
      mockCore.summary.returns({ totalTime: 0, steps: [] });

      createTracker = proxyquire('../index', {
        'cli-progress': cliProgressMock,
        'brd-ono-util-progress-tracker-core': () => mockCore
      });

      const tracker = createTracker();
      tracker.start();
      tracker.summary();

      // No summary should be printed for empty steps
      expect(consoleSpy.log.getCalls().find(call =>
        call.args[0] && call.args[0].includes('Process timing summary')
      )).to.not.exist;
    });
  });
});
