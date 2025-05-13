# Voice-Enabled Movie Search Chatbot with AWS Bedrock Integration

A real-time voice-enabled chatbot that helps users discover movies and TV shows through natural conversations. The application combines voice recognition, natural language processing, and a comprehensive movie database to provide intelligent, context-aware recommendations and information.

The chatbot leverages AWS Bedrock for natural language understanding and generation, providing human-like responses to user queries about movies, TV shows, and documentaries. It features real-time voice transcription through Amazon Transcribe, secure WebSocket communication for instant responses, and a rich web interface for seamless interaction.

## Repository Structure

```text
movie-search-voice-chatbot/
├── bin/                          # CDK application entry point
├── lib/                          # Infrastructure as code definitions
├── src/                          # Application source code
│   ├── interface-handler-lambda/ # Web interface and WebSocket handling
│   │   ├── assets/               # Static assets (CSS, images)
│   │   ├── html/                 # HTML templates
│   │   └── lib/                  # Client-side JavaScript
│   ├── movie-database-lambda/    # OpenSearch movie database integration
│   ├── utterance-handler-lambda/ # Natural language processing with Bedrock
│   └── websocket-handler-lambda/ # WebSocket connection management
└── test/                         # Test files for infrastructure
```

## Usage Instructions

### Prerequisites

- Node.js 18.x or later
- Python 3.12 or later
- AWS CLI configured with appropriate credentials
- AWS CDK CLI installed (`npm install -g aws-cdk`)

### Installation

1. Clone the repository and install dependencies:

```bash
# Clone the repository
git clone <repository-url>
cd movie-search-voice-chatbot

# Install CDK dependencies
npm install

# Install Python dependencies for each Lambda function
cd src/interface-handler-lambda
pip install -r requirements.txt

cd ../movie-database-handler-lambda
pip install -r requirements.txt

cd ../utterance-handler-lambda
pip install -r requirements.txt

cd ../websocket-handler-lambda
pip install -r requirements.txt
```

2. Deploy the infrastructure:

```bash
# Bootstrap CDK (first time only)
cdk bootstrap

# Deploy the stack
cdk deploy
```

### Quick Start

1. Access the web interface using the provided URL after deployment
2. Click the microphone button to start voice input
3. Ask questions about movies or TV shows, such as:
   - "Tell me about The Big Lebowski"
   - "What TV shows has John Goodman been in?"
   - "Recommend a comedy from the 90s"

### More Detailed Examples

```javascript
// Example: Sending a text query
const query = "Tell me about The Big Lebowski";
websocketApplication.send(JSON.stringify({
  action: 'sendUtterance',
  utterance: query
}));

// Example: Starting voice input
document.getElementById('startProcessButton').click();
// Speak your query...
document.getElementById('stopProcessButton').click();
```

### Troubleshooting

1. WebSocket Connection Issues
   - Error: "Failed to connect to WebSocket"
   - Check if the WebSocket URL is correct in the environment variables
   - Verify AWS credentials have appropriate permissions
   - Check browser console for detailed error messages

2. Voice Recognition Problems
   - Ensure microphone permissions are granted in the browser
   - Check if the correct audio input device is selected
   - Verify Amazon Transcribe service is available in your region

3. No Response from Chatbot
   - Check DynamoDB table for conversation history
   - Verify Bedrock model access and permissions
   - Check CloudWatch logs for Lambda function errors

## Data Flow

The application processes user input through a series of AWS services to provide intelligent responses about movies and TV shows.

```ascii
User Input (Voice/Text) -> WebSocket API Gateway
    -> Transcribe (Voice) -> SQS Queue
    -> Utterance Handler Lambda -> Bedrock
    -> Movie Database Lambda (OpenSearch)
    -> WebSocket Response -> User Interface
```

Key component interactions:

1. User input is captured through the web interface and sent via WebSocket
2. Voice input is transcribed in real-time using Amazon Transcribe
3. Utterances are processed by AWS Bedrock for natural language understanding
4. Movie information is retrieved from OpenSearch database
5. Responses are streamed back to the user through WebSocket connection
6. Conversation history is maintained in DynamoDB
7. Authentication is handled through Cognito user pools

## Infrastructure

![Infrastructure diagram](/docs/infra.svg)
The application is deployed using AWS CDK with the following resources:

Lambda Functions:

- interface-handler: Serves web interface and manages WebSocket connections
- movie-database-handler: Interfaces with OpenSearch for movie queries
- utterance-handler: Processes natural language with Bedrock
- websocket-handler: Manages WebSocket lifecycle and message routing

API Gateway:

- WebSocket API for real-time communication
- REST API for movie database queries

Storage:

- DynamoDB table for WebSocket connections and conversation history
- OpenSearch domain for movie database

Additional Services:

- Amazon Cognito for user authentication
- Application Load Balancer for HTTPS termination
- Route53 for DNS management
- ACM for SSL/TLS certificates

## Architecture

![Architecture diagram](/docs/movie-search-chatbot.drawio.svg)

1. The client initiates a request to the application URL using their web browser.
2. The client is unauthenticated and is redirected to a login page.
3. **Amazon Cognito** authenticates the client and returns a session token.
4. Browser redirects to application page which hits at an **Application Load Balancer**, which validates the session token and forwards the request to the target group.
5. An **AWS Lambda** function receives the request and returns static HTML, CSS, and JavaScript assets, together with dynamic pre-signed URLs for accessing **Amazon Transcribe** and **Amazon API Gateway**. The HTML application is loaded locally in the browser.
6. The application initiates a WebSocket connection to **Amazon Transcribe** streaming service using the pre-signed URL. As the application user speaks into their microphone their audio utterance is streamed to **Amazon Transcribe** which converts the audio into text and streams the response back.
7. The application initiates a second WebSocket connection to **Amazon API Gateway** using the pre-signed URL. It streams the text utterance to the A**mazon API Gateway** endpoint.
8. The inbound payload is received by an **AWS Lambda** function called WebSocket Handler.
9. The WebSocket Handler stores the WebSocket connection ID in an **Amazon DynamoDB** table.
10. The WebSocket Handler puts the inbound payload into an **Amazon Simple Queue Service** (SQS) first-in first-out queue.
11. **SQS** triggers the invocation of **AWS Lambda** function Utterance Handler and pass the inbound payload.
12. The Utterance Handler retrieves history associated with the WebSocket connection ID from **Amazon DynamoDB** which it uses together with the inbound payload to generate a prompt which it uses to make an invoke with response stream SDK call to **Amazon Bedrock**, specifying **Amazon Nova Pro** as the LLM model.
13. **Amazon Bedrock** streams the response to the Utterance Handler which assembles the tokens into movie records which it passes to **AWS Lambda** function Movie Database Handler.
14. The Movie Database Handler constructs a query which it executes against an **Amazon OpenSearch Service** dataset containing IMDb data, validating the results and returning them to Utterance Handler.
15. The Utterance Handler **AWS Lambda** function constructs the movie records as HTML and streams them via the **Amazon API Gateway** WebSocket targeted at the connection ID. Once all movie records are returned, the function appends the history in the **Amazon DynamoDB** table.
16. The client receives HTML updates via the **Amazon API Gateway** WebSocket connection and uses JavaScript to update the user interface.

## Deployment

1. Prerequisites:
   - AWS account with appropriate permissions
   - Domain name configured in Route53
   - SSL certificate in ACM

2. Environment Configuration:
   - Update domain name in stack configuration
   - Configure Bedrock model settings
   - Set up OpenSearch index parameters

3. Deployment Steps:

```bash
# Update configuration
vim lib/movie-search-voice-chatbot-stack.ts

# Deploy infrastructure
cdk deploy

# Verify deployment
cdk diff
```

4. Post-deployment:

- Configure DNS records
- Verify SSL certificate status
- Test WebSocket connectivity
- Monitor CloudWatch logs