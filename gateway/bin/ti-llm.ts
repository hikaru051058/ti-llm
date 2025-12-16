#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { TiLlmStack } from "../lib/ti-llm-stack";

const app = new cdk.App();

new TiLlmStack(app, "TiLlmGatewayStack", {
  env: {
    region: "us-west-2"
  }
});
