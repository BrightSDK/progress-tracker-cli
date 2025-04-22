// LICENSE_CODE ZON
'use strict';
const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('Progress Tracker CLI', function() {
  let createProgressTrackerCLI, coreStub, cliProgressStub, progressTracker, barInstance;
  let clock;

  beforeEach(function() {
    // Create bar instance stub
    barInstance = {
      update: sinon.stub(),
      stop: sinon.stub()
    };

    // Create CLI progress stub
    cliProgressStub = {
      MultiBar: sinon.stub().returns({
        create: sinon.stub().returns(barInstance),
        stop: sinon.stub()
      }),
      Presets: {
        shades_classic: {}
      }
    };

    // Create core stub with all methods
    coreStub = {
      start: sinon.stub().returns({
        progress: 0,
        status: 'Starting...',
        etaString: ''
      }),
      updateStep: sinon.stub().returns({
        progress: 10,
        previousProgress: 0,
        status: 'Test Step'
      }),
      completeStep: sinon.stub().returns({
        progress: 50,
        previousProgress: 10,
        status: 'Completed'
      }),
      getProgress: sinon.stub().returns({
        progress: 25,
        status: 'In progress',
        etaString: '01:30',
        hasHistoryData: true
      }),
      summary: sinon.stub().returns({
        totalTime: 10,
        steps: [{ from: 'start', to: 'step1', duration: 5 }],
        adjustmentFactor: 1.2,
        analysis: [{ name: 'step1', estimatedDuration: 10, actualDuration: 8 }]
      }),
      dumpHistory: sinon.stub().returns({
        steps: [{ name: 'step1', average: 5 }],
        path: '/tmp/history.json'
      }),
      cleanHistory: sinon.stub().returns({
        success: true,
        message: 'History cleaned successfully'
      })
    };

    // Mock console methods
    sinon.stub(console, 'log');
    sinon.stub(console, 'error');

    // Create sinon fake timers to control time
    clock = sinon.useFakeTimers();

    // Mock the dependencies
    createProgressTrackerCLI = proxyquire('../src/main', {
      'cli-progress': cliProgressStub,
      'brd-ono-util-progress-tracker-core': () => coreStub
    });

    // Create a tracker instance for tests
    progressTracker = createProgressTrackerCLI({ name: 'test-app' });
  });

  afterEach(function() {
    sinon.restore();
  });

  describe('Initialization', function() {
    it('should create a CLI progress tracker with default values', function() {
      expect(progressTracker).to.be.an('object');
    });

    it('should start tracking and create progress bar', function() {
      progressTracker.start();
      expect(coreStub.start.calledOnce).to.be.true;
      expect(cliProgressStub.MultiBar.called).to.be.true;
    });
  });

  describe('Step Management', function() {
    beforeEach(function() {
      progressTracker.start();
    });

    it('should update to a new step', function() {
      const step = { name: 'test-step', endPercentage: 50 };
      progressTracker.updateStep(step);

      expect(coreStub.updateStep.calledWith(step)).to.be.true;
      expect(barInstance.update.called).to.be.true;
    });

    it('should transition between steps smoothly', function() {
      progressTracker.updateStep({ name: 'step1', endPercentage: 50 });

      // Fast-forward through animation duration
      clock.tick(600);

      expect(barInstance.update.callCount).to.be.gt(1);
    });

    it('should complete a step', function() {
      // Setup the step first, otherwise the completeStep might not have a valid step to complete
      const testStep = 'step1';

      // First update the step to ensure it exists
      progressTracker.updateStep({ name: testStep, endPercentage: 50 });

      // Then complete the step
      progressTracker.completeStep(testStep);

      // Verify the core completeStep was called
      expect(coreStub.completeStep.calledWith(testStep)).to.be.true;

      // Complete transition
      clock.tick(600);

      // Should update the progress bar
      expect(barInstance.update.called).to.be.true;
    });

    it('should handle step completion', function() {
      const testStep = 'step1';

      // First call the completeStep method
      progressTracker.completeStep(testStep);

      // Then check if the core's completeStep method was called
      expect(coreStub.completeStep.calledWith(testStep)).to.be.true;
    });

    it('should properly pass step completion to core with run session tracking', function() {
      // Setup step completion sequence
      const testStep = 'step1';

      // First update the step
      progressTracker.updateStep({ name: testStep, endPercentage: 50 });
      // Then complete it (core will handle the run session tracking)
      progressTracker.completeStep(testStep);

      // Verify core methods were called with correct parameters
      expect(coreStub.updateStep.calledWith(sinon.match({ name: testStep }))).to.be.true;
      expect(coreStub.completeStep.calledWith(testStep)).to.be.true;

      // Complete the same step again - should still call core methods
      progressTracker.completeStep(testStep);
      expect(coreStub.completeStep.calledTwice).to.be.true;

      // Both calls should have the same step name
      const firstCall = coreStub.completeStep.getCall(0).args[0];
      const secondCall = coreStub.completeStep.getCall(1).args[0];
      expect(firstCall).to.equal(secondCall);
    });
  });

  describe('Progress Updates', function() {
    beforeEach(function() {
      progressTracker.start();
    });

    it('should update progress periodically', function() {
      // Trigger interval update
      clock.tick(100);

      expect(coreStub.getProgress.called).to.be.true;
      expect(barInstance.update.called).to.be.true;
    });

    it('should handle smooth transitions', function() {
      // Set up transition state
      progressTracker.updateStep({ name: 'step1', endPercentage: 50 });

      // Partial tick through transition
      clock.tick(250); // Half of transition duration

      // Progress should be updated with intermediate value
      expect(barInstance.update.called).to.be.true;
    });
  });

  describe('Progress Updates with History', function() {
    it('should handle history-based ETA updates', function() {
      progressTracker.start();

      // Simulate having history data
      coreStub.getProgress.returns({
        progress: 25,
        status: 'In progress',
        etaString: '01:30',
        hasHistoryData: true
      });

      // Trigger an update
      clock.tick(1100); // More than etaUpdateInterval

      // ETA should be displayed
      expect(barInstance.update.calledWith(sinon.match.number, sinon.match({
        etaString: '01:30',
        etaDisplay: sinon.match(/ETA:/)
      }))).to.be.true;

      // Now simulate no history
      coreStub.getProgress.returns({
        progress: 30,
        status: 'Still working',
        etaString: '',
        hasHistoryData: false
      });

      // Trigger another update
      clock.tick(1100);

      // Should update without ETA display
      const lastCall = barInstance.update.lastCall;
      if (lastCall.args.length > 1) {
        expect(lastCall.args[1].etaDisplay).to.equal('');
      }
    });
  });

  describe('Summary Generation', function() {
    beforeEach(function() {
      progressTracker.start();
    });

    it('should display summary', function() {
      progressTracker.summary();

      expect(coreStub.summary.calledOnce).to.be.true;
      expect(console.log.called).to.be.true;
      expect(cliProgressStub.MultiBar().stop.calledOnce).to.be.true;
    });

    it('should skip summary when disabled', function() {
      progressTracker = createProgressTrackerCLI({
        name: 'test-app',
        summary: false
      });

      progressTracker.start();
      progressTracker.summary();

      expect(coreStub.summary.called).to.be.false;
      expect(console.log.called).to.be.false;
    });

    it('should show detailed summary when enabled', function() {
      progressTracker = createProgressTrackerCLI({
        name: 'test-app',
        debug: true,
        summary: { detailed: true }
      });

      progressTracker.start();
      progressTracker.summary();

      // Should have more console.log calls for detailed output
      expect(console.log.callCount).to.be.gt(3);
    });
  });

  describe('History Management', function() {
    it('should expose history functionality', function() {
      // Check if history methods are properly exposed
      expect(progressTracker.dumpHistory).to.be.a('function');
      expect(progressTracker.cleanHistory).to.be.a('function');
    });

    it('should clean history when requested', function() {
      const result = progressTracker.cleanHistory('test-app');

      expect(coreStub.cleanHistory.calledWith('test-app')).to.be.true;
      expect(result.success).to.be.true;
    });

    it('should handle missing cleanHistory method in core', function() {
      // Create version without cleanHistory
      const oldCoreStub = { ...coreStub };
      delete oldCoreStub.cleanHistory;

      createProgressTrackerCLI = proxyquire('../src/main', {
        'cli-progress': cliProgressStub,
        'brd-ono-util-progress-tracker-core': () => oldCoreStub
      });

      const oldTracker = createProgressTrackerCLI({ name: 'test-app' });
      const result = oldTracker.cleanHistory('test-app');

      expect(result.success).to.be.false;
      expect(result.message).to.include('not available');
    });
  });
});