/**
 * Unit tests for X-Ray tracer utilities
 */

// Mock subsegment object
const mockSubsegment = {
  close: jest.fn(),
  addMetadata: jest.fn(),
  addAnnotation: jest.fn(),
  addError: jest.fn(),
};

// Mock AWSXRay - segment starts undefined, can be set per test
let mockSegment: {
  addNewSubsegment: jest.Mock;
  trace_id?: string;
  id?: string;
} | null = null;

jest.mock('aws-xray-sdk-core', () => ({
  __esModule: true,
  default: {
    getSegment: jest.fn(() => mockSegment),
  },
}));

import AWSXRay from 'aws-xray-sdk-core';
import {
  createSubsegment,
  closeSubsegment,
  traceFunction,
  traceAgentStep,
  addQueryMetadata,
  addRetrievalMetadata,
  addGenerationMetadata,
  addResponseMetadata,
  getTraceId,
  getSegmentId,
} from '../../src/lib/tracer';

const mockGetSegment = AWSXRay.getSegment as jest.Mock;

describe('Tracer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSegment = null;
    mockSubsegment.close.mockReset();
    mockSubsegment.addMetadata.mockReset();
    mockSubsegment.addAnnotation.mockReset();
    mockSubsegment.addError.mockReset();
  });

  describe('createSubsegment', () => {
    it('should_returnUndefined_when_noActiveSegment', () => {
      mockGetSegment.mockReturnValue(null);
      const result = createSubsegment('test-segment');
      expect(result).toBeUndefined();
    });

    it('should_returnSubsegment_when_segmentExists', () => {
      mockSegment = {
        addNewSubsegment: jest.fn().mockReturnValue(mockSubsegment),
      };
      mockGetSegment.mockReturnValue(mockSegment);

      const result = createSubsegment('my-op');
      expect(mockSegment.addNewSubsegment).toHaveBeenCalledWith('my-op');
      expect(result).toBe(mockSubsegment);
    });
  });

  describe('closeSubsegment', () => {
    it('should_doNothing_when_subsegmentUndefined', () => {
      expect(() => closeSubsegment(undefined)).not.toThrow();
    });

    it('should_closeSubsegment_when_subsegmentProvided', () => {
      closeSubsegment(mockSubsegment as unknown as AWSXRay.Subsegment);
      expect(mockSubsegment.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('traceFunction', () => {
    it('should_executeAndReturnResult_when_noSegment', async () => {
      mockGetSegment.mockReturnValue(null);
      const fn = jest.fn().mockResolvedValue('result');
      const result = await traceFunction('op', fn);
      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should_addMetadataAndClose_when_segmentExists', async () => {
      mockSegment = {
        addNewSubsegment: jest.fn().mockReturnValue(mockSubsegment),
      };
      mockGetSegment.mockReturnValue(mockSegment);
      const fn = jest.fn().mockResolvedValue(42);

      const result = await traceFunction('op', fn, { key: 'value' });
      expect(result).toBe(42);
      expect(mockSubsegment.addMetadata).toHaveBeenCalledWith('key', 'value');
      expect(mockSubsegment.close).toHaveBeenCalledTimes(1);
    });

    it('should_addErrorAndRethrow_when_fnThrows', async () => {
      mockSegment = {
        addNewSubsegment: jest.fn().mockReturnValue(mockSubsegment),
      };
      mockGetSegment.mockReturnValue(mockSegment);
      const err = new Error('boom');
      const fn = jest.fn().mockRejectedValue(err);

      await expect(traceFunction('op', fn)).rejects.toThrow('boom');
      expect(mockSubsegment.addError).toHaveBeenCalledWith(err);
      expect(mockSubsegment.close).toHaveBeenCalledTimes(1);
    });

    it('should_rethrow_when_fnThrowsNonError', async () => {
      mockSegment = {
        addNewSubsegment: jest.fn().mockReturnValue(mockSubsegment),
      };
      mockGetSegment.mockReturnValue(mockSegment);
      const fn = jest.fn().mockRejectedValue('string-error');

      await expect(traceFunction('op', fn)).rejects.toBe('string-error');
      // addError should NOT be called since it's not an Error instance
      expect(mockSubsegment.addError).not.toHaveBeenCalled();
    });

    it('should_notAddMetadata_when_noMetadataArg', async () => {
      mockSegment = {
        addNewSubsegment: jest.fn().mockReturnValue(mockSubsegment),
      };
      mockGetSegment.mockReturnValue(mockSegment);
      const fn = jest.fn().mockResolvedValue('ok');

      await traceFunction('op', fn);
      expect(mockSubsegment.addMetadata).not.toHaveBeenCalled();
    });
  });

  describe('traceAgentStep', () => {
    it('should_doNothing_when_noSubsegment', () => {
      expect(() => traceAgentStep(1, 'thought', undefined)).not.toThrow();
    });

    it('should_addAnnotations_when_subsegmentProvided', () => {
      traceAgentStep(
        2,
        'action',
        mockSubsegment as unknown as AWSXRay.Subsegment
      );
      expect(mockSubsegment.addAnnotation).toHaveBeenCalledWith(
        'agent_step',
        2
      );
      expect(mockSubsegment.addAnnotation).toHaveBeenCalledWith(
        'agent_type',
        'action'
      );
    });
  });

  describe('addQueryMetadata', () => {
    it('should_doNothing_when_noSubsegment', () => {
      expect(() => addQueryMetadata(undefined, 'query')).not.toThrow();
    });

    it('should_addMetadata_when_subsegmentProvided', () => {
      addQueryMetadata(
        mockSubsegment as unknown as AWSXRay.Subsegment,
        'Who was Karna?'
      );
      expect(mockSubsegment.addMetadata).toHaveBeenCalledWith(
        'query_length',
        14
      );
      expect(mockSubsegment.addMetadata).toHaveBeenCalledWith(
        'query_preview',
        'Who was Karna?'
      );
    });

    it('should_addDecompositionAnnotation_when_decompositionProvided', () => {
      addQueryMetadata(
        mockSubsegment as unknown as AWSXRay.Subsegment,
        'query',
        { needsDecomposition: true, subQueries: ['q1', 'q2'] }
      );
      expect(mockSubsegment.addAnnotation).toHaveBeenCalledWith(
        'needs_decomposition',
        true
      );
      expect(mockSubsegment.addMetadata).toHaveBeenCalledWith(
        'subquery_count',
        2
      );
    });
  });

  describe('addRetrievalMetadata', () => {
    it('should_doNothing_when_noSubsegment', () => {
      expect(() => addRetrievalMetadata(undefined, 5, 0.9, 100)).not.toThrow();
    });

    it('should_addAnnotationsAndMetadata_when_subsegmentProvided', () => {
      addRetrievalMetadata(
        mockSubsegment as unknown as AWSXRay.Subsegment,
        5,
        0.9,
        150
      );
      expect(mockSubsegment.addAnnotation).toHaveBeenCalledWith(
        'retrieval_results',
        5
      );
      expect(mockSubsegment.addMetadata).toHaveBeenCalledWith(
        'retrieval_top_score',
        90
      );
      expect(mockSubsegment.addMetadata).toHaveBeenCalledWith(
        'retrieval_duration_ms',
        150
      );
    });
  });

  describe('addGenerationMetadata', () => {
    it('should_doNothing_when_noSubsegment', () => {
      expect(() =>
        addGenerationMetadata(undefined, 100, 50, 200)
      ).not.toThrow();
    });

    it('should_addAnnotationsWithoutModelId_when_modelIdOmitted', () => {
      addGenerationMetadata(
        mockSubsegment as unknown as AWSXRay.Subsegment,
        100,
        50,
        200
      );
      expect(mockSubsegment.addAnnotation).toHaveBeenCalledWith(
        'input_tokens',
        100
      );
      expect(mockSubsegment.addAnnotation).toHaveBeenCalledWith(
        'output_tokens',
        50
      );
      expect(mockSubsegment.addMetadata).toHaveBeenCalledWith(
        'generation_duration_ms',
        200
      );
      expect(mockSubsegment.addMetadata).not.toHaveBeenCalledWith(
        'model_id',
        expect.anything()
      );
    });

    it('should_addModelId_when_modelIdProvided', () => {
      addGenerationMetadata(
        mockSubsegment as unknown as AWSXRay.Subsegment,
        100,
        50,
        200,
        'amazon.nova-pro-v1:0'
      );
      expect(mockSubsegment.addMetadata).toHaveBeenCalledWith(
        'model_id',
        'amazon.nova-pro-v1:0'
      );
    });
  });

  describe('addResponseMetadata', () => {
    it('should_doNothing_when_noSubsegment', () => {
      expect(() =>
        addResponseMetadata(undefined, 500, 3, 2, true)
      ).not.toThrow();
    });

    it('should_addAllAnnotations_when_subsegmentProvided', () => {
      addResponseMetadata(
        mockSubsegment as unknown as AWSXRay.Subsegment,
        500,
        3,
        2,
        true
      );
      expect(mockSubsegment.addAnnotation).toHaveBeenCalledWith(
        'answer_length',
        500
      );
      expect(mockSubsegment.addAnnotation).toHaveBeenCalledWith(
        'citation_count',
        3
      );
      expect(mockSubsegment.addAnnotation).toHaveBeenCalledWith(
        'agent_iterations',
        2
      );
      expect(mockSubsegment.addAnnotation).toHaveBeenCalledWith(
        'passed_reflection',
        true
      );
    });
  });

  describe('getTraceId', () => {
    it('should_returnUndefined_when_noSegment', () => {
      mockGetSegment.mockReturnValue(null);
      expect(getTraceId()).toBeUndefined();
    });

    it('should_returnTraceId_when_segmentHasTraceId', () => {
      mockGetSegment.mockReturnValue({ trace_id: 'trace-abc-123' });
      expect(getTraceId()).toBe('trace-abc-123');
    });

    it('should_returnUndefined_when_segmentHasNoTraceId', () => {
      mockGetSegment.mockReturnValue({ some_other_field: 'value' });
      expect(getTraceId()).toBeUndefined();
    });
  });

  describe('getSegmentId', () => {
    it('should_returnUndefined_when_noSegment', () => {
      mockGetSegment.mockReturnValue(null);
      expect(getSegmentId()).toBeUndefined();
    });

    it('should_returnSegmentId_when_segmentHasId', () => {
      mockGetSegment.mockReturnValue({ id: 'seg-xyz' });
      expect(getSegmentId()).toBe('seg-xyz');
    });

    it('should_returnUndefined_when_segmentHasNoId', () => {
      mockGetSegment.mockReturnValue({ trace_id: 'only-trace' });
      expect(getSegmentId()).toBeUndefined();
    });
  });
});
