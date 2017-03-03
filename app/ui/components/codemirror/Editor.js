import React, {PureComponent, PropTypes} from 'react';
import autobind from 'autobind-decorator';
import CodeMirror from 'codemirror';
import classnames from 'classnames';
import jq from 'jsonpath';
import vkBeautify from 'vkbeautify';
import {DOMParser} from 'xmldom';
import xpath from 'xpath';
import 'codemirror/mode/css/css';
import 'codemirror/mode/htmlmixed/htmlmixed';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/mode/go/go';
import 'codemirror/mode/shell/shell';
import 'codemirror/mode/clike/clike';
import 'codemirror/mode/mllike/mllike';
import 'codemirror/mode/php/php';
import 'codemirror/mode/markdown/markdown';
import 'codemirror/mode/python/python';
import 'codemirror/mode/ruby/ruby';
import 'codemirror/mode/swift/swift';
import 'codemirror/lib/codemirror.css';
import 'codemirror/addon/display/autorefresh';
import 'codemirror/addon/dialog/dialog';
import 'codemirror/addon/dialog/dialog.css';
import 'codemirror/addon/fold/foldcode';
import 'codemirror/addon/fold/foldgutter';
import 'codemirror/addon/fold/foldgutter.css';
import 'codemirror/addon/fold/brace-fold';
import 'codemirror/addon/fold/comment-fold';
import 'codemirror/addon/fold/indent-fold';
import 'codemirror/addon/fold/xml-fold';
import 'codemirror/addon/search/search';
import 'codemirror/addon/search/searchcursor';
import 'codemirror/addon/edit/matchbrackets';
import 'codemirror/addon/edit/closebrackets';
import 'codemirror/addon/search/matchesonscrollbar';
import 'codemirror/addon/search/matchesonscrollbar.css';
import 'codemirror/addon/selection/active-line';
import 'codemirror/addon/selection/selection-pointer';
import 'codemirror/addon/display/placeholder';
import 'codemirror/addon/lint/lint';
import 'codemirror/addon/lint/json-lint';
import 'codemirror/addon/lint/lint.css';
import 'codemirror/keymap/vim';
import 'codemirror/keymap/emacs';
import 'codemirror/keymap/sublime';
import './modes/nunjucks';
import './extensions/clickable';
import './extensions/nunjucks-tags';
import '../../css/components/editor.less';
import {showModal} from '../modals/index';
import AlertModal from '../modals/AlertModal';
import Link from '../base/Link';
import * as misc from '../../../common/misc';
import {trackEvent} from '../../../analytics/index';

// Make jsonlint available to the jsonlint plugin
import {parser as jsonlint} from 'jsonlint';
import {prettifyJson} from '../../../common/prettify';
import {DEBOUNCE_MILLIS} from '../../../common/constants';
global.jsonlint = jsonlint;

const TAB_KEY = 9;

const BASE_CODEMIRROR_OPTIONS = {
  lineNumbers: true,
  placeholder: 'Start Typing...',
  foldGutter: true,
  height: 'auto',
  autoRefresh: 1000,
  lineWrapping: true,
  scrollbarStyle: 'native',
  lint: true,
  tabSize: 4,
  matchBrackets: true,
  autoCloseBrackets: true,
  indentUnit: 4,
  dragDrop: true,
  viewportMargin: 30, // default 10
  selectionPointer: 'default',
  styleActiveLine: true,
  indentWithTabs: true,
  showCursorWhenSelecting: false,
  cursorScrollMargin: 12, // NOTE: This is px
  keyMap: 'default',
  extraKeys: {
    'Ctrl-Q': function (cm) {
      cm.foldCode(cm.getCursor());
    }
  }
};

@autobind
class Editor extends PureComponent {
  constructor (props) {
    super(props);

    this.state = {
      filter: props.filter || ''
    };

    this._originalCode = '';
  }

  componentWillUnmount () {
    if (this.codeMirror) {
      this.codeMirror.toTextArea();
    }
  }

  componentDidUpdate () {
    this._codemirrorSetOptions();
  }

  shouldComponentUpdate (nextProps) {
    // Update if any properties changed, except value. We ignore value.

    for (const key of Object.keys(nextProps)) {
      if (key === 'defaultValue') {
        continue;
      }

      if (this.props[key] !== nextProps[key]) {
        return true;
      }
    }

    return false;
  }

  selectAll () {
    if (this.codeMirror) {
      this.codeMirror.setSelection(
        {line: 0, ch: 0},
        {line: this.codeMirror.lineCount(), ch: 0}
      );
    }
  }

  focus () {
    if (this.codeMirror) {
      this.codeMirror.focus();
    }
  }

  setCursor (ch, line = 0) {
    if (this.codeMirror) {
      if (!this.hasFocus()) {
        this.focus();
      }
      this.codeMirror.setCursor({line, ch});
    }
  }

  setSelection (chStart, chEnd, line = 0) {
    if (this.codeMirror) {
      if (!this.hasFocus()) {
        this.focus();
      }

      this.codeMirror.setSelection(
        {line, ch: chStart},
        {line, ch: chEnd}
      );
    }
  }

  focusEnd () {
    if (this.codeMirror) {
      if (!this.hasFocus()) {
        this.focus();
      }
      const doc = this.codeMirror.getDoc();
      doc.setCursor(doc.lineCount(), 0);
    }
  }

  hasFocus () {
    if (this.codeMirror) {
      return this.codeMirror.hasFocus();
    } else {
      return false;
    }
  }

  clearSelection () {
    if (this.codeMirror) {
      this.codeMirror.setSelection(
        {line: -1, ch: -1},
        {line: -1, ch: -1}
      );
    }
  }

  getValue () {
    if (this.codeMirror) {
      return this.codeMirror.getValue();
    } else {
      return '';
    }
  }

  _handleInitTextarea (textarea) {
    if (!textarea) {
      // Not mounted
      return;
    }

    if (this.codeMirror) {
      // Already initialized
      return;
    }

    const {defaultValue, debounceMillis: ms} = this.props;
    this.codeMirror = CodeMirror.fromTextArea(textarea, BASE_CODEMIRROR_OPTIONS);

    // Set default listeners
    const debounceMillis = typeof ms === 'number' ? ms : DEBOUNCE_MILLIS;
    this.codeMirror.on('changes', misc.debounce(this._codemirrorValueChanged, debounceMillis));
    this.codeMirror.on('beforeChange', this._codemirrorValueBeforeChange);
    this.codeMirror.on('keydown', this._codemirrorKeyDown);
    this.codeMirror.on('focus', this._codemirrorFocus);
    this.codeMirror.on('blur', this._codemirrorBlur);
    this.codeMirror.on('paste', this._codemirrorValueChanged);

    // this.codeMirror.setCursor({line: -1, ch: -1});

    if (!this.codeMirror.getOption('indentWithTabs')) {
      this.codeMirror.setOption('extraKeys', {
        Tab: cm => {
          const spaces = Array(this.codeMirror.getOption('indentUnit') + 1).join(' ');
          cm.replaceSelection(spaces);
        }
      });
    }

    // Set editor options
    this._codemirrorSetOptions();

    const setup = () => {
      // Actually set the value
      this._codemirrorSetValue(defaultValue || '');

      // Setup nunjucks listeners
      if (this.props.render) {
        this.codeMirror.enableNunjucksTags(this.props.render);
      }

      // Make URLs clickable
      if (this.props.onClickLink) {
        this.codeMirror.makeLinksClickable(this.props.onClickLink);
      }
    };

    // Do this a bit later for big values so we don't block the render process
    if (defaultValue && defaultValue.length > 10000) {
      setTimeout(setup, 100);
    } else {
      setup();
    }
  }

  _isJSON (mode) {
    if (!mode) {
      return false;
    }

    return mode.indexOf('json') !== -1;
  }

  _isXML (mode) {
    if (!mode) {
      return false;
    }

    return mode.indexOf('xml') !== -1;
  }

  _handleBeautify () {
    trackEvent('Request', 'Beautify');
    this._prettify(this.codeMirror.getValue());
  }

  _prettify (code) {
    this._codemirrorSetValue(code, true);
  }

  _prettifyJSON (code) {
    try {
      let jsonString = code;

      if (this.props.updateFilter && this.state.filter) {
        let obj = JSON.parse(code);
        try {
          jsonString = JSON.stringify(jq.query(obj, this.state.filter));
        } catch (err) {
          jsonString = '[]';
        }
      }

      return prettifyJson(jsonString, '\t');
    } catch (e) {
      // That's Ok, just leave it
      return code;
    }
  }

  _prettifyXML (code) {
    if (this.props.updateFilter && this.state.filter) {
      try {
        const dom = new DOMParser().parseFromString(code);
        const nodes = xpath.select(this.state.filter, dom);
        const inner = nodes.map(n => n.toString()).join('\n');
        code = `<result>${inner}</result>`;
      } catch (e) {
        // Failed to parse filter (that's ok)
        code = `<result></result>`;
      }
    }

    try {
      return vkBeautify.xml(code, '\t');
    } catch (e) {
      // Failed to parse so just return original
      return code;
    }
  }

  /**
   * Sets options on the CodeMirror editor while also sanitizing them
   */
  _codemirrorSetOptions () {
    const {
      mode: rawMode,
      readOnly,
      hideLineNumbers,
      keyMap,
      lineWrapping,
      tabIndex,
      placeholder,
      noMatchBrackets,
      noDragDrop,
      hideScrollbars,
      noStyleActiveLine,
      noLint
    } = this.props;

    let mode;
    if (this.props.render) {
      mode = {name: 'nunjucks', baseMode: this._normalizeMode(rawMode)};
    } else {
      // foo bar baz
      mode = this._normalizeMode(rawMode);
    }

    let options = {
      readOnly: !!readOnly,
      placeholder: placeholder || '',
      mode: mode,
      tabIndex: typeof tabIndex === 'number' ? tabIndex : null,
      dragDrop: !noDragDrop,
      scrollbarStyle: hideScrollbars ? 'null' : 'native',
      styleActiveLine: !noStyleActiveLine,
      lineNumbers: !hideLineNumbers,
      foldGutter: !hideLineNumbers,
      lineWrapping: lineWrapping,
      keyMap: keyMap || 'default',
      matchBrackets: !noMatchBrackets,
      lint: !noLint && !readOnly,
      gutters: []
    };

    if (options.lineNumbers) {
      options.gutters.push('CodeMirror-linenumbers');
    }

    if (options.foldGutter) {
      options.gutters.push('CodeMirror-foldgutter');
    }

    if (options.lint) {
      options.gutters.push('CodeMirror-lint-markers');
    }

    const cm = this.codeMirror;

    // Strip of charset if there is one
    Object.keys(options).map(key => {
      // Don't set the option if it hasn't changed
      if (options[key] === cm.options[key]) {
        return;
      }

      cm.setOption(key, options[key]);
    });
  }

  _normalizeMode (mode) {
    const mimeType = mode ? mode.split(';')[0] : 'text/plain';

    if (this._isJSON(mimeType)) {
      return 'application/json';
    } else if (this._isXML(mimeType)) {
      return 'application/xml';
    } else {
      return mimeType;
    }
  }

  _codemirrorKeyDown (doc, e) {
    // Use default tab behaviour if we're told
    if (this.props.defaultTabBehavior && e.keyCode === TAB_KEY) {
      e.codemirrorIgnore = true;
    }

    if (this.props.onKeyDown) {
      this.props.onKeyDown(e, doc.getValue());
    }
  }

  _codemirrorFocus (doc, e) {
    if (this.props.onFocus) {
      this.props.onFocus(e);
    }
  }

  _codemirrorBlur (doc, e) {
    if (this.props.onBlur) {
      this.props.onBlur(e);
    }
  }

  _codemirrorValueBeforeChange (doc, change) {
    // If we're in single-line mode, merge all changed lines into one
    if (this.props.singleLine && change.text.length > 1) {
      const text = change.text
        .join('') // join all changed lines into one
        .replace(/\n/g, ' '); // Convert all whitespace to spaces
      const from = {ch: change.from.ch, line: 0};
      const to = {ch: from.ch + text.length, line: 0};
      change.update(from, to, [text]);
    }
  }

  /**
   * Wrapper function to add extra behaviour to our onChange event
   */
  _codemirrorValueChanged () {
    // Don't trigger change event if we're ignoring changes
    if (this._ignoreNextChange || !this.props.onChange) {
      this._ignoreNextChange = false;
      return;
    }

    const value = this.codeMirror.getDoc().getValue();
    this.props.onChange(value);
  }

  /**
   * Sets the CodeMirror value without triggering the onChange event
   * @param code the code to set in the editor
   * @param forcePrettify
   */
  _codemirrorSetValue (code, forcePrettify = false) {
    this._originalCode = code;

    // Don't ignore changes from prettify
    if (!forcePrettify) {
      this._ignoreNextChange = true;
    }

    const shouldPrettify = forcePrettify || this.props.autoPrettify;

    if (shouldPrettify && this._canPrettify()) {
      if (this._isXML(this.props.mode)) {
        code = this._prettifyXML(code);
      } else {
        code = this._prettifyJSON(code);
      }
    }

    this.codeMirror.setValue(code || '');
  }

  _handleFilterChange (e) {
    const filter = e.target.value;

    clearTimeout(this._filterTimeout);
    this._filterTimeout = setTimeout(() => {
      this.setState({filter});
      this._codemirrorSetValue(this._originalCode);
      if (this.props.updateFilter) {
        this.props.updateFilter(filter);
      }
    }, 200);

    // So we don't track on every keystroke, give analytics a longer timeout
    clearTimeout(this._analyticsTimeout);
    const json = this._isJSON(this.props.mode);
    this._analyticsTimeout = setTimeout(() => {
      trackEvent(
        'Response',
        `Filter ${json ? 'JSONPath' : 'XPath'}`,
        `${filter ? 'Change' : 'Clear'}`
      );
    }, 2000);
  }

  _canPrettify () {
    const {mode} = this.props;
    return this._isJSON(mode) || this._isXML(mode);
  }

  _showFilterHelp () {
    const json = this._isJSON(this.props.mode);
    const link = json ? (
        <Link href="http://goessner.net/articles/JsonPath/">
          JSONPath
        </Link>
      ) : (
        <Link href="https://www.w3.org/TR/xpath/">
          XPath
        </Link>
      );

    trackEvent('Response', `Filter ${json ? 'JSONPath' : 'XPath'}`, 'Help');

    showModal(AlertModal, {
      title: 'Response Filtering Help',
      message: (
        <div>
          <p>
            Use {link} to filter the response body. Here are some examples that
            you might use on a book store API.
          </p>
          <table className="pad-top-sm">
            <tbody>
            <tr>
              <td>
                <code className="selectable">
                  {json ? '$.store.books[*].title' : '/store/books/title'}
                </code>
              </td>
              <td>Get titles of all books in the store</td>
            </tr>
            <tr>
              <td>
                <code className="selectable">
                  {json ? '$.store.books[?(@.price < 10)].title' : '/store/books[price < 10]'}
                </code>
              </td>
              <td>Get books costing less than $10</td>
            </tr>
            <tr>
              <td>
                <code className="selectable">
                  {json ? '$.store.books[-1:]' : '/store/books[last()]'}
                </code>
              </td>
              <td>Get the last book in the store</td>
            </tr>
            <tr>
              <td>
                <code className="selectable">
                  {json ? '$.store.books.length' : 'count(/store/books)'}
                </code>
              </td>
              <td>Get the number of books in the store</td>
            </tr>
            </tbody>
          </table>
        </div>
      )
    });
  }

  render () {
    const {readOnly, fontSize, mode, filter} = this.props;

    const classes = classnames(
      'editor',
      this.props.className,
      {'editor--readonly': readOnly}
    );

    const toolbarChildren = [];
    if (this.props.updateFilter && (this._isJSON(mode) || this._isXML(mode))) {
      toolbarChildren.push(
        <input
          key="filter"
          type="text"
          title="Filter response body"
          defaultValue={filter || ''}
          placeholder={this._isJSON(mode) ? '$.store.books[*].author' : '/store/books/author'}
          onChange={this._handleFilterChange}
        />
      );
      toolbarChildren.push(
        <button key="help"
                className="btn btn--compact"
                onClick={() => this._showFilterHelp()}>
          <i className="fa fa-question-circle"></i>
        </button>
      );
    }

    if (this.props.manualPrettify && this._canPrettify()) {
      let contentTypeName = '';
      if (this._isJSON(mode)) {
        contentTypeName = 'JSON';
      } else if (this._isXML(mode)) {
        contentTypeName = 'XML';
      }

      toolbarChildren.push(
        <button key="prettify"
                className="btn btn--compact"
                title="Auto-format request body whitespace"
                onClick={this._handleBeautify}>
          Beautify {contentTypeName}
        </button>
      );
    }

    let toolbar = null;
    if (toolbarChildren.length) {
      toolbar = <div className="editor__toolbar">{toolbarChildren}</div>;
    }

    const styles = {};
    if (fontSize) {
      styles.fontSize = `${fontSize}px`;
    }

    return (
      <div className={classes}>
        <div className="editor__container input" style={styles}>
          <textarea
            ref={this._handleInitTextarea}
            style={{display: 'none'}}
            defaultValue=" "
            readOnly={readOnly}
            autoComplete="off"
          />
        </div>
        {toolbar}
      </div>
    );
  }
}

Editor.propTypes = {
  onChange: PropTypes.func,
  onFocus: PropTypes.func,
  onBlur: PropTypes.func,
  onClickLink: PropTypes.func,
  render: PropTypes.func,
  keyMap: PropTypes.string,
  mode: PropTypes.string,
  placeholder: PropTypes.string,
  lineWrapping: PropTypes.bool,
  hideLineNumbers: PropTypes.bool,
  noMatchBrackets: PropTypes.bool,
  hideScrollbars: PropTypes.bool,
  fontSize: PropTypes.number,
  defaultValue: PropTypes.string,
  tabIndex: PropTypes.number,
  autoPrettify: PropTypes.bool,
  manualPrettify: PropTypes.bool,
  noLint: PropTypes.bool,
  noDragDrop: PropTypes.bool,
  noStyleActiveLine: PropTypes.bool,
  className: PropTypes.any,
  updateFilter: PropTypes.func,
  defaultTabBehavior: PropTypes.bool,
  readOnly: PropTypes.bool,
  filter: PropTypes.string,
  singleLine: PropTypes.bool,
  debounceMillis: PropTypes.number
};

export default Editor;
