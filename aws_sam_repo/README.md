# ProofAfterPickup - AWS SAM Application Stack

Production-grade AWS Serverless Application Model (SAM) backend for **ProofAfterPickup** — Next-Gen AWS Logistics & Delivery AI Verification Platform.

## Architecture Highlights
- **AWS SAM (CloudFormation)**: Infrastructure as Code for API Gateway, Lambda, DynamoDB, S3, Cognito.
- **Python 3.12 Lambdas**: Modular function handlers with X-Ray tracing.
- **DynamoDB Conditional Writes**: Guarantees zero duplicate pickups or illegal state transitions using `attribute_not_exists(PK)` and state validation expressions.
- **Strict Idempotency Keys**: Network-resilient `Idempotency-Key` checking via dedicated TTL lock table.
- **Amazon Bedrock / Rekognition**: Multimodal AI photo inspection for damage detection, doorstep validation, and fraud risk scores.
- **Cognito JWT RBAC**: Custom role claims (`Driver`, `Recipient`, `Admin`).

## Deployment Instructions

### Prerequisites
1. [AWS CLI v2](https://aws.amazon.com/cli/)
2. [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
3. Python 3.12+

### 1. Build SAM Application
```bash
sam build
```

### 2. Deploy to AWS
```bash
sam deploy --guided
```

When prompted:
- **Stack Name**: `proof-after-pickup-stack`
- **AWS Region**: `us-east-1` (or your preferred region)
- **Confirm changes before deploy**: `Y`
- **Allow SAM CLI IAM role creation**: `Y`
- **Save arguments to configuration file**: `Y`

### Local Testing
```bash
sam local start-api
```
Access endpoint at `http://127.0.0.1:3000/pickups`.
