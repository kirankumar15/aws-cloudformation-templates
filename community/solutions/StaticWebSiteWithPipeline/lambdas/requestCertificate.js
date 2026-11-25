const { ACMClient, RequestCertificateCommand, DeleteCertificateCommand } = require("@aws-sdk/client-acm");
const { Route53Client, GetHostedZoneCommand } = require("@aws-sdk/client-route-53");
 
exports.handler = async function(event, context) {

    const cfOperation = String(event.RequestType);
    if (cfOperation == "Create") {await createResource(event, context);
    } else if (cfOperation == "Update") {await updateResource(event, context);
    } else if (cfOperation == "Delete") {await deleteResource(event, context);
    } else {await sendResponse(event, context, "FAILED", '', {"Message":"Unrecognized Cloud Formation RequestType!"});}

};

async function createResource(event, context) {

    console.log("Request Public Certificate. Event =>" + JSON.stringify(event))

    var hostedZoneId = event.ResourceProperties.hostedZoneId;
    var hostName = event.ResourceProperties.hostName;
    var extraDomains = event.ResourceProperties.extraDomains;

    var route53 = new Route53Client({});
    let data;
    try {
        data = await route53.send(new GetHostedZoneCommand({Id: hostedZoneId}));
    } catch (err) {
        await sendResponse(event, context, "FAILED", '', {"Message" : err});
        return;
    }

    var zoneName = data.HostedZone.Name;
    var domainName =  hostName + "." + zoneName.substring(0, zoneName.length-1);

    var executionInfo = {
        HostedZoneName:zoneName,
        DomainName: domainName,
        AlternativeDomains: extraDomains
    };

    await requestCertificate(event, context, executionInfo);

}

async function requestCertificate(event, context, info) {

    const token = String(info.DomainName).split('.').join('').substr(0, 30);

    var acm_params = {
        DomainName: info.DomainName,
        ValidationMethod: 'DNS',
        IdempotencyToken: token,
        Options: {CertificateTransparencyLoggingPreference: 'ENABLED'},
    };
    
    if (Array.isArray(info.AlternativeDomains) && info.AlternativeDomains.length > 0) {
        acm_params.SubjectAlternativeNames = info.AlternativeDomains;
    }
    
    var acm = new ACMClient({region: 'us-east-1'});
    try {
        var data = await acm.send(new RequestCertificateCommand(acm_params));
        var arn = data.CertificateArn;
        await sendResponse(event, context, "SUCCESS", arn, {"Message" : "Resource creation successful!", "ResourceId":arn});
    } catch (err) {
        await sendResponse(event, context,"FAILED", "NOTCREATED", {"Message" : err.stack});
    }

}

async function updateResource(event, context) {

    console.log("Update Public Certificate. Event =>" + JSON.stringify(event));

    const resourceId = event.PhysicalResourceId;
    if (resourceId != undefined) {

        await sendResponse(event, context, "SUCCESS", resourceId, {"Message":"Resource update not implemented!"});

    } else {await sendResponse(event, context, "SUCCESS", '', {"Message":"Resource update not implemented!"});}

}

async function deleteResource(event, context) {

    console.log("Delete Public Certificate. Event =>" + JSON.stringify(event));

    const resourceId = event.PhysicalResourceId;
    if (resourceId != undefined && String(resourceId) != "" && String(resourceId) != "NOTCREATED") {

        var acm = new ACMClient({region: 'us-east-1'});
        try {
            await acm.send(new DeleteCertificateCommand({CertificateArn: resourceId}));
            await sendResponse(event, context, "SUCCESS", resourceId, {"Message" : "Resource deletion successfull!"});
        } catch (err) {
            await sendResponse(event, context,"FAILED", resourceId, {"Message" : err});
        }

    } else {await sendResponse(event, context, "SUCCESS", 'NOTCREATED', {"Message":"Resource was not created, so it doesn't need to be removed!"});}
    
}

async function sendResponse(event, context, responseStatus, resourceId, responseData) {
    
    const responseMessage = responseStatus == "SUCCESS" ? "See the details in CloudWatch Log Stream: " + context.logStreamName : JSON.stringify(responseData.Message)

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
