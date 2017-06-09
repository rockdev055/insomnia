import * as plugins from '../../plugins/index';

import timestampExtension from './timestamp-extension';
import uuidExtension from './uuid-extension';
import NowExtension from './now-extension';
import responseExtension from './response-extension';
import base64Extension from './base-64-extension';
import requestExtension from './request-extension';

const DEFAULT_EXTENSIONS = [
  timestampExtension,
  NowExtension,
  uuidExtension,
  base64Extension,
  requestExtension,
  responseExtension
];

export function all () {
  return [...DEFAULT_EXTENSIONS, ...plugins.getTemplateTags()];
}
