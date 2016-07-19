import React, {Component, PropTypes} from 'react';

import Editor from '../components/base/Editor';
import ResponseBodyWebview from '../components/ResponseBodyWebview';
import {PREVIEW_MODE_FRIENDLY, PREVIEW_MODE_SOURCE} from '../lib/previewModes';

class ResponseViewer extends Component {
  render () {
    const {
      previewMode,
      contentType,
      editorLineWrapping,
      editorFontSize,
      body,
      url
    } = this.props;

    switch (previewMode) {
      case PREVIEW_MODE_FRIENDLY:
        return (
          <ResponseBodyWebview
            body={body}
            contentType={contentType}
            url={url}
          />
        );
      case PREVIEW_MODE_SOURCE:
        return (
          <Editor
            value={body || ''}
            prettify={true}
            mode={contentType}
            readOnly={true}
            lineWrapping={editorLineWrapping}
            fontSize={editorFontSize}
            placeholder="nothing yet..."
          />
        );
      default: // Raw
        return (
          <pre className="scrollable wide tall selectable monospace pad">
            {body}
          </pre>
        )
    }
  }
}

ResponseViewer.propTypes = {
  body: PropTypes.string.isRequired,
  contentType: PropTypes.string.isRequired,
  previewMode: PropTypes.string.isRequired,
  editorFontSize: PropTypes.number.isRequired,
  editorLineWrapping: PropTypes.bool.isRequired,

  // Optional
  url: PropTypes.string
};

export default ResponseViewer;
