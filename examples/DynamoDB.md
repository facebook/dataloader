# Using Dataloader with DynamoDB

DynamoDB is a serveless key-value and document database, that you can pay only by the number of the requests you make, also it supports [batch get operations](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html#batchGet-property), making it good for use with DataLoader. But also, those batch operations have some [limitations](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_BatchGetItem.html) that must be accounted for.

Here is an example building a DynamoDB Dataloader using DynamoDB AWS SDK's [DocumentClient](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html). The Table used is the Movies table described at DynamoDB's official javascript [documentation](https://docs.aws.amazon.com/pt_br/amazondynamodb/latest/developerguide/GettingStarted.JavaScript.html)

```js
const AWS = require("aws-sdk");

const documentClient = new AWS.DynamoDB.DocumentClient({
    region: AWS_REGION // aws region that the dynamodb table was created e.g. us-east-1
});

const movieLoader = new Dataloader(async ids => {
    let results = [];
    let batchGetKeys = ids;

    // this retry logic is needed because of a batchGetItem API restriction that mandates that a single operation can retrieve only 
    // up to 16 MB of data, and trying to get the keys that were not processed because of this restriction,
    // if the size of your itens is predictable one alternative is to reduce the maxBatchSize to a quantity that can't exceed the 16mb limit
    while (batchGetKeys.length) {
        const dynamoCallResult = await documentClient.batchGet({ RequestItems: { "Movies": { Keys: batchGetKeys } } }).promise();

        batchGetKeys = dynamoCallResult.UnprocessedKeys && dynamoCallResult.UnprocessedKeys.Movies
            && Array.isArray(dynamoCallResult.UnprocessedKeys.Movies) ? dynamoCallResult.UnprocessedKeys : []

        results = results.concat(dynamoCallResult.Responses.Movies);
    }

    // sort result by the keys they were requested with
    const itemsHashmap = {};
    results.forEach(item => {
        itemsHashmap[JSON.stringify({ title: item.title, year: item.year })] = item;
    });
    return ids.map(id => itemsHashmap[JSON.stringify(id)] || null);
},
{
    // needed because DynamoDb uses an object to represent its keys
    cacheKeyFn: key => JSON.stringify(key),
    // needed because of an limitation of the batchGetItem command, that limits the quantity of keys in one call to 100
    maxBatchSize: 100
});

```