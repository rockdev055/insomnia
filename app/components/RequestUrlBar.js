import React, {Component, PropTypes} from 'react';
import classnames from 'classnames';
import Dropdown from './base/Dropdown';
import MethodTag from './tags/MethodTag';
import {METHODS, DEBOUNCE_MILLIS} from '../lib/constants';
import Mousetrap from '../lib/mousetrap';
import {trackEvent} from '../lib/analytics';


class RequestUrlBar extends Component {
  _handleFormSubmit (e) {
    e.preventDefault();
    this.props.sendRequest();
  }

  _handleUrlChange (url) {
    clearTimeout(this._timeout);
    this._timeout = setTimeout(() => {
      this.props.onUrlChange(url);
    }, DEBOUNCE_MILLIS);
  }

  componentDidMount () {
    Mousetrap.bindGlobal('mod+l', () => {
      this.input.focus();
      this.input.select()
    });
  }

  render () {
    const {onMethodChange, url, method} = this.props;

    // TODO: Implement proper error checking here
    const hasError = !url;

    return (
      <div className={classnames({'urlbar': true, 'urlbar--error': hasError})}>
        <Dropdown>
          <button type="button">
            <div className="tall">
              <span>{method}</span>
              <i className="fa fa-caret-down"/>
            </div>
          </button>
          <ul>
            {METHODS.map(method => (
              <li key={method}>
                <button onClick={e => {
                  onMethodChange(method);
                  trackEvent('Changed Method', {method});
                }}>
                  <MethodTag method={method} fullNames={true}/>
                </button>
              </li>
            ))}
          </ul>
        </Dropdown>
        <form onSubmit={this._handleFormSubmit.bind(this)}>
          <div className="form-control">
            <input
              ref={n => this.input = n}
              type="text"
              placeholder="https://api.myproduct.com/v1/users"
              defaultValue={url}
              onClick={e => e.preventDefault()}
              onChange={e => this._handleUrlChange(e.target.value)}/>
          </div>
          <button type="submit">Send</button>
        </form>
      </div>
    );
  }
}

RequestUrlBar.propTypes = {
  sendRequest: PropTypes.func.isRequired,
  onUrlChange: PropTypes.func.isRequired,
  onMethodChange: PropTypes.func.isRequired,
  url: PropTypes.string.isRequired,
  method: PropTypes.string.isRequired
};

export default RequestUrlBar;
