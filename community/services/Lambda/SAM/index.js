'use strict';
console.log('Loading function');

const createResponse = (statusCode, body) => {
  return {
    "statusCode": statusCode,
    "body": body || ""
  }
};

exports.handler = async (event, context) => {
  const response = createResponse(200, "Hello SAM.");
  return response;
};
