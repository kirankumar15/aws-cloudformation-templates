const { ACMClient, DescribeCertificateCommand } = require('@aws-sdk/client-acm');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

exports.handler = async (event, context) => {

    console.log('Check Certification Validation =>'+ JSON.stringify(event));

    if (event.RequestType == "Update" || event.RequestType == "Delete") {
        await sendResponse(event, context, "SUCCESS", event.PhysicalResourceId, {"Message" : "Certificate Approval Status does not need to be Updated or Removed!"});
        return;
    }

    var certificateARN = event.ResourceProperties.certificateARN;
    if (certificateARN == undefined) {
        await sendResponse(event, context, "FAILED", '', {"Message" : "Invalid Certificate ARN!"});
        return;
    }

    var numberOfCalls = event.numberOfCalls;
    if (numberOfCalls == undefined) {numberOfCalls = process.env.INVOCATION_LIMIT;}
    if (numberOfCalls == undefined) {numberOfCalls = 10;}

    if (numberOfCalls > 0) {

        await checkCertificate(event, context, numberOfCalls);

    } else {
        
        const resourceId = String(event.RequestId);
        await sendResponse(event, context, "FAILED", resourceId, {"Message":"Max function invocation reached!"});

    }
    
};

async function checkCertificate(event, context, nextCall) {

    if (nextCall > 0) {
        
        const certificateARN = event.ResourceProperties.certificateARN;
        const acm = new ACMClient({region: 'us-east-1'});
        let data;
        try {
            data = await acm.send(new DescribeCertificateCommand({CertificateArn: certificateARN}));
        } catch (err) {
            await sendResponse(event, context, "FAILED", event.PhysicalResourceId, {"Message" : err});
            return;
        }

        const resourceId = String(event.RequestId);
        const status = data.Certificate.Status;
        if (status == "ISSUED") {

            await sendResponse(event, context, "SUCCESS", resourceId, {"Message" : "Certificate " + certificateARN + " Approved!"});

        } else if (status == "INACTIVE" || status == "EXPIRED" || status == "VALIDATION_TIMED_OUT" || status == "REVOKED" || status == "FAILED") {

            await sendResponse(event, context, "FAILED", resourceId, {"Message" : "Certificate " + certificateARN + " Status is:" + status});

        } else if (status == "PENDING_VALIDATION") {

            var remaining = context.getRemainingTimeInMillis();
            await new Promise((resolve) => setTimeout(resolve, remaining / 2));

            var counter = {"numberOfCalls":nextCall -1};
            var newEvent = Object.assign(event, counter);

            const params = {
                FunctionName: context.functionName,
                InvocationType: 'Event',
                Payload: Buffer.from(JSON.stringify(newEvent)),
                Qualifier: context.functionVersion
            };
    
            const lambda = new LambdaClient({});
            return await lambda.send(new InvokeCommand(params));

        } else {await sendResponse(event, context, "FAILED", resourceId, {"Message" : "Invalid Certificate Status returned from ACM:" + status});}

    } else {await sendResponse(event, context, "FAILED", event.PhysicalResourceId, {"Message":"CheckApproval reached Invoke Limit!"})}

}

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
