import path from 'path';
import fs from 'fs';
import LocalStorage from '../localstorage';

describe('LocalStorage()', () => {
  beforeEach(() => {
    jest.useFakeTimers();

    // There has to be a better way to reset this...
    setTimeout.mock.calls = [];
  });

  it('create directory', () => {
    const basePath = `/tmp/insomnia-localstorage-${Math.random()}`;
    new LocalStorage(basePath);
    const dir = fs.readdirSync(basePath);
    expect(dir.length).toEqual(0);
  });

  it('does basic operations', () => {
    const basePath = `/tmp/insomnia-localstorage-${Math.random()}`;
    const localStorage = new LocalStorage(basePath);
    localStorage.setItem('foo', 'bar');
    expect(localStorage.getItem('foo', 'BAD')).toBe('bar');
  });

  it('stores a key', () => {
    const basePath = `/tmp/insomnia-localstorage-${Math.random()}`;
    const localStorage = new LocalStorage(basePath);
    localStorage.setItem('foo', 'bar');

    // Assert timeouts are called
    expect(setTimeout.mock.calls.length).toBe(1);
    expect(setTimeout.mock.calls[0][1]).toBe(100);

    // Force debouncer to flush
    jest.runAllTimers();

    // Assert there is one item stored
    expect(fs.readdirSync(basePath).length).toEqual(1);

    // Assert the contents are correct
    const contents = fs.readFileSync(path.join(basePath, 'foo'), 'utf8');
    expect(contents).toEqual('"bar"');
  });

  it('debounces key sets', () => {
    const basePath = `/tmp/insomnia-localstorage-${Math.random()}`;
    const localStorage = new LocalStorage(basePath);
    localStorage.setItem('foo', 'bar1');
    localStorage.setItem('another', 10);
    localStorage.setItem('foo', 'bar3');

    // Assert timeouts are called
    expect(setTimeout.mock.calls.length).toBe(3);
    expect(setTimeout.mock.calls[0][1]).toBe(100);
    expect(setTimeout.mock.calls[1][1]).toBe(100);
    expect(setTimeout.mock.calls[2][1]).toBe(100);

    expect(fs.readdirSync(basePath).length).toEqual(0);

    // Force flush
    jest.runAllTimers();

    // Make sure only one item exists
    expect(fs.readdirSync(basePath).length).toEqual(2);
    expect(fs.readFileSync(path.join(basePath, 'foo'), 'utf8')).toEqual('"bar3"');
    expect(fs.readFileSync(path.join(basePath, 'another'), 'utf8')).toEqual('10');
  });
});
