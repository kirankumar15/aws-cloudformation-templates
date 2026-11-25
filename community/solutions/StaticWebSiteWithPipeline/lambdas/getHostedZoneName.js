const { Route53Client, GetHostedZoneCommand } = require("@aws-sdk/client-route-53");

exports.handler = async function(event, context) {

    if (event.RequestType == "Update" || event.RequestType == "Delete") {
        await sendResponse(event, context, "SUCCESS", event.PhysicalResourceId, {"Message" : "HostedZone Name does not need to be Updated or Removed!"});
        return;
    }

    console.log("Get HostedZone Name for =>" + JSON.stringify(event));
    var hostedZoneId = event.ResourceProperties.hostedZoneId;
    var route53 = new Route53Client({});
    let data;
    try {
        data = await route53.send(new GetHostedZoneCommand({Id: hostedZoneId}));
    } catch (err) {
        await sendResponse(event, context, "FAILED", '', {"Message" : err});
        return;
    }

    var zoneName = data.HostedZone.Name;
    zoneName = zoneName.substring(0, zoneName.length - 1);
    await sendResponse(event, context, "SUCCESS", zoneName, {"Message" : "HostedZone Name Found!", "HostedZoneName":zoneName});

};

async function sendResponse(event, context, responseStatus, resourceId, responseData) {
    
    const responseMessage = responseStatus == "SUCCESS" ? "See the details in CloudWatch Log Stream: " + context.logStreamName : JSON.stringify(responseData.Message);

    var responseBody = JSON.stringify({
        Status: responseStatus,
        Reason: responseMessage,
        PhysicalResourceId: resourceId,
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
        Data: responseData
    });

    console.log("Sending response " + responseStatus + ": " + responseBody);

    try {
        await fetch(event.ResponseURL, {
            method: "PUT",
            headers: {
                "content-type": ""
            },
            body: responseBody
        });
    } catch (error) {
        console.log("sendResponse Error:" + error);
    }

}
