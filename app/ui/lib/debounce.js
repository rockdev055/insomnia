import {DEBOUNCE_MILLIS} from 'backend/constants';

export function debounce (callback) {
  let timeout = null;
  return function () {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      callback.apply(null, arguments)
    }, DEBOUNCE_MILLIS);
  }
}
