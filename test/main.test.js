// LICENSE_CODE ZON
'use strict';
const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('Progress Tracker CLI', function () {
  let createProgressTrackerCLI,
    coreStub,
    cliProgressStub,
    progressTracker,
    barInstance;
  let clock;

  beforeEach(function () {
    // Create bar instance stub
    barInstance = {
      update: sinon.stub(),
      stop: sinon.stub(),
    };

    // Create CLI progress stub
    cliProgressStub = {
      MultiBar: sinon.stub().returns({
        create: sinon.stub().returns(barInstance),
        stop: sinon.stub(),
      }),
      Presets: {
        shades_classic: {},
      },
    };

    // Create core stub with all methods
    coreStub = {
      start: sinon.stub().returns({
        progress: 0,
        status: 'Starting...',
        etaString: '',
      }),
      updateStep: sinon.stub().returns({
        progress: 10,
        previousProgress: 0,
        status: 'Test Step',
      }),
      // Replace completeStep with finish
      finish: sinon.stub().returns({
        progress: 100,
        status: 'Completed',
        etaSeconds: 0,
        etaString: '',
      }),
      getProgress: sinon.stub().returns({
        progress: 25,
        status: 'In progress',
        etaString: '01:30',
        hasHistoryData: true,
      }),
      summary: sinon.stub().returns({
        totalTime: 10,
        steps: [
          {
            name: 'step1',
            startPercentage: 0,
            endPercentage: 50,
            actualDuration: 5,
          },
        ],
        historyFilePath: '/tmp/history.json',
      }),
      cleanHistory: sinon.stub().returns({
        success: true,
        message: 'History cleaned successfully',
      }),
      getHistoryInfo: sinon.stub().returns({
        directory: '/tmp',
        currentAppHistoryPath: '/tmp/history.json',
        currentAppName: 'test-app',
      }),
      resetSession: sinon.stub(),
    };

    // Mock console methods
    sinon.stub(console, 'log');
    sinon.stub(console, 'error');
    sinon.stub(console, 'warn');

    // Create sinon fake timers to control time
    clock = sinon.useFakeTimers();

    // Mock the dependencies
    createProgressTrackerCLI = proxyquire('../src/main', {
      'cli-progress': cliProgressStub,
      'brd-ono-util-progress-tracker-core': () => coreStub,
    });

    // Create a tracker instance for tests
    progressTracker = createProgressTrackerCLI({ name: 'test-app' });
  });

  afterEach(function () {
    sinon.restore();
  });

  describe('Initialization', function () {
    it('should create a CLI progress tracker with default values', function () {
      expect(progressTracker).to.be.an('object');
    });

    it('should start tracking and create progress bar', function () {
      progressTracker.start();
      expect(coreStub.start.calledOnce).to.be.true;
      expect(cliProgressStub.MultiBar.called).to.be.true;
    });
  });

  describe('Step Management', function () {
    beforeEach(function () {
      progressTracker.start();
    });

    it('should update to a new step', function () {
      const step = { name: 'test-step', endPercentage: 50 };
      progressTracker.updateStep(step);

      expect(coreStub.updateStep.calledWith(step)).to.be.true;
      expect(barInstance.update.called).to.be.true;
    });

    it('should transition between steps smoothly', function () {
      progressTracker.updateStep({ name: 'step1', endPercentage: 50 });

      // Fast-forward through animation duration
      clock.tick(600);

      expect(barInstance.update.callCount).to.be.gt(1);
    });

    it('should handle backward compatibility with "to" property', function () {
      const step = { name: 'test-step', to: 50 };
      progressTracker.updateStep(step);

      // Should convert 'to' to 'endPercentage'
      expect(
        coreStub.updateStep.calledWith(
          sinon.match({
            name: 'test-step',
            endPercentage: 50,
          }),
        ),
      ).to.be.true;
    });
  });

  describe('Completion', function () {
    beforeEach(function () {
      progressTracker.start();
    });

    it('should finish with default message', function () {
      progressTracker.finish();

      expect(coreStub.finish.calledOnce).to.be.true;
      expect(barInstance.update.called).to.be.true;
      expect(barInstance.update.calledWith(100)).to.be.true;
    });

    it('should finish with custom message', function () {
      const customMessage = 'Custom complete message';

      // Set up the stub to return customized response
      coreStub.finish.returns({
        progress: 100,
        status: customMessage,
        etaSeconds: 0,
        etaString: '',
      });

      progressTracker.finish({ message: customMessage });

      expect(coreStub.finish.calledOnce).to.be.true;
      expect(coreStub.finish.firstCall.args[0]).to.deep.include({
        status: customMessage,
      });

      expect(
        barInstance.update.calledWith(
          100,
          sinon.match({
            status: customMessage,
          }),
        ),
      ).to.be.true;
    });

    it('should automatically show summary when requested', function () {
      // Spy on summary method
      const summarySpy = sinon.spy(progressTracker, 'summary');

      progressTracker.finish({ showSummary: true });

      // Fast-forward past the setTimeout delay
      clock.tick(150);

      expect(summarySpy.calledOnce).to.be.true;
    });

    it('should clean up interval on finish', function () {
      // First ensure interval is created
      clock.tick(100);
      expect(coreStub.getProgress.called).to.be.true;

      // Reset call count
      coreStub.getProgress.resetHistory();

      // Finish should clear interval
      progressTracker.finish();

      // Tick again - shouldn't call getProgress now
      clock.tick(200);
      expect(coreStub.getProgress.called).to.be.false;
    });
  });

  describe('Progress Updates', function () {
    beforeEach(function () {
      progressTracker.start();
    });

    it('should update progress periodically', function () {
      // Trigger interval update
      clock.tick(100);

      expect(coreStub.getProgress.called).to.be.true;
      expect(barInstance.update.called).to.be.true;
    });

    it('should handle smooth transitions', function () {
      // Set up transition state
      progressTracker.updateStep({ name: 'step1', endPercentage: 50 });

      // Partial tick through transition
      clock.tick(250); // Half of transition duration

      // Progress should be updated with intermediate value
      expect(barInstance.update.called).to.be.true;
    });
  });

  describe('Progress Updates with History', function () {
    it('should handle history-based ETA updates', function () {
      progressTracker.start();

      // Simulate having history data
      coreStub.getProgress.returns({
        progress: 25,
        status: 'In progress',
        etaString: '01:30',
        hasHistoryData: true,
      });

      // Trigger an update
      clock.tick(1100); // More than etaUpdateInterval

      // ETA should be displayed
      expect(
        barInstance.update.calledWith(
          sinon.match.number,
          sinon.match({
            etaString: '01:30',
            etaDisplay: sinon.match(/ETA:/),
          }),
        ),
      ).to.be.true;

      // Now simulate no history
      coreStub.getProgress.returns({
        progress: 30,
        status: 'Still working',
        etaString: '',
        hasHistoryData: false,
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

  describe('Summary Generation', function () {
    beforeEach(function () {
      progressTracker.start();
    });

    it('should display summary', function () {
      progressTracker.summary();

      expect(coreStub.summary.calledOnce).to.be.true;
      expect(console.log.called).to.be.true;
      expect(cliProgressStub.MultiBar().stop.calledOnce).to.be.true;
    });

    it('should skip summary when disabled', function () {
      progressTracker = createProgressTrackerCLI({
        name: 'test-app',
        summary: false,
      });

      progressTracker.start();
      progressTracker.summary();

      expect(coreStub.summary.called).to.be.false;
      expect(console.log.called).to.be.false;
    });

    it('should show detailed summary when enabled', function () {
      progressTracker = createProgressTrackerCLI({
        name: 'test-app',
        debug: true,
        summary: { detailed: true },
      });

      progressTracker.start();
      progressTracker.summary();

      // Should have more console.log calls for detailed output
      expect(console.log.callCount).to.be.gt(3);
    });
  });

  describe('History Management', function () {
    it('should expose history functionality', function () {
      // Check if history methods are properly exposed
      expect(progressTracker.cleanHistory).to.be.a('function');
      expect(progressTracker.getHistoryInfo).to.be.a('function');
    });

    it('should clean history when requested', function () {
      const result = progressTracker.cleanHistory('test-app');

      expect(coreStub.cleanHistory.calledWith('test-app')).to.be.true;
      expect(result.success).to.be.true;
    });

    it('should handle missing cleanHistory method in core', function () {
      // Create version without cleanHistory
      const oldCoreStub = { ...coreStub };
      delete oldCoreStub.cleanHistory;

      createProgressTrackerCLI = proxyquire('../src/main', {
        'cli-progress': cliProgressStub,
        'brd-ono-util-progress-tracker-core': () => oldCoreStub,
      });

      const oldTracker = createProgressTrackerCLI({ name: 'test-app' });
      const result = oldTracker.cleanHistory('test-app');

      expect(result.success).to.be.false;
      expect(result.message).to.include('not available');
    });

    it('should get history information', function () {
      const result = progressTracker.getHistoryInfo();

      expect(coreStub.getHistoryInfo.calledOnce).to.be.true;
      expect(result).to.be.an('object');
      expect(result.currentAppName).to.equal('test-app');
    });
  });

  describe('Stop and Cleanup', function () {
    beforeEach(function () {
      progressTracker.start();
    });

    it('should stop and clean up resources', function () {
      // First ensure interval is created
      clock.tick(100);
      expect(coreStub.getProgress.called).to.be.true;

      // Stop should clean up
      progressTracker.stop();

      // Verify multibar was stopped
      expect(cliProgressStub.MultiBar().stop.calledOnce).to.be.true;

      // Reset call history
      coreStub.getProgress.resetHistory();

      // Tick again - shouldn't call getProgress
      clock.tick(200);
      expect(coreStub.getProgress.called).to.be.false;
    });

    it('should handle stop errors gracefully', function () {
      // Reset console.error spy before this test
      console.error.resetHistory();

      // Make multiBar.stop throw an error
      cliProgressStub.MultiBar().stop.throws(new Error('Test error'));

      // Should not throw when called
      expect(() => progressTracker.stop()).not.to.throw();

      // Should log error unconditionally (regardless of debug flag)
      expect(console.error.calledOnce).to.be.true;
      expect(console.error.firstCall.args[0]).to.equal(
        'Error stopping progress tracker:',
      );
      expect(console.error.firstCall.args[1]).to.equal('Test error');
    });
  });
});
