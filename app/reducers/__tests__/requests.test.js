jest.unmock('../requests');
jest.unmock('../../constants/actionTypes');

import reducer from '../requests';
import * as types from '../../constants/actionTypes';

describe('Requests Reducer', () => {
  var initialState;
  var request;

  beforeEach(() => {
    initialState = {
      all: [],
      active: null
    };
    
    request = {
      _mode: 'json',
      id: 'req_1234567890',
      created: Date.now(),
      modified: Date.now(),
      name: 'My Request',
      method: 'GET',
      body: '{"foo": "bar"}',
      authentication: {username: 'user', password: 'secret'},
      params: [{name: 'page', value: '3'}],
      headers: [{name: 'Content-Type', value: 'application/json'}]
    };
  });

  it('returns initial state', () => {
    expect(
      reducer(undefined, {})
    ).toEqual(initialState);
  });

  it('returns initial same state with unknown action', () => {
    const state = {foo: 'bar'};
    expect(
      reducer(state, {type: '__INVALID__'})
    ).toBe(state);
  });

  it('should add request', () => {
    expect(
      reducer(undefined, {
        type: types.REQUEST_ADD,
        request: request
      })
    ).toEqual({
      all: [request],
      active: request
    });
  });

  it('should update request', () => {
    const state = reducer(undefined, {
      type: types.REQUEST_ADD,
      request: request
    });

    const newRequest = Object.assign(
      {}, request, {name: 'New Name'}
    );

    expect(reducer(state, {
      type: types.REQUEST_UPDATE,
      request: newRequest
    })).toEqual({
      all: [newRequest],
      active: newRequest
    });
  });
  
  it('should not update unknown request', () => {
    expect(reducer(initialState, {
      type: types.REQUEST_UPDATE,
      request: request
    })).toEqual(initialState);
  });
  
  it('should activate request', () => {
    initialState.all = [request];
    initialState.active = null;
    
    expect(reducer(initialState, {
      type: types.REQUEST_ACTIVATE,
      request: request
    })).toEqual({
      all: [request],
      active: request
    });
  });
  
  it('should not activate invalid request', () => {
    initialState.all = [request];
    initialState.active = null;

    expect(reducer(initialState, {
      type: types.REQUEST_ACTIVATE
    })).toEqual(initialState);
  });
});
