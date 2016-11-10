import React, {Component, PropTypes} from 'react';
import {ipcRenderer} from 'electron';
import ReactDOM from 'react-dom';
import {connect} from 'react-redux';
import classnames from 'classnames';
import {bindActionCreators} from 'redux';
import HTML5Backend from 'react-dnd-html5-backend';
import {DragDropContext} from 'react-dnd';
import Mousetrap from '../mousetrap';
import {registerModal, toggleModal, showModal} from '../components/modals';
import WorkspaceEnvironmentsEditModal from '../components/modals/WorkspaceEnvironmentsEditModal';
import CookiesModal from '../components/modals/CookiesModal';
import EnvironmentEditModal from '../components/modals/EnvironmentEditModal';
import RequestSwitcherModal from '../components/modals/RequestSwitcherModal';
import GenerateCodeModal from '../components/modals/GenerateCodeModal';
import PromptModal from '../components/modals/PromptModal';
import AlertModal from '../components/modals/AlertModal';
import ChangelogModal from '../components/modals/ChangelogModal';
import SyncModal from '../components/modals/SyncModal';
import LoginModal from '../components/modals/LoginModal';
import SignupModal from '../components/modals/SignupModal';
import SettingsModal from '../components/modals/SettingsModal';
import PaymentModal from '../components/modals/PaymentModal';
import RequestPane from '../components/RequestPane';
import ResponsePane from '../components/ResponsePane';
import Sidebar from '../components/sidebar/Sidebar';
import {MAX_PANE_WIDTH, MIN_PANE_WIDTH, DEFAULT_PANE_WIDTH, MAX_SIDEBAR_REMS, MIN_SIDEBAR_REMS, DEFAULT_SIDEBAR_WIDTH, PREVIEW_MODE_FRIENDLY} from '../../common/constants';
import * as GlobalActions from '../redux/modules/global';
import * as RequestActions from '../redux/modules/requests';
import * as db from '../../backend/database';
import * as models from '../../backend/models';
import {importCurl} from '../../backend/export/curl';
import {getAppVersion} from '../../common/constants';
import {trackEvent, trackLegacyEvent} from '../../analytics';


class App extends Component {
  constructor (props) {
    super(props);
    const workspaceMeta = this._getActiveWorkspaceMeta(props);
    this.state = {
      activeResponse: null,
      activeRequest: null,
      draggingSidebar: false,
      draggingPane: false,
      forceRefreshCounter: 0,
      sidebarWidth: workspaceMeta.sidebarWidth || DEFAULT_SIDEBAR_WIDTH, // rem
      paneWidth: workspaceMeta.paneWidth || DEFAULT_PANE_WIDTH // % (fr)
    };

    this.globalKeyMap = {

      // Show Settings
      'mod+,': () => {
        // NOTE: This is controlled via a global menu shortcut in app.js
      },

      // Show Request Switcher
      'mod+p': () => {
        toggleModal(RequestSwitcherModal);
      },

      // Request Send
      'mod+enter': () => {
        const request = this._getActiveRequest();
        if (!request) {
          return;
        }

        this._handleSendRequest(request);
      },

      // Edit Workspace Environments
      'mod+e': () => {
        toggleModal(WorkspaceEnvironmentsEditModal, this._getActiveWorkspace());
      },

      // Focus URL Bar
      'mod+l': () => {
        const node = document.body.querySelector('.urlbar input');
        node && node.focus();
      },

      // Edit Cookies
      'mod+k': () => {
        toggleModal(CookiesModal, this._getActiveWorkspace());
      },

      // Request Create
      'mod+n': () => {
        const workspace = this._getActiveWorkspace();
        const request = this._getActiveRequest();

        if (!workspace) {
          // Nothing to do if no workspace
          return;
        }

        const parentId = request ? request.parentId : workspace._id;
        this._requestCreate(parentId);
      },

      // Request Duplicate
      'mod+d': async () => {
        const activeRequest = this._getActiveRequest();

        if (!activeRequest) {
          return;
        }

        const request = await models.request.duplicate(activeRequest);

        const workspace = this._getActiveWorkspace();
        this.props.actions.global.activateRequest(workspace, request)
      }
    }
  }

  _importFile () {
    const workspace = this._getActiveWorkspace();
    this.props.actions.global.importFile(workspace);
  }

  async _handleSendRequest (request) {
    const {actions} = this.props;
    const workspace = this._getActiveWorkspace();
    const environmentId = workspace.metaActiveEnvironmentId;
    actions.requests.send(request, environmentId);
  }

  async _moveRequestGroup (requestGroupToMove, requestGroupToTarget, targetOffset) {
    // Oh God, this function is awful...

    if (requestGroupToMove._id === requestGroupToTarget._id) {
      // Nothing to do
      return;
    }

    // NOTE: using requestToTarget's parentId so we can switch parents!
    let requestGroups = await models.requestGroup.findByParentId(requestGroupToTarget.parentId);
    requestGroups = requestGroups.sort((a, b) => a.metaSortKey < b.metaSortKey ? -1 : 1);

    // Find the index of request B so we can re-order and save everything
    for (let i = 0; i < requestGroups.length; i++) {
      const request = requestGroups[i];

      if (request._id === requestGroupToTarget._id) {
        let before, after;
        if (targetOffset < 0) {
          // We're moving to below
          before = requestGroups[i];
          after = requestGroups[i + 1];
        } else {
          // We're moving to above
          before = requestGroups[i - 1];
          after = requestGroups[i];
        }

        const beforeKey = before ? before.metaSortKey : requestGroups[0].metaSortKey - 100;
        const afterKey = after ? after.metaSortKey : requestGroups[requestGroups.length - 1].metaSortKey + 100;

        if (Math.abs(afterKey - beforeKey) < 0.000001) {
          // If sort keys get too close together, we need to redistribute the list. This is
          // not performant at all (need to update all siblings in DB), but it is extremely rare
          // anyway
          console.log(`-- Recreating Sort Keys ${beforeKey} ${afterKey} --`);

          db.bufferChanges(300);
          requestGroups.map((r, i) => {
            models.requestGroup.update(r, {
              metaSortKey: i * 100,
              parentId: requestGroupToTarget.parentId
            });
          });
        } else {
          const metaSortKey = afterKey - (afterKey - beforeKey) / 2;
          models.requestGroup.update(requestGroupToMove, {
            metaSortKey,
            parentId: requestGroupToTarget.parentId
          });
        }

        break;
      }
    }
  }

  async _moveRequest (requestToMove, parentId, targetId, targetOffset) {
    // Oh God, this function is awful...

    if (requestToMove._id === targetId) {
      // Nothing to do. We are in the same spot as we started
      return;
    }

    if (targetId === null) {
      // We are moving to an empty area. No sorting required
      models.request.update(requestToMove, {parentId});
      return;
    }

    // NOTE: using requestToTarget's parentId so we can switch parents!
    let requests = await models.request.findByParentId(parentId);
    requests = requests.sort((a, b) => a.metaSortKey < b.metaSortKey ? -1 : 1);

    // Find the index of request B so we can re-order and save everything
    for (let i = 0; i < requests.length; i++) {
      const request = requests[i];

      if (request._id === targetId) {
        let before, after;
        if (targetOffset < 0) {
          // We're moving to below
          before = requests[i];
          after = requests[i + 1];
        } else {
          // We're moving to above
          before = requests[i - 1];
          after = requests[i];
        }

        const beforeKey = before ? before.metaSortKey : requests[0].metaSortKey - 100;
        const afterKey = after ? after.metaSortKey : requests[requests.length - 1].metaSortKey + 100;

        if (Math.abs(afterKey - beforeKey) < 0.000001) {
          // If sort keys get too close together, we need to redistribute the list. This is
          // not performant at all (need to update all siblings in DB), but it is extremely rare
          // anyway
          console.log(`-- Recreating Sort Keys ${beforeKey} ${afterKey} --`);

          db.bufferChanges(300);
          requests.map((r, i) => {
            models.request.update(r, {metaSortKey: i * 100, parentId});
          });
        } else {
          const metaSortKey = afterKey - (afterKey - beforeKey) / 2;
          models.request.update(requestToMove, {metaSortKey, parentId});
        }

        break;
      }
    }
  }

  async _requestGroupCreate (parentId) {
    const name = await showModal(PromptModal, {
      headerName: 'Create New Folder',
      defaultValue: 'My Folder',
      selectText: true
    });

    models.requestGroup.create({parentId, name})
  }

  async _requestCreate (parentId) {
    const name = await showModal(PromptModal, {
      headerName: 'Create New Request',
      defaultValue: 'My Request',
      selectText: true
    });

    const workspace = this._getActiveWorkspace();
    const request = await models.request.create({parentId, name});
    this.props.actions.global.activateRequest(workspace, request);
  }

  _generateSidebarTree (parentId, entities) {
    const children = entities.filter(
      e => e.parentId === parentId
    ).sort((a, b) => {
      if (a.metaSortKey === b.metaSortKey) {
        return a._id > b._id ? -1 : 1;
      } else {
        return a.metaSortKey < b.metaSortKey ? -1 : 1;
      }
    });

    if (children.length > 0) {
      return children.map(c => ({
        doc: c,
        children: this._generateSidebarTree(c._id, entities)
      }));
    } else {
      return children;
    }
  }

  async _handleUrlChanged (request, url) {
    // TODO: Should this be moved elsewhere?
    const requestPatch = importCurl(url);
    if (requestPatch) {
      await models.request.update(request, requestPatch);
      this._forceHardRefresh();
    } else {
      models.request.update(request, {url});
    }
  }

  _startDragSidebar () {
    this.setState({draggingSidebar: true})
  }

  _resetDragSidebar () {
    // TODO: Remove setTimeout need be not triggering drag on double click
    setTimeout(() => {
      this.setState({sidebarWidth: DEFAULT_SIDEBAR_WIDTH});
      this._saveSidebarWidth();
    }, 50);
  }

  _startDragPane () {
    this.setState({draggingPane: true})
  }

  _resetDragPane () {
    // TODO: Remove setTimeout need be not triggering drag on double click
    setTimeout(() => {
      this.setState({paneWidth: DEFAULT_PANE_WIDTH});
      this._savePaneWidth();
    }, 50);
  }

  _savePaneWidth () {
    this.props.actions.global.setPaneWidth(
      this._getActiveWorkspace(),
      this.state.paneWidth
    );
  }

  _saveSidebarWidth () {
    this.props.actions.global.setSidebarWidth(
      this._getActiveWorkspace(),
      this.state.sidebarWidth
    );
  }

  _getActiveWorkspaceMeta (props) {
    props = props || this.props;
    const workspace = this._getActiveWorkspace(props);
    return props.global.workspaceMeta[workspace._id] || {};
  }

  _getActiveWorkspace (props) {
    // TODO: Factor this out into a selector

    const {entities, global} = props || this.props;
    let workspace = entities.workspaces[global.activeWorkspaceId];
    if (!workspace) {
      // If no workspace, fallback to a basically random one
      workspace = entities.workspaces[Object.keys(entities.workspaces)[0]];
    }

    return workspace;
  }

  _getActiveRequest (props) {
    // TODO: Factor this out into a selector

    props = props || this.props;
    const {entities} = props;
    const workspaceMeta = this._getActiveWorkspaceMeta(props);
    return entities.requests[workspaceMeta.activeRequestId];
  }

  _handleMouseMove (e) {
    if (this.state.draggingPane) {
      const requestPane = ReactDOM.findDOMNode(this._requestPane);
      const responsePane = ReactDOM.findDOMNode(this._responsePane);

      const requestPaneWidth = requestPane.offsetWidth;
      const responsePaneWidth = responsePane.offsetWidth;
      const pixelOffset = e.clientX - requestPane.offsetLeft;
      let paneWidth = pixelOffset / (requestPaneWidth + responsePaneWidth);
      paneWidth = Math.min(Math.max(paneWidth, MIN_PANE_WIDTH), MAX_PANE_WIDTH);
      this.setState({paneWidth});

    } else if (this.state.draggingSidebar) {
      const currentPixelWidth = ReactDOM.findDOMNode(this._sidebar).offsetWidth;
      const ratio = e.clientX / currentPixelWidth;
      const width = this.state.sidebarWidth * ratio;
      let sidebarWidth = Math.max(Math.min(width, MAX_SIDEBAR_REMS), MIN_SIDEBAR_REMS);
      this.setState({sidebarWidth})
    }
  }

  _handleMouseUp () {
    if (this.state.draggingSidebar) {
      this.setState({
        draggingSidebar: false
      });

      this._saveSidebarWidth();
    }

    if (this.state.draggingPane) {
      this.setState({
        draggingPane: false
      });

      this._savePaneWidth();
    }
  }

  _handleToggleSidebar () {
    const workspace = this._getActiveWorkspace();
    this.props.actions.global.toggleSidebar(workspace);
  }

  _forceHardRefresh () {
    this.setState({forceRefreshCounter: this.state.forceRefreshCounter + 1});
  }

  async componentDidMount () {
    // Bind handlers before we use them
    this._handleMouseUp = this._handleMouseUp.bind(this);
    this._handleMouseMove = this._handleMouseMove.bind(this);

    // Bind mouse handlers
    document.addEventListener('mouseup', this._handleMouseUp);
    document.addEventListener('mousemove', this._handleMouseMove);

    // Map global keyboard shortcuts
    Object.keys(this.globalKeyMap).map(key => {
      Mousetrap.bindGlobal(key.split('|'), this.globalKeyMap[key]);
    });

    // Do The Analytics
    trackLegacyEvent('App Launched');

    // Update Stats Object
    const {lastVersion, launches} = await models.stats.get();
    const firstLaunch = !lastVersion;
    if (firstLaunch) {
      // TODO: Show a welcome message
      trackLegacyEvent('First Launch');
    } else if (lastVersion !== getAppVersion()) {
      trackEvent('General', 'Updated', getAppVersion());
      showModal(ChangelogModal);
    }

    db.onChange(changes => {
      for (const change of changes) {
        const [event, doc, fromSync] = change;

        // Not a sync-related change
        if (!fromSync) {
          return;
        }

        const activeRequest = this._getActiveRequest(this.props);

        // No active request at the moment, so it doesn't matter
        if (!activeRequest) {
          return;
        }

        // Only force the UI to refresh if the active Request changes
        // This is because things like the URL and Body editor don't update
        // when you tell them to.

        if (doc._id !== activeRequest._id) {
          return;
        }

        console.log('[App] Forcing update');

        // All sync-related changes to data force-refresh the app.
        this._forceHardRefresh();
      }
    });

    models.stats.update({
      launches: launches + 1,
      lastLaunch: Date.now(),
      lastVersion: getAppVersion()
    });

    ipcRenderer.on('toggle-preferences', () => {
      toggleModal(SettingsModal);
    });

    ipcRenderer.on('toggle-sidebar', this._handleToggleSidebar.bind(this));
  }

  componentWillUnmount () {
    // Remove mouse handlers
    document.removeEventListener('mouseup', this._handleMouseUp);
    document.removeEventListener('mousemove', this._handleMouseMove);

    // Unbind global keyboard shortcuts
    Mousetrap.unbind();
  }

  render () {
    const {actions, entities, requests} = this.props;
    const settings = entities.settings[Object.keys(entities.settings)[0]];

    const workspace = this._getActiveWorkspace();

    const activeRequest = this._getActiveRequest();
    const activeRequestId = activeRequest ? activeRequest._id : null;

    const allRequests = Object.keys(entities.requests).map(id => entities.requests[id]);
    const allRequestGroups = Object.keys(entities.requestGroups).map(id => entities.requestGroups[id]);

    const children = this._generateSidebarTree(
      workspace._id,
      allRequests.concat(allRequestGroups)
    );

    const {sidebarWidth, paneWidth, forceRefreshCounter} = this.state;
    const workspaceMeta = this._getActiveWorkspaceMeta();
    const realSidebarWidth = workspaceMeta.sidebarHidden ? 0 : sidebarWidth;
    const gridTemplateColumns = `${realSidebarWidth}rem 0 ${paneWidth}fr 0 ${1 - paneWidth}fr`;

    return (
      <div id="wrapper"
           className={classnames('wrapper', {'wrapper--vertical': settings.forceVerticalLayout})}
           style={{gridTemplateColumns: gridTemplateColumns}}>
        <Sidebar
          ref={n => this._sidebar = n}
          showEnvironmentsModal={() => showModal(WorkspaceEnvironmentsEditModal, workspace)}
          showCookiesModal={() => showModal(CookiesModal, workspace)}
          activateRequest={r => actions.global.activateRequest(workspace, r)}
          changeFilter={filter => actions.global.changeFilter(workspace, filter)}
          moveRequest={this._moveRequest.bind(this)}
          moveRequestGroup={this._moveRequestGroup.bind(this)}
          addRequestToRequestGroup={requestGroup => this._requestCreate(requestGroup._id)}
          addRequestToWorkspace={() => this._requestCreate(workspace._id)}
          toggleRequestGroup={requestGroup => models.requestGroup.update(requestGroup, {metaCollapsed: !requestGroup.metaCollapsed})}
          activeRequestId={activeRequestId}
          requestCreate={() => this._requestCreate(activeRequest ? activeRequest.parentId : workspace._id)}
          requestGroupCreate={() => this._requestGroupCreate(workspace._id)}
          filter={workspaceMeta.filter || ''}
          hidden={workspaceMeta.sidebarHidden || false}
          showSyncSettings={settings.optSyncBeta}
          workspaceId={workspace._id}
          children={children}
          width={sidebarWidth}
        />

        <div className="drag drag--sidebar">
          <div onMouseDown={e => {
            e.preventDefault();
            this._startDragSidebar()
          }}
               onDoubleClick={() => this._resetDragSidebar()}>
          </div>
        </div>

        <RequestPane
          key={(activeRequest ? activeRequest._id : 'n/a') + forceRefreshCounter}
          ref={n => this._requestPane = n}
          importFile={this._importFile.bind(this)}
          request={activeRequest}
          sendRequest={this._handleSendRequest.bind(this)}
          showPasswords={settings.showPasswords}
          useBulkHeaderEditor={settings.useBulkHeaderEditor}
          editorFontSize={settings.editorFontSize}
          editorLineWrapping={settings.editorLineWrapping}
          requestCreate={() => this._requestCreate(activeRequest ? activeRequest.parentId : workspace._id)}
          updateRequestBody={body => models.request.update(activeRequest, {body})}
          updateRequestUrl={url => this._handleUrlChanged(activeRequest, url)}
          updateRequestMethod={method => models.request.update(activeRequest, {method})}
          updateRequestParameters={parameters => models.request.update(activeRequest, {parameters})}
          updateRequestAuthentication={authentication => models.request.update(activeRequest, {authentication})}
          updateRequestHeaders={headers => models.request.update(activeRequest, {headers})}
          updateRequestContentType={contentType => models.request.updateContentType(activeRequest, contentType)}
          updateSettingsShowPasswords={showPasswords => models.settings.update(settings, {showPasswords})}
          updateSettingsUseBulkHeaderEditor={useBulkHeaderEditor => models.settings.update(settings, {useBulkHeaderEditor})}
        />

        <div className="drag drag--pane">
          <div onMouseDown={() => this._startDragPane()}
               onDoubleClick={() => this._resetDragPane()}></div>
        </div>

        <ResponsePane
          ref={n => this._responsePane = n}
          request={activeRequest}
          editorFontSize={settings.editorFontSize}
          editorLineWrapping={settings.editorLineWrapping}
          previewMode={activeRequest ? activeRequest.metaPreviewMode : PREVIEW_MODE_FRIENDLY}
          responseFilter={activeRequest ? activeRequest.metaResponseFilter : ''}
          updatePreviewMode={metaPreviewMode => models.request.update(activeRequest, {metaPreviewMode})}
          updateResponseFilter={metaResponseFilter => models.request.update(activeRequest, {metaResponseFilter})}
          loadingRequests={requests.loadingRequests}
          showCookiesModal={() => showModal(CookiesModal, workspace)}
        />

        <PromptModal ref={m => registerModal(m)}/>
        <AlertModal ref={m => registerModal(m)}/>
        <ChangelogModal ref={m => registerModal(m)}/>
        <SyncModal ref={m => registerModal(m)}/>
        <LoginModal ref={m => registerModal(m)}/>
        <SignupModal ref={m => registerModal(m)}/>
        <SettingsModal ref={m => registerModal(m)}/>
        <PaymentModal ref={m => registerModal(m)}/>
        <GenerateCodeModal ref={m => registerModal(m)}/>
        <RequestSwitcherModal
          ref={m => registerModal(m)}
          workspaceId={workspace._id}
          activeRequestParentId={activeRequest ? activeRequest.parentId : workspace._id}
          activateRequest={r => actions.global.activateRequest(workspace, r)}
          activateWorkspace={w => actions.global.activateWorkspace(w)}
        />
        <EnvironmentEditModal
          ref={m => registerModal(m)}
          onChange={rg => models.requestGroup.update(rg)}/>
        <WorkspaceEnvironmentsEditModal
          ref={m => registerModal(m)}
          onChange={w => models.workspace.update(w)}/>
        <CookiesModal ref={m => registerModal(m)}/>

        {/*<div className="toast toast--show">*/}
        {/*<div className="toast__message">How's it going?</div>*/}
        {/*<button className="toast__action">Great!</button>*/}
        {/*<button className="toast__action">Horrible :(</button>*/}
        {/*</div>*/}
      </div>
    )
  }
}

App.propTypes = {
  actions: PropTypes.shape({
    requests: PropTypes.shape({
      send: PropTypes.func.isRequired
    }).isRequired,
    global: PropTypes.shape({
      importFile: PropTypes.func.isRequired,
      activateRequest: PropTypes.func.isRequired,
      activateWorkspace: PropTypes.func.isRequired,
      changeFilter: PropTypes.func.isRequired,
      toggleSidebar: PropTypes.func.isRequired,
      setSidebarWidth: PropTypes.func.isRequired,
      setPaneWidth: PropTypes.func.isRequired
    }).isRequired
  }).isRequired,
  entities: PropTypes.shape({
    requests: PropTypes.object.isRequired,
    requestGroups: PropTypes.object.isRequired,
    responses: PropTypes.object.isRequired
  }).isRequired,
  requests: PropTypes.shape({
    loadingRequests: PropTypes.object.isRequired
  }).isRequired,
  global: PropTypes.shape({
    workspaceMeta: PropTypes.object.isRequired,
    activeWorkspaceId: PropTypes.string.isRequired
  }).isRequired
};

function mapStateToProps (state) {
  return {
    actions: state.actions,
    requests: state.requests,
    entities: state.entities,
    global: state.global
  };
}

function mapDispatchToProps (dispatch) {
  return {
    actions: {
      global: bindActionCreators(GlobalActions, dispatch),
      requests: bindActionCreators(RequestActions, dispatch)
    }
  }
}

const reduxApp = connect(
  mapStateToProps,
  mapDispatchToProps
)(App);

export default DragDropContext(HTML5Backend)(reduxApp);

