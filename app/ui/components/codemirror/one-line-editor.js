import React, {PureComponent, PropTypes} from 'react';
import autobind from 'autobind-decorator';
import CodeEditor from './code-editor';
import Input from '../base/debounced-input';

const MODE_INPUT = 'input';
const MODE_EDITOR = 'editor';
const TYPE_TEXT = 'text';
const NUNJUCKS_REGEX = /({%|%}|{{|}})/;

@autobind
class OneLineEditor extends PureComponent {
  constructor (props) {
    super(props);

    let mode;
    if (props.forceInput) {
      mode = MODE_INPUT;
    } else if (props.forceEditor) {
      mode = MODE_EDITOR;
    } else if (this._mayContainNunjucks(props.defaultValue)) {
      mode = MODE_EDITOR;
    } else {
      mode = MODE_INPUT;
    }

    this.state = {mode};
  }

  focus (setToEnd = false) {
    if (this.state.mode === MODE_EDITOR) {
      if (this._editor && !this._editor.hasFocus()) {
        setToEnd ? this._editor.focusEnd() : this._editor.focus();
      }
    } else {
      if (this._input && !this._input.hasFocus()) {
        setToEnd ? this._input.focusEnd() : this._input.focus();
      }
    }
  }

  focusEnd () {
    this.focus(true);
  }

  selectAll () {
    if (this.state.mode === MODE_EDITOR) {
      this._editor.selectAll();
    } else {
      this._input.select();
    }
  }

  getValue () {
    if (this.state.mode === MODE_EDITOR) {
      return this._editor.getValue();
    } else {
      return this._input.getValue();
    }
  }

  _handleEditorMouseLeave () {
    this._convertToInputIfNotFocused();
  }

  _handleInputMouseEnter () {
    this._convertToEditorPreserveFocus();
  }

  _handleEditorFocus (e) {
    const focusedFromTabEvent = !!e.sourceCapabilities;

    if (focusedFromTabEvent) {
      this._editor.focusEnd();
    }

    this.props.onFocus && this.props.onFocus(e);
  }

  _handleInputFocus (e) {
    // If we're focusing the whole thing, blur the input. This happens when
    // the user tabs to the field.
    const start = this._input.getSelectionStart();
    const end = this._input.getSelectionEnd();
    const focusedFromTabEvent = start === 0 && end === e.target.value.length;

    if (focusedFromTabEvent) {
      this._input.focusEnd();

      // Also convert to editor if we tabbed to it. Just in case the user
      // needs an editor
      this._convertToEditorPreserveFocus();
    }

    // Also call the regular callback
    this.props.onFocus && this.props.onFocus(e);
  }

  _handleInputChange (value) {
    this._convertToEditorPreserveFocus();
    this.props.onChange && this.props.onChange(value);
  }

  _handleInputKeyDown (e) {
    if (this.props.onKeyDown) {
      this.props.onKeyDown(e, e.target.value);
    }
  }

  _handleInputBlur () {
    this.props.onBlur && this.props.onBlur();
  }

  _handleEditorBlur () {
    // Editor was already removed from the DOM, so do nothing
    if (!this._editor) {
      return;
    }

    this._editor.clearSelection();

    if (!this.props.forceEditor) {
      this._convertToInputIfNotFocused();
    }

    this.props.onBlur && this.props.onBlur();
  }

  _handleEditorKeyDown (e) {
    // submit form if needed
    if (e.keyCode === 13) {
      let node = e.target;
      for (let i = 0; i < 20 && node; i++) {
        if (node.tagName === 'FORM') {
          node.dispatchEvent(new window.Event('submit'));
          break;
        }
        node = node.parentNode;
      }
    }

    // Also call the original if there was one
    this.props.onKeyDown && this.props.onKeyDown(e, this.getValue());
  }

  _convertToEditorPreserveFocus () {
    if (this.state.mode !== MODE_INPUT || this.props.forceInput) {
      return;
    }

    if (this._input.hasFocus()) {
      const start = this._input.getSelectionStart();
      const end = this._input.getSelectionEnd();

      // Wait for the editor to swap and restore cursor position
      const check = () => {
        if (this._editor) {
          this._editor.focus();
          this._editor.setSelection(start, end);
        } else {
          setTimeout(check, 40);
        }
      };

      // Tell the component to show the editor
      setTimeout(check);
    }

    this.setState({mode: MODE_EDITOR});
  }

  _convertToInputIfNotFocused () {
    if (this.state.mode === MODE_INPUT || this.props.forceEditor) {
      return;
    }

    if (this._editor.hasFocus()) {
      return;
    }

    if (this._mayContainNunjucks(this.getValue())) {
      return;
    }

    this.setState({mode: MODE_INPUT});
  }

  _setEditorRef (n) {
    this._editor = n;
  }

  _setInputRef (n) {
    this._input = n;
  }

  _mayContainNunjucks (text) {
    return !!text.match(NUNJUCKS_REGEX);
  }

  render () {
    const {
      defaultValue,
      className,
      onChange,
      placeholder,
      render,
      type: originalType
    } = this.props;

    const {mode} = this.state;

    const type = originalType || TYPE_TEXT;
    const showEditor = type === TYPE_TEXT && mode === MODE_EDITOR;

    if (showEditor) {
      return (
        <CodeEditor
          ref={this._setEditorRef}
          defaultTabBehavior
          hideLineNumbers
          hideScrollbars
          noDragDrop
          noMatchBrackets
          noStyleActiveLine
          noLint
          singleLine
          tabIndex={0}
          placeholder={placeholder}
          onBlur={this._handleEditorBlur}
          onKeyDown={this._handleEditorKeyDown}
          onFocus={this._handleEditorFocus}
          onMouseLeave={this._handleEditorMouseLeave}
          onChange={onChange}
          render={render}
          className="editor--single-line input"
          defaultValue={defaultValue}
        />
      );
    } else {
      return (
        <Input
          ref={this._setInputRef}
          type={type}
          className={`editor--single-line input ${className || ''}`}
          style={{
            padding: '0 4px', // To match CodeMirror
            // background: 'rgba(255, 0, 0, 0.05)', // For debugging
            width: '100%'
          }}
          placeholder={placeholder}
          defaultValue={defaultValue}
          onBlur={this._handleInputBlur}
          onChange={this._handleInputChange}
          onMouseEnter={this._handleInputMouseEnter}
          onFocus={this._handleInputFocus}
          onKeyDown={this._handleInputKeyDown}
        />
      );
    }
  }
}

OneLineEditor.propTypes = {
  defaultValue: PropTypes.string.isRequired,

  // Optional
  type: PropTypes.string,
  onBlur: PropTypes.func,
  onKeyDown: PropTypes.func,
  onFocus: PropTypes.func,
  onChange: PropTypes.func,
  render: PropTypes.func,
  placeholder: PropTypes.string,
  className: PropTypes.string,
  forceEditor: PropTypes.bool,
  forceInput: PropTypes.bool,
  handleRender: PropTypes.func
};

export default OneLineEditor;
