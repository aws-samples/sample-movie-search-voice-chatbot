#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MovieSearchVoiceChatbotStack } from '../lib/movie-search-voice-chatbot-stack';
import { AwsSolutionsChecks } from 'cdk-nag'
import { Aspects } from 'aws-cdk-lib';

const app = new cdk.App();
// Add the cdk-nag AwsSolutions Pack with extra verbose logging enabled.
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }))

new MovieSearchVoiceChatbotStack(app, 'MovieSearchVoiceChatbotStack', {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */
  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },

  // Configuration constants
  /** Domain name for the application */
  domainName: 'example.com',  // 'example.com'
  /** Record name for DNS */
  recordName: 'movie-search-voice-chatbot', // 'movie-search-voice-chatbot'
  /** Bedrock model identifier */
  bedrockModel: 'us.amazon.nova-pro-v1:0',
  /** OpenSearch index name for movie database */
  movieDatabaseIndex: 'movie_database_index',
  /** Demo user email address */
  demoUserEmail: 'demo@example.com',

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});
