import React, {Component, PropTypes} from 'react';
import HTTPSnippet, {availableTargets} from 'httpsnippet';

import CopyButton from '../base/CopyButton';
import {Dropdown, DropdownButton, DropdownItem} from '../base/dropdown';
import Editor from '../base/Editor';
import Modal from '../base/Modal';
import ModalBody from '../base/ModalBody';
import ModalHeader from '../base/ModalHeader';
import ModalFooter from '../base/ModalFooter';
import {exportHar} from '../../../export/har';

const DEFAULT_TARGET = availableTargets().find(t => t.key === 'shell');
const DEFAULT_CLIENT = DEFAULT_TARGET.clients.find(t => t.key === 'curl');
const MODE_MAP = {
  c: 'clike',
  java: 'clike',
  csharp: 'clike',
  node: 'javascript',
  objc: 'clike',
  ocaml: 'mllike'
};

const TO_ADD_CONTENT_LENGTH = {
  node: ['native']
};


class GenerateCodeModal extends Component {
  constructor (props) {
    super(props);
    this.state = {
      cmd: '',
      request: null,
      target: DEFAULT_TARGET,
      client: DEFAULT_CLIENT
    };
  }

  _handleClientChange (client) {
    const {target, request} = this.state;
    this._generateCode(request, target, client);
  }

  _handleTargetChange (target) {
    const {target: currentTarget} = this.state;
    if (currentTarget.key === target.key) {
      // No change
      return;
    }

    const client = target.clients.find(c => c.key === target.default);
    this._generateCode(this.state.request, target, client);
  }

  async _generateCode (request, target, client) {
    // Some clients need a content-length for the request to succeed
    const addContentLength = (TO_ADD_CONTENT_LENGTH[target.key] || []).find(c => c === client.key);

    const {environmentId} = this.props;
    const har = await exportHar(request._id, environmentId, addContentLength);
    const snippet = new HTTPSnippet(har);
    const cmd = snippet.convert(target.key, client.key);

    this.setState({request, cmd, client, target});
  }

  show (request) {
    this._generateCode(request, DEFAULT_TARGET, DEFAULT_CLIENT);
    this.modal.show();
  }

  render () {
    const {cmd, target, client} = this.state;
    const targets = availableTargets();

    return (
      <Modal ref={m => this.modal = m} tall={true} {...this.props}>
        <ModalHeader>Generate Client Code</ModalHeader>
        <ModalBody noScroll={true} style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gridTemplateRows: 'auto minmax(0, 1fr)'
        }}>
          <div className="pad">
            <Dropdown outline={true}>
              <DropdownButton className="btn btn--super-compact btn--outlined">
                {target.title}
                <i className="fa fa-caret-down"></i>
              </DropdownButton>
              {targets.map(target => (
                <DropdownItem key={target.key} onClick={() => this._handleTargetChange(target)}>
                  {target.title}
                </DropdownItem>
              ))}
            </Dropdown>
            &nbsp;&nbsp;
            <Dropdown outline={true}>
              <DropdownButton className="btn btn--super-compact btn--outlined">
                {client.title}
                <i className="fa fa-caret-down"></i>
              </DropdownButton>
              {target.clients.map(client => (
                <DropdownItem key={client.key} onClick={() => this._handleClientChange(client)}>
                  {client.title}
                </DropdownItem>
              ))}
            </Dropdown>
            &nbsp;&nbsp;
            <CopyButton content={cmd}
                        className="pull-right btn btn--super-compact btn--outlined"/>
          </div>
          <Editor
            className="border-top"
            key={Date.now()}
            mode={MODE_MAP[target.key] || target.key}
            ref={n => this._editor = n}
            lightTheme={true}
            lineWrapping={true}
            value={cmd}
          />
        </ModalBody>
        <ModalFooter>
          <div className="margin-left faint italic txt-sm tall">
            * copy/paste this command into a Unix terminal
          </div>
          <button className="btn" onClick={e => this.modal.hide()}>
            Done
          </button>
        </ModalFooter>
      </Modal>
    );
  }
}

GenerateCodeModal.propTypes = {
  environmentId: PropTypes.string.isRequired,
};

export default GenerateCodeModal;
