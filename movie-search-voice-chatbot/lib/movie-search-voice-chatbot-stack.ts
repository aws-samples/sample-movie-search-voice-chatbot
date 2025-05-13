import path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { WebSocketIamAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as eventsources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as ddb from 'aws-cdk-lib/aws-dynamodb';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as elbv2targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import * as alb_actions from 'aws-cdk-lib/aws-elasticloadbalancingv2-actions';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import { NagSuppressions } from 'cdk-nag';

/**
 * Infrastructure stack for Movie Search Voice Chatbot application
 *
 * This stack creates:
 * - VPC and networking components
 * - Application Load Balancer with HTTPS listener
 * - Route53 DNS record and ACM certificate
 * - SQS FIFO queue for utterance processing
 * - DynamoDB table for WebSocket connections
 * - WebSocket API Gateway with Lambda integration
 * - OpenSearch Lambda function and REST API
 * - Utterance processing Lambda with Bedrock integration
 * - Web interface Lambda function
 * - Cognito user pool and authentication
 *
 * Key components:
 * - WebSocket API for real-time communication
 * - SQS queue for asynchronous utterance processing
 * - DynamoDB for connection management
 * - OpenSearch for movie database queries
 * - Amazon Bedrock for natural language processing
 * - Cognito for user authentication
 * - ALB for load balancing and HTTPS termination
 *
 * Environment variables:
 * - WEBSOCKET_URL: WebSocket API endpoint URL
 * - DYNAMODB_TABLE: DynamoDB table name
 * - UTTERANCE_QUEUE_FIFO_URL: SQS queue URL
 * - OS_REGION: OpenSearch region
 * - OS_HOST: OpenSearch domain endpoint
 * - OS_INDEX: OpenSearch index name
 * - BEDROCK_MODEL_ID: Amazon Bedrock model ID
 * - BEDROCK_MAX_TOKENS: Maximum tokens for Bedrock response
 * - BEDROCK_STREAM_TEMPERATURE: Temperature parameter for Bedrock
 * - BEDROCK_TOP_P: Top P parameter for Bedrock
 * - MOVIE_DATABASE_URL: OpenSearch API endpoint
 */

interface MovieSearchVoiceChatbotStackProps extends cdk.StackProps {
  domainName: string;
  recordName: string;
  bedrockModel: string;
  movieDatabaseIndex: string;
  demoUserEmail: string;
}

export class MovieSearchVoiceChatbotStack extends cdk.Stack {
  /**
   * Creates a new MovieSearchVoiceChatbotStack
   *
   * @param scope - Parent construct scope
   * @param id - Construct ID
   * @param props - Stack properties
   */
  constructor(scope: Construct, id: string, props: MovieSearchVoiceChatbotStackProps) {
    super(scope, id, props);

    /** Nag Suppressions */
    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-EC23',
        reason: 'ALB security group needs to allow inbound access from internet for web application access'
      },
      {
        id: 'AwsSolutions-ELB2',
        reason: 'Access logs not required for development environment'
      },
      {
        id: 'AwsSolutions-SQS3',
        reason: 'DLQ not required for this use case as messages are ephemeral'
      },
      {
        id: 'AwsSolutions-DDB3',
        reason: 'Point-in-time recovery not needed for development environment'
      },
      {
        id: 'AwsSolutions-IAM4',
        reason: 'AWS managed policies are acceptable for this use case'
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Wildcard permissions required for Lambda logging and specific service access'
      },
      {
        id: 'AwsSolutions-APIG4',
        reason: 'WebSocket API uses IAM authorization for $connect route'
      },
      {
        id: 'AwsSolutions-APIG1',
        reason: 'Access logging not required for development environment'
      },
      {
        id: 'AwsSolutions-L1',
        reason: 'Custom resource uses specific runtime version'
      },
      {
        id: 'AwsSolutions-OS1',
        reason: 'OpenSearch domain does not require VPC for this use case'
      },
      {
        id: 'AwsSolutions-OS3',
        reason: 'IP allowlisting not required as access is controlled via IAM'
      },
      {
        id: 'AwsSolutions-OS4',
        reason: 'Dedicated master nodes not required for development environment'
      },
      {
        id: 'AwsSolutions-OS8',
        reason: 'Encryption at rest not required for development environment'
      },
      {
        id: 'AwsSolutions-OS9',
        reason: 'Slow logs publishing not required for development environment'
      },
      {
        id: 'AwsSolutions-APIG2',
        reason: 'Request validation not required for this API'
      },
      {
        id: 'AwsSolutions-APIG3',
        reason: 'WAF not required for development environment'
      },
      {
        id: 'AwsSolutions-COG4',
        reason: 'Cognito authorizer not required for this endpoint'
      },
      {
        id: 'AwsSolutions-COG1',
        reason: 'Custom password policy not required for development environment'
      },
      {
        id: 'AwsSolutions-COG2',
        reason: 'MFA not required for development environment'
      },
      {
        id: 'AwsSolutions-COG3',
        reason: 'Advanced security mode not required for development environment'
      }
    ]);

    /** VPC for application resources */
    const vpc = ec2.Vpc.fromLookup(this, 'vpc', {
      isDefault: true,
    });

    /** Security group for load balancer */
    const loadBalancerSecurityGroup = new ec2.SecurityGroup(
      this,
      'loadBalancerSecurityGroup',
      {
        vpc: vpc,
        allowAllOutbound: false,
      }
    );

    /** Allow HTTPS ingress from load balancer */
    loadBalancerSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443)
    );

    /** Allow HTTPS egress from load balancer */
    loadBalancerSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443)
    );

    /** Application load balancer */
    const loadBalancer = new elbv2.ApplicationLoadBalancer(
      this,
      'loadBalancer',
      {
        vpc: vpc,
        internetFacing: true,
        securityGroup: loadBalancerSecurityGroup,
      }
    );

    /** Route53 hosted zone for DNS */
    const hostedZone = route53.HostedZone.fromLookup(this, 'hostedZone', {
      domainName: props.domainName,
    });

    /** DNS A record for application */
    const dnsRecord = new route53.ARecord(this, 'dnsRecord', {
      zone: hostedZone,
      recordName: props.recordName,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.LoadBalancerTarget(loadBalancer)
      ),
      deleteExisting: true,
    });
    dnsRecord.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    /** SSL/TLS certificate for HTTPS */
    const certificate = new acm.Certificate(this, 'certificate', {
      domainName: `${props.recordName}.${props.domainName}`,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });
    certificate.node.addDependency(dnsRecord);

    /** SQS FIFO queue for utterance processing */
    const utteranceQueueFifo = new sqs.Queue(this, 'utteranceQueueFifo', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      visibilityTimeout: cdk.Duration.minutes(5), // must be same as Lambda function
      fifo: true,
      contentBasedDeduplication: false,
      enforceSSL: true,
    });

    /** DynamoDB table for WebSocket connections */
    const websocketTable = new ddb.Table(this, 'websocketTable', {
      partitionKey: {
        name: 'connectionId',
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    /** IAM role for WebSocket handler Lambda */
    const websocketHandlerRole = new iam.Role(this, 'websocketHandlerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    /** CloudWatch Logs permissions for WebSocket handler */
    websocketHandlerRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'logs:CreateLogStream',
          'logs:DescribeLogStreams', 
          'logs:PutLogEvents',
          'logs:DescribeLogGroups',
        ],
        resources: [
          `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/*`,
        ],
      })
    );

    /** SQS permissions for WebSocket handler */
    websocketHandlerRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sqs:SendMessage'],
        resources: [utteranceQueueFifo.queueArn],
      })
    );

    /** DynamoDB permissions for WebSocket handler */
    websocketHandlerRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:PutItem',
          'dynamodb:GetItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
        ],
        resources: [websocketTable.tableArn],
      })
    );

    /** Transcribe permissions for WebSocket handler */
    websocketHandlerRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['transcribe:StartStreamTranscriptionWebSocket'],
        resources: ['*'],
      })
    );

    /** CloudWatch metrics permissions for WebSocket handler */
    websocketHandlerRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
      })
    );

    /** WebSocket handler Lambda function */
    const websocketHandler = new lambda.Function(this, 'websocketHandler', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../src'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_13.bundlingImage,
          command: [
            'bash',
            '-c',
            [
              'pip install -r websocket-handler-lambda/requirements.txt -t /asset-output',
              'cp websocket-handler-lambda/* /asset-output',
            ].join(' && '),
          ],
        },
      }),
      handler: 'websocket_handler.lambda_handler',
      runtime: lambda.Runtime.PYTHON_3_13,
      architecture: lambda.Architecture.ARM_64,
      role: websocketHandlerRole,
      logRetention: logs.RetentionDays.ONE_DAY,
      environment: {},
      timeout: cdk.Duration.seconds(60),
    });

    /** WebSocket API Gateway */
    const websocketApi = new apigwv2.WebSocketApi(this, 'websocketApi', {
      apiName: 'websocketApi',
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration(
          'connectRouteIntegration',
          websocketHandler
        ),
        authorizer: new WebSocketIamAuthorizer(),
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration(
          'disconnectRouteIntegration',
          websocketHandler
        ),
      },
      defaultRouteOptions: {
        integration: new WebSocketLambdaIntegration(
          'defaultRouteIntegration',
          websocketHandler
        ),
      },
    });

    /** Ping route for WebSocket API */
    websocketApi.addRoute('ping', {
      integration: new WebSocketLambdaIntegration('ping', websocketHandler),
      returnResponse: true,
    });

    /** Start process route for WebSocket API */
    websocketApi.addRoute('startProcess', {
      integration: new WebSocketLambdaIntegration(
        'startProcess',
        websocketHandler
      ),
      returnResponse: true,
    });

    /** Stop process route for WebSocket API */
    websocketApi.addRoute('stopProcess', {
      integration: new WebSocketLambdaIntegration(
        'stopProcess',
        websocketHandler
      ),
      returnResponse: true,
    });

    /** Send utterance route for WebSocket API */
    websocketApi.addRoute('sendUtterance', {
      integration: new WebSocketLambdaIntegration(
        'sendUtteranceIntegration',
        websocketHandler
      ),
      returnResponse: false,
    });

    /** Development stage for WebSocket API */
    const webSocketStageDev = new apigwv2.WebSocketStage(
      this,
      'webSocketStageDev',
      {
        webSocketApi: websocketApi,
        stageName: 'dev',
        autoDeploy: true,
      }
    );

    /** Custom resource to update WebSocket handler environment variables */
    const websocketHandlerUpdateEnvironment = new cr.AwsCustomResource(
      this,
      'websocketHandlerUpdateEnvironment',
      {
        policy: cr.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            resources: [websocketHandler.functionArn],
            actions: ['lambda:UpdateFunctionConfiguration'],
          }),
        ]),
        onCreate: {
          service: 'Lambda',
          action: 'updateFunctionConfiguration',
          parameters: {
            FunctionName: websocketHandler.functionName,
            Environment: {
              Variables: {
                WEBSOCKET_URL: webSocketStageDev.callbackUrl,
                DYNAMODB_TABLE: websocketTable.tableName,
                UTTERANCE_QUEUE_FIFO_URL: utteranceQueueFifo.queueUrl,
              },
            },
          },
          physicalResourceId: cr.PhysicalResourceId.of(Date.now().toString()),
        },
        onUpdate: {
          service: 'Lambda',
          action: 'updateFunctionConfiguration',
          parameters: {
            FunctionName: websocketHandler.functionName,
            Environment: {
              Variables: {
                WEBSOCKET_URL: webSocketStageDev.callbackUrl,
                DYNAMODB_TABLE: websocketTable.tableName,
                UTTERANCE_QUEUE_FIFO_URL: utteranceQueueFifo.queueUrl,
              },
            },
          },
          physicalResourceId: cr.PhysicalResourceId.of(Date.now().toString()),
        },
      }
    );

    /** IAM role for OpenSearch Lambda */
    const opensearchLamdbaRole = new iam.Role(this, 'opensearchLamdbaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    /** OpenSearch domain */
    const opensearchDomain = new opensearch.Domain(this, 'opensearchDomain', {
      version: opensearch.EngineVersion.OPENSEARCH_2_9,
      capacity: {
        dataNodes: 4,
        dataNodeInstanceType: 'r7g.large.search',
        multiAzWithStandbyEnabled: false,
      },
      ebs: {
        volumeSize: 100,
        volumeType: ec2.EbsDeviceVolumeType.GP3,
        throughput: 125,
        iops: 3000,
      },
      zoneAwareness: {
        enabled: true,
        availabilityZoneCount: 2,
      },
      nodeToNodeEncryption: true,
      enforceHttps: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Change to RETAIN for production
    });

    /** Access policy for OpenSearch domain */
    opensearchDomain.addAccessPolicies(
      new iam.PolicyStatement({
        actions: ['es:ESHttpPost', 'es:ESHttpGet', 'es:ESHttpPut'],
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('lambda.amazonaws.com')],
        resources: [`${opensearchDomain.domainArn}/*`],
      })
    );

    /** CloudWatch Logs permissions for OpenSearch Lambda */
    opensearchLamdbaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'logs:CreateLogStream',
          'logs:DescribeLogStreams',
          'logs:PutLogEvents',
          'logs:DescribeLogGroups',
        ],
        resources: [
          `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/*`,
        ],
      })
    );

    /** OpenSearch permissions for OpenSearch Lambda */
    opensearchLamdbaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['es:ESHttpPost', 'es:ESHttpGet', 'es:ESHttpPut'],
        resources: [`${opensearchDomain.domainArn}/*`],
      })
    );

    /** OpenSearch handler Lambda function */
    const opensearchHandler = new lambda.Function(this, 'opensearchHandler', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../src'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_13.bundlingImage,
          command: [
            'bash',
            '-c',
            [
              'pip install -r movie-database-handler-lambda/requirements.txt -t /asset-output',
              'cp movie-database-handler-lambda/* /asset-output',
            ].join(' && '),
          ],
        },
      }),
      handler: 'opensearch_handler.lambda_handler',
      runtime: lambda.Runtime.PYTHON_3_13,
      architecture: lambda.Architecture.ARM_64,
      role: opensearchLamdbaRole,
      timeout: cdk.Duration.seconds(30),
      environment: {
        OS_REGION: this.region,
        OS_HOST: opensearchDomain.domainEndpoint,
        OS_INDEX: props.movieDatabaseIndex,
      },
    });

    /** REST API for OpenSearch */
    const opensearchApi = new apigateway.RestApi(this, 'opensearchApi', {
      restApiName: 'movie-database-search-api',
      deployOptions: {
        stageName: 'dev',
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
      cloudWatchRole: true,
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL],
      },
    });

    /** Movies resource for OpenSearch API */
    const movies = opensearchApi.root.addResource('movies');

    /** GET method for movies resource */
    movies.addMethod(
      'GET',
      new apigateway.LambdaIntegration(opensearchHandler, {
        proxy: true,
        requestTemplates: {
          'application/json': JSON.stringify({
            statusCode: 200,
          }),
        },
      }),
      {
        authorizationType: apigateway.AuthorizationType.NONE,
      }
    );

    /** IAM role for utterance handler Lambda */
    const utteranceHandlerRole = new iam.Role(this, 'utteranceHandlerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    /** CloudWatch Logs permissions for utterance handler */
    utteranceHandlerRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'logs:CreateLogStream',
          'logs:DescribeLogStreams',
          'logs:PutLogEvents',
          'logs:DescribeLogGroups',
        ],
        resources: [
          `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/*`,
        ],
      })
    );

    /** Bedrock permissions for utterance handler */
    utteranceHandlerRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
        ],
        resources: ['*'],
      })
    );

    /** DynamoDB permissions for utterance handler */
    utteranceHandlerRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:PutItem',
          'dynamodb:GetItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
        ],
        resources: [websocketTable.tableArn],
      })
    );

    /** WebSocket API permissions for utterance handler */
    utteranceHandlerRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['execute-api:ManageConnections'],
        resources: [
          websocketApi.arnForExecuteApiV2('*', 'dev'),
        ],
      })
    );

    /** Utterance handler Lambda function */
    const utteranceHandler = new lambda.Function(this, 'utteranceHandler', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../src'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_13.bundlingImage,
          command: [
            'bash',
            '-c',
            [
              'pip install -r utterance-handler-lambda/requirements.txt -t /asset-output',
              'cp utterance-handler-lambda/* /asset-output',
            ].join(' && '),
          ],
        },
      }),
      handler: 'utterance_handler.lambda_handler',
      runtime: lambda.Runtime.PYTHON_3_13,
      architecture: lambda.Architecture.ARM_64,
      role: utteranceHandlerRole,
      logRetention: logs.RetentionDays.ONE_DAY,
      environment: {
        DYNAMODB_TABLE: websocketTable.tableName,
        WEBSOCKET_URL: webSocketStageDev.callbackUrl,
        REGION: cdk.Aws.REGION,
        BEDROCK_MODEL_ID: props.bedrockModel,
        BEDROCK_MAX_TOKENS: '1024',
        BEDROCK_STREAM_TEMPERATURE: '0.1',
        BEDROCK_TOP_P: '0.4',
        MOVIE_DATABASE_URL: `${opensearchApi.url}/movies`,
      },
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      ephemeralStorageSize: cdk.Size.mebibytes(1024),
    });

    /** SQS event source for utterance handler */
    utteranceHandler.addEventSource(
      new eventsources.SqsEventSource(utteranceQueueFifo, {
        batchSize: 1,
        maxConcurrency: 10,
      })
    );

    /** IAM role for interface handler Lambda */
    const interfaceHandlerRole = new iam.Role(this, 'interfaceHandlerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    /** CloudWatch Logs permissions for interface handler */
    interfaceHandlerRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'logs:CreateLogStream',
          'logs:DescribeLogStreams',
          'logs:PutLogEvents',
          'logs:DescribeLogGroups',
        ],
        resources: [
          `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/*`,
        ],
      })
    );

    /** WebSocket API permissions for interface handler */
    interfaceHandlerRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['execute-api:Invoke'],
        resources: [websocketApi.arnForExecuteApiV2('$connect', 'dev')],
      })
    );

    /** DynamoDB permissions for interface handler */
    interfaceHandlerRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:Query'],
        resources: [websocketTable.tableArn],
      })
    );

    /** Interface handler Lambda function */
    const interfaceHandler = new lambda.Function(this, 'interfaceHandler', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../src'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_13.bundlingImage,
          command: [
            'bash',
            '-c',
            [
              // Install Node.js and npm
              'curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -',
              'dnf install -y nodejs',

              // Install browserify and dependencies
              'npm install -g browserify',

              // Install npm dependencies
              'cd interface-handler-lambda',
              'npm install',

              // Run browserify
              'browserify lib/javascript.js -o assets/js/javascript.js -d',

              // Install Python dependencies
              'pip install -r requirements.txt -t /asset-output',
              'cp *.py /asset-output',
              'mkdir /asset-output/assets',
              'cp -r assets/* /asset-output/assets',
              'mkdir /asset-output/html',
              'cp html/* /asset-output/html',
            ].join(' && '),
          ],
          user: 'root', // This ensures we have the right permissions
        },
      }),
      handler: 'interface_handler.lambda_handler',
      runtime: lambda.Runtime.PYTHON_3_13,
      architecture: lambda.Architecture.ARM_64,
      role: interfaceHandlerRole,
      logRetention: logs.RetentionDays.ONE_DAY,
      environment: {
        WEBSOCKET_URL: webSocketStageDev.callbackUrl,
        DYNAMODB_TABLE: websocketTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    /** Target group for load balancer */
    const loadBalancerTargetGroup = new elbv2.ApplicationTargetGroup(
      this,
      'loadBalancerTargetGroup',
      {
        targets: [new elbv2targets.LambdaTarget(interfaceHandler)],
        healthCheck: {
          enabled: false,
        },
      }
    );

    /** Cognito user pool */
    const userPool = new cognito.UserPool(this, 'userPool', {
      userPoolName: `${props.recordName}.${props.domainName}`,
      mfa: cognito.Mfa.OFF,
      signInCaseSensitive: true,
      selfSignUpEnabled: false,
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    /** Cognito user pool client */
    const userPoolClient = new cognito.UserPoolClient(this, 'userPoolClient', {
      userPool: userPool,
      generateSecret: true,
      authFlows: {
        userPassword: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.OPENID],
        callbackUrls: [
          `https://${props.recordName}.${props.domainName}/oauth2/idpresponse`,
        ],
      },
    });

    /** Cognito user pool client configuration */
    const cfnClient = userPoolClient.node
      .defaultChild as cognito.CfnUserPoolClient;
    cfnClient.addPropertyOverride('RefreshTokenValidity', 30);
    cfnClient.addPropertyOverride('TokenValidityUnits', {
      RefreshToken: 'days',
    });
    cfnClient.addPropertyOverride('SupportedIdentityProviders', ['COGNITO']);

    /** Cognito user pool domain */
    const userPoolDomain = new cognito.UserPoolDomain(this, 'userPoolDomain', {
      userPool: userPool,
      cognitoDomain: {
        domainPrefix: `${this.stackName.toLowerCase()}-${props.recordName.toLowerCase()}`,
      },
    });

    /** Cognito default user */
    new cognito.CfnUserPoolUser(this, 'cognitoUser', {
      userPoolId: userPool.userPoolId,
      username: 'demo',
      userAttributes: [
        {
          name: 'email',
          value: props.demoUserEmail,
        },
      ],
    });

    /** HTTPS listener for load balancer */
    const loadBalancerListener = loadBalancer.addListener(
      'loadBalancerListener',
      {
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [certificate],
        defaultAction: elbv2.ListenerAction.fixedResponse(504, {
          contentType: 'text/plain',
          messageBody: 'Unauthorized Access',
        }),
      }
    );

    /** Cognito authentication action for load balancer */
    loadBalancerListener.addAction('httpSListenerAction', {
      priority: 1,
      conditions: [elbv2.ListenerCondition.pathPatterns(['/*'])],
      action: new alb_actions.AuthenticateCognitoAction({
        userPool: userPool,
        userPoolClient: userPoolClient,
        userPoolDomain: userPoolDomain,
        next: elbv2.ListenerAction.forward([loadBalancerTargetGroup]),
      }),
    });

    /** Application URL output */
    new cdk.CfnOutput(this, 'applicationUrl', {
      value: `https://${props.recordName}.${props.domainName}/`,
    });

    /** Nag Suppression rules */
    
  }
}
