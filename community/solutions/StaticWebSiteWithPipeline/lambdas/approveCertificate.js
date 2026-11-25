const { ACMClient, DescribeCertificateCommand } = require("@aws-sdk/client-acm");
const { Route53Client, ChangeResourceRecordSetsCommand } = require("@aws-sdk/client-route-53");
 
exports.handler = async function(event, context) {

    const cfOperation = String(event.RequestType);
    if (cfOperation == "Create") {await createResource(event, context);
    } else if (cfOperation == "Update") {await updateResource(event, context);
    } else if (cfOperation == "Delete") {await deleteResource(event, context);
    } else {await sendResponse(event, context, "FAILED", '', {"Message":"Unrecognized Cloud Formation RequestType!"});}

};

async function getCertificateInfo(certificateARN) {

    var acm = new ACMClient({region: 'us-east-1'});
    const data = await acm.send(new DescribeCertificateCommand({CertificateArn: certificateARN}));

    const result = {
        "domainName": data.Certificate.DomainName,
        "resourceRecords": data.Certificate.DomainValidationOptions
    }

    return result;

}

async function createResource(event, context) {

    console.log("Approve Public Certificate. Event =>" + JSON.stringify(event))

    const certificateARN = event.ResourceProperties.certificateARN;
    if (certificateARN == undefined) {
        await sendResponse(event, context, "FAILED", 'NOTCREATED', {"Message" : "Invalid Certificate ARN!"});
        return;
    }

    let data;
    try {
        data = await getCertificateInfo(certificateARN);
    } catch (err) {
        await sendResponse(event, context, "FAILURE", "NOTCREATED", {"Message" : err});
        return;
    }

    var hostedZoneId = event.ResourceProperties.hostedZoneId;
    var domainName = data.domainName;
    var resourceRecords = JSON.stringify(data.resourceRecords);

    var operationInfo = {
        "hostedZoneId":hostedZoneId,
        "domainName": domainName,
        "resourceRecords": resourceRecords
    };

    await createRoute53Records(event, context, operationInfo);

}

async function createRoute53Records(event, context, info) {

    var createBatch = {Changes: [], Comment: "Insert AWS ACM Validation endpoint for " + info.domainName};
    var records = JSON.parse(info.resourceRecords);
    var arraySize = records.length;

    if (arraySize > 0) {

        for (var i = 0; i < arraySize; i++) {
            
            var record = records[i];
            var change = {"Action": "CREATE", "ResourceRecordSet": {"Name": record.ResourceRecord.Name, "ResourceRecords": [{"Value": record.ResourceRecord.Value}], "TTL": 60, "Type": record.ResourceRecord.Type}};
            createBatch.Changes.push(change);

        }
        
        const operation = {
            "HostedZoneId": info.hostedZoneId,
            "ChangeBatch": createBatch
        };

        var resourceId = info.domainName;
        var route53 = new Route53Client({});
        try {
            await route53.send(new ChangeResourceRecordSetsCommand(operation));
            await sendResponse(event, context, "SUCCESS", resourceId, {"Message" : "RecordSet created in Route53"});
        } catch (err) {
            await sendResponse(event, context, "FAILED", resourceId, {"Message" : err});
        }

    } else {await sendResponse(event, context, "FAILED", "NOTCREATED", {"Message" : "Public Certificate does not support DNS Validation!"});}

}

async function updateResource(event, context) {

    console.log("Update Certificate Validation URL. Event =>" + JSON.stringify(event));

    const resourceId = JSON.parse(event.PhysicalResourceId);
    if (resourceId.length > 0) {

        await sendResponse(event, context, "SUCCESS", resourceId, {"Message":"Resource update not implemented!"});

    } else {await sendResponse(event, context, "SUCCESS", '', {"Message":"Resource update not implemented!"});}

}

async function deleteResource(event, context) {

    console.log("Delete Certificate Validation URL. Event =>" + JSON.stringify(event));

    const certificateARN = event.ResourceProperties.certificateARN;
    const resourceId = event.PhysicalResourceId;

    if (resourceId != undefined && resourceId != "NOTCREATED") {

        let data;
        try {
            data = await getCertificateInfo(certificateARN);
        } catch (err) {
            await sendResponse(event, context, "FAILURE", resourceId, {"Message" : err});
            return;
        }

        var hostedZoneId = event.ResourceProperties.hostedZoneId;
        var domainName = data.domainName;
        var resourceRecords = JSON.stringify(data.resourceRecords);

        var operationInfo = {
            "resourceId": resourceId,
            "hostedZoneId":hostedZoneId,
            "domainName": domainName,
            "resourceRecords": resourceRecords
        };

        await deleteRoute53Records(event, context, operationInfo);

    } else {await sendResponse(event, context, "SUCCESS", resourceId, {"Message":"Resource was not created, so it doesn't need to be removed!"});}

}

async function deleteRoute53Records(event, context, info) {

    var resourceId = info.resourceId;
    var removeBatch = {Changes: [], Comment: "Remove AWS ACM Validation endpoint for " + event.domainName};
    var records = JSON.parse(info.resourceRecords);
    var arraySize = records.length;

    if (arraySize > 0) {

        for (var i = 0; i < arraySize; i++) {
            
            var record = records[i];
            var change = {"Action": "DELETE", "ResourceRecordSet": {"Name": record.ResourceRecord.Name, "ResourceRecords": [{"Value": record.ResourceRecord.Value}], "TTL": 60, "Type": record.ResourceRecord.Type}};
            removeBatch.Changes.push(change);

        }
        
        const operation = {
            "HostedZoneId": info.hostedZoneId,
            "ChangeBatch": removeBatch
        };

        var route53 = new Route53Client({});
        try {
            await route53.send(new ChangeResourceRecordSetsCommand(operation));
            await sendResponse(event, context, "SUCCESS", resourceId, {"Message" : "RecordSet created in Route53"});
        } catch (err) {
            await sendResponse(event, context, "FAILED", resourceId, {"Message" : err});
        }

    } else {await sendResponse(event, context, "FAILED", resourceId, {"Message" : "Public Certificate does not support DNS Validation!"});}

}

async function sendResponse(event, context, responseStatus, resourceId, responseData) {

    var responseBody = JSON.stringify({
        Status: responseStatus,
        Reason: "See the details in CloudWatch Log Stream: " + context.logStreamName,
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
