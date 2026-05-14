import { TestBed } from '@angular/core/testing';

import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;
  let uuidCounter = 0;

  beforeEach(() => {
    uuidCounter = 0;
    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: () => `uuid-${++uuidCounter}` },
      configurable: true,
    });
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
    jest.useFakeTimers();
  });

  afterEach(() => jest.useRealTimers());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should add a toast on show()', () => {
    service.show('Hello', 'info');
    expect(service.toasts().length).toBe(1);
    expect(service.toasts()[0].message).toBe('Hello');
    expect(service.toasts()[0].type).toBe('info');
  });

  it('should auto-dismiss toast after duration', () => {
    service.show('Auto-dismiss', 'success', 1000);
    expect(service.toasts().length).toBe(1);
    jest.advanceTimersByTime(1001);
    expect(service.toasts().length).toBe(0);
  });

  it('should dismiss a specific toast by id', () => {
    service.show('First', 'info');
    service.show('Second', 'warn');
    const firstId = service.toasts()[0].id;
    service.dismiss(firstId);
    expect(service.toasts().length).toBe(1);
    expect(service.toasts()[0].message).toBe('Second');
  });

  it('should use 4000ms default duration', () => {
    service.success('Done!');
    expect(service.toasts().length).toBe(1);
    jest.advanceTimersByTime(3999);
    expect(service.toasts().length).toBe(1);
    jest.advanceTimersByTime(2);
    expect(service.toasts().length).toBe(0);
  });

  it('should use 6000ms for error toasts', () => {
    service.error('Oops');
    jest.advanceTimersByTime(5999);
    expect(service.toasts().length).toBe(1);
    jest.advanceTimersByTime(2);
    expect(service.toasts().length).toBe(0);
  });

  it('should add a warn toast with type warn', () => {
    service.warn('Watch out');
    expect(service.toasts().length).toBe(1);
    expect(service.toasts()[0].type).toBe('warn');
    expect(service.toasts()[0].message).toBe('Watch out');
  });

  it('should default to info type when no type provided', () => {
    service.show('Plain message');
    expect(service.toasts()[0].type).toBe('info');
  });
});
