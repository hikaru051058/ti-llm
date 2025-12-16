import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as logs from "aws-cdk-lib/aws-logs";
import * as path from "path";

export class TiLlmStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const account = cdk.Stack.of(this).account;
    const region = cdk.Stack.of(this).region;

    /* ---------- Secrets (import only) ---------- */
    const deviceKeys = secretsmanager.Secret.fromSecretNameV2(
      this,
      "DeviceKeys",
      "ti-llm/device-keys"
    );
    const factorySecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      "FactorySecret",
      "ti-llm/factory-secret"
    );

    /* ---------- Lambda ---------- */
    const gatewayFn = new lambda.Function(this, "GatewayFn", {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "handler.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../lambda")),
      memorySize: 512,
      timeout: cdk.Duration.seconds(10),
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        DEVICE_KEYS_SECRET_ARN: deviceKeys.secretArn,
        DEVICE_KEYS_SECRET_NAME: deviceKeys.secretName,
        FACTORY_SECRET_ARN: factorySecret.secretArn,
        FACTORY_SECRET_NAME: factorySecret.secretName
      }
    });

    gatewayFn.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSLambdaBasicExecutionRole"
      )
    );
    gatewayFn.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "SecretsManagerReadWrite"
      )
    );

    deviceKeys.grantRead(gatewayFn);
    deviceKeys.grantWrite(gatewayFn);
    factorySecret.grantRead(gatewayFn);

    gatewayFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "secretsmanager:GetSecretValue",
          "secretsmanager:PutSecretValue",
          "secretsmanager:DescribeSecret"
        ],
        resources: [
          // 🔑 DEVICE KEYS
          `arn:aws:secretsmanager:${region}:${account}:secret:ti-llm/device-keys`,
          `arn:aws:secretsmanager:${region}:${account}:secret:ti-llm/device-keys-*`,
          // 🏭 FACTORY SECRET
          factorySecret.secretArn,
          `${factorySecret.secretArn}*`
        ]
      })
    );

    // Fallback broad allow to avoid suffix mismatches blocking access
    gatewayFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "secretsmanager:GetSecretValue",
          "secretsmanager:PutSecretValue",
          "secretsmanager:DescribeSecret"
        ],
        resources: ["*"]
      })
    );

    // Bedrock access
    gatewayFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: ["*"]
      })
    );

    /* ---------- API Gateway ---------- */
    const api = new apigw.RestApi(this, "GatewayApi", {
      deployOptions: {
        throttlingRateLimit: 1,
        throttlingBurstLimit: 5
      }
    });

    api.root.addResource("ask").addMethod(
      "POST",
      new apigw.LambdaIntegration(gatewayFn)
    );

    api.root.addResource("provision").addMethod(
      "POST",
      new apigw.LambdaIntegration(gatewayFn)
    );

    /* ---------- Monitoring ---------- */
    gatewayFn.metricErrors().createAlarm(this, "LambdaErrors", {
      threshold: 1,
      evaluationPeriods: 1
    });

    gatewayFn.metricDuration().createAlarm(this, "LambdaLatency", {
      threshold: 8000,
      evaluationPeriods: 1
    });

    /* ---------- Outputs ---------- */
    new cdk.CfnOutput(this, "GatewayApiUrl", {
      value: api.url ?? "unknown"
    });

    new cdk.CfnOutput(this, "GatewayFunctionName", {
      value: gatewayFn.functionName
    });
  }
}
