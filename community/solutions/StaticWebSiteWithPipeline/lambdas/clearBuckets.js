const { S3Client, ListObjectsCommand, DeleteObjectsCommand } = require("@aws-sdk/client-s3");
var resourceName = "emptyBucketToken";

exports.handler = async function(event, context) {

    if (event.RequestType == "Update" || event.RequestType == "Create") {
        await sendResponse(event, context, "SUCCESS", resourceName, {"Message" : "ClearBuckets not need to run when Stack is Created or Updated!"});
        return;
    }

    console.log("clearBuckets for =>" + JSON.stringify(event));
    var bucketName = event.ResourceProperties.bucketName;

    try {

        var data = await getBucketObjects(bucketName);
        await clearBucket(data);
        await sendResponse(event, context, "SUCCESS", resourceName, {"Message" : "Buckets Cleared!"});

    } catch (err) {await sendResponse(event, context, "FAILED", resourceName, {"Message" : err});}

};

async function getBucketObjects(bucketName) {

    var s3 = new S3Client({});
    var listParam = {"Bucket": bucketName};
    
    var data = await s3.send(new ListObjectsCommand(listParam));

    var items = data.Contents || [];
    var keys = items.map(item => {return {"Key": item.Key}});
    var param = {
        "Bucket": bucketName,
        "Delete": {"Objects": keys, "Quiet": true}
    };

    return param;
}

async function clearBucket(objectList) {
    
    var s3 = new S3Client({});
    return await s3.send(new DeleteObjectsCommand(objectList));
    
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
