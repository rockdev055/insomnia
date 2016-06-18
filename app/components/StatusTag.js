import classnames from 'classnames';
import React, {PropTypes} from 'react'

const StatusTag = ({statusMessage, statusCode}) => {
  statusCode = String(statusCode);

  let colorClass;
  let backupStatusMessage;

  if (statusCode.startsWith('1')) {
    colorClass = 'bg-info';
    backupStatusMessage = 'INFO';
  } else if (statusCode.startsWith('2')) {
    colorClass = 'bg-success';
    backupStatusMessage = 'SUCCESS';
  } else if (statusCode.startsWith('3')) {
    colorClass = 'bg-surprise';
    backupStatusMessage = 'REDIRECT';
  } else if (statusCode.startsWith('4')) {
    colorClass = 'bg-warning';
    backupStatusMessage = 'INVALID';
  } else if (statusCode.startsWith('5')) {
    colorClass = 'bg-danger';
    backupStatusMessage = 'ERROR';
  } else if (statusCode.startsWith('0')) {
    colorClass = 'bg-danger';
    backupStatusMessage = 'UNKNOWN';
    statusCode = '';  // Don't print a 0 status code
  } else {
    colorClass = 'bg-danger';
    backupStatusMessage = 'UNKNOWN';
  }

  return (
    <div className={classnames('tag', colorClass)}>
      <strong>{statusCode}</strong> {statusMessage || backupStatusMessage}
    </div>
  );
};

StatusTag.propTypes = {
  statusCode: PropTypes.number.isRequired,
  statusMessage: PropTypes.string
};

export default StatusTag;
